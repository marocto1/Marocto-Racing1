/*
 * Phase 7 drivetrain layer for Marocto Racing.
 *
 * Builds on Phase 6 road grip + Phase 5/4 four-wheel physics and adds a
 * stateful transmission layer that works with the existing per-wheel omega,
 * slip and MW-family differential data:
 * - progressive launch clutch
 * - shift torque cut / clutch recovery
 * - low-speed launch wheelspin window instead of immediate TCS strangling
 * - standing burnout mode (service brake + throttle)
 * - axle LSD and AWD center coupling using MW differential values
 * - additional gear/RPM-dependent engine braking
 * - engine RPM free-rev blend while the clutch is open
 *
 * The underlying MW-family handling adaptation remains MPL-2.0 derived from
 * the public UndercoverMWPhysics project.
 */

import {
  createVehicle as createPhase6Vehicle,
  stepVehicle as stepPhase6Vehicle,
  collideBarrier,
  collideCars,
  resetVehicle as resetPhase6Vehicle,
  FIXED_DT,
  MW6_INTERNALS
} from './physics-mw2005-grip.js';

export {FIXED_DT,collideBarrier,collideCars};
export const PHYSICS_PROFILE='mw2005-full-drivetrain-phase7';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const ramp=(v,a,b)=>clamp((v-a)/Math.max(1e-6,b-a),0,1);

function setupDrivetrain(car){
  const p6=car.phase6;
  car.phase7={
    model:'mw2005-stateful-drivetrain-phase7',
    clutch:1,
    clutchTarget:1,
    shiftCut:0,
    shiftDuration:Math.max(.10,Math.min(.55,car.mw?.transmission?.shiftSpeed||.22)),
    shiftEvents:0,
    lastGear:car.gear,
    launchActive:false,
    burnoutActive:false,
    wheelspin:0,
    drivenSlip:0,
    engineRPM:car.rpm||car.mw?.engine?.idle||900,
    engineBrake:0,
    diffFront:0,
    diffRear:0,
    diffCenter:0,
    torqueCut:1,
    baseAssist:{
      tcsSlipStart:p6?.tcsSlipStart??.12,
      tcsSlipFull:p6?.tcsSlipFull??.52,
      tcsMinThrottle:p6?.tcsMinThrottle??.34,
      absRelease:p6?.absRelease??.52
    }
  };
  car.drivetrainModel='mw2005-clutch-lsd-launch-phase7';
  return car;
}

function resetDrivetrain(car){
  if(!car.phase7)return setupDrivetrain(car);
  const p=car.phase7;
  Object.assign(p,{
    clutch:1,clutchTarget:1,shiftCut:0,shiftEvents:0,lastGear:car.gear,
    launchActive:false,burnoutActive:false,wheelspin:0,drivenSlip:0,
    engineRPM:car.rpm||car.mw?.engine?.idle||900,engineBrake:0,
    diffFront:0,diffRear:0,diffCenter:0,torqueCut:1
  });
}

function tuneAssists(car,launch,burnout){
  const p=car.phase7,b=p.baseAssist,a=car.phase6;
  if(!a)return;
  if(burnout){
    a.tcsSlipStart=.50;a.tcsSlipFull=1.80;a.tcsMinThrottle=.82;
    // A standing burnout needs the non-driven axle to stay held. Do not let
    // the ABS feedback from the previous frame release the pedal globally.
    a.absRelease=1;
  }else if(launch){
    a.tcsSlipStart=.24;a.tcsSlipFull=.92;a.tcsMinThrottle=.58;
    a.absRelease=b.absRelease;
  }else{
    a.tcsSlipStart=b.tcsSlipStart;a.tcsSlipFull=b.tcsSlipFull;
    a.tcsMinThrottle=b.tcsMinThrottle;a.absRelease=b.absRelease;
  }
}

function preprocessDrivetrain(car,input,dt){
  const p=car.phase7,speed=Math.hypot(car.vx,car.vz);
  const throttle=clamp(input.throttle||0,0,1),brake=clamp(input.brake||0,0,1);
  const burnout=throttle>.78&&brake>.46&&speed<7.5;
  const launch=throttle>.56&&speed<10&&!burnout&&car.gear>=0;
  p.burnoutActive=burnout;p.launchActive=launch;
  p.shiftCut=Math.max(0,p.shiftCut-dt);

  if(p.shiftCut>0)p.clutchTarget=.30;
  else if(burnout)p.clutchTarget=.88;
  else if(launch)p.clutchTarget=lerp(.52,1,ramp(speed,1.2,9.5));
  else p.clutchTarget=1;

  const clutchRate=p.clutchTarget<p.clutch?10:5.5;
  p.clutch+=clamp(p.clutchTarget-p.clutch,-clutchRate*dt,clutchRate*dt);
  p.clutch=clamp(p.clutch,.2,1);

  let shiftFactor=1;
  if(p.shiftCut>0){
    const q=clamp(p.shiftCut/Math.max(.01,p.shiftDuration),0,1);
    shiftFactor=lerp(.62,1,1-q);
  }
  // The clutch still transmits some torque during launch; this creates a
  // smooth bite point instead of an on/off keyboard launch.
  const clutchTorque=lerp(.55,1,p.clutch);
  p.torqueCut=shiftFactor*clutchTorque;
  tuneAssists(car,launch,burnout);

  return {...input,throttle:throttle*p.torqueCut,brake};
}

function axleDriven(car,axle){
  const split=clamp(car.mw?.transmission?.split??0,0,1);
  return axle===0?split>0:split<1;
}

function couplePair(left,right,lock,throttle,dt){
  lock=clamp(lock||0,0,1);
  if(lock<=0)return 0;
  const before=Math.abs(left.omega-right.omega);
  if(before<1e-5)return 0;
  const rate=(2.5+lock*12.5)*lerp(.72,1.25,clamp(throttle,0,1));
  const blend=1-Math.exp(-dt*rate);
  const avg=(left.omega+right.omega)*.5;
  left.omega=lerp(left.omega,avg,blend);
  right.omega=lerp(right.omega,avg,blend);
  return before-Math.abs(left.omega-right.omega);
}

function applyLSD(car,throttle,dt){
  const p=car.phase7,t=car.mw?.transmission,d=t?.diff||[0,0,0];
  p.diffFront=axleDriven(car,0)?couplePair(car.wheels[0],car.wheels[1],d[0],throttle,dt):0;
  p.diffRear=axleDriven(car,1)?couplePair(car.wheels[2],car.wheels[3],d[1],throttle,dt):0;
  p.diffCenter=0;
  const split=clamp(t?.split??0,0,1),center=clamp(d[2]||0,0,1);
  if(split>0&&split<1&&center>0){
    const front=(car.wheels[0].omega+car.wheels[1].omega)*.5;
    const rear=(car.wheels[2].omega+car.wheels[3].omega)*.5;
    const before=Math.abs(front-rear),blend=1-Math.exp(-dt*(1.8+center*8)*lerp(.7,1.15,throttle));
    // Preserve the configured front/rear split while suppressing runaway axle
    // speed differences. Wheel radii are common in the current planar solver.
    const common=front*split+rear*(1-split);
    const fTarget=lerp(front,common,blend),rTarget=lerp(rear,common,blend);
    const fd=fTarget-front,rd=rTarget-rear;
    car.wheels[0].omega+=fd;car.wheels[1].omega+=fd;
    car.wheels[2].omega+=rd;car.wheels[3].omega+=rd;
    p.diffCenter=before-Math.abs(fTarget-rTarget);
  }
}

function measureWheelspin(car){
  let maxSlip=0,count=0,sum=0;
  for(const w of car.wheels||[]){
    if(!MW6_INTERNALS.drivenWheel(car,w))continue;
    const denom=Math.max(3,Math.abs(w.roadSpeed||car.longitudinal||0));
    const slip=Math.abs(w.slipSpeed||0)/denom;
    maxSlip=Math.max(maxSlip,slip);sum+=slip;count++;
  }
  car.phase7.wheelspin=maxSlip;
  car.phase7.drivenSlip=count?sum/count:0;
  return maxSlip;
}

function updateEngineRPM(car,input,dt){
  const p=car.phase7,e=car.mw.engine;
  const throttle=clamp(input.throttle||0,0,1),coupled=clamp(p.clutch,0,1);
  const wheelRPM=clamp(car.rpm||e.idle,e.idle,e.maxRpm||e.redline*1.08);
  const freeRPM=lerp(e.idle,e.redline*.92,Math.pow(throttle,.72));
  const target=lerp(freeRPM,wheelRPM,coupled);
  const response=target>p.engineRPM?12:16;
  p.engineRPM+= (target-p.engineRPM)*(1-Math.exp(-dt*response));
  p.engineRPM=clamp(p.engineRPM,e.idle,e.maxRpm||e.redline*1.08);
  car.rpm=p.engineRPM;
}

function applyEngineBraking(car,input,dt){
  const p=car.phase7,throttle=clamp(input.throttle||0,0,1),brake=clamp(input.brake||0,0,1);
  p.engineBrake=0;
  if(throttle>.04||brake>.04||car.gear<1||p.clutch<.45)return;
  let {forward,lateral}=MW6_INTERNALS.bodyVelocity(car);
  if(Math.abs(forward)<2.5)return;
  const e=car.mw.engine,maxGear=Math.max(1,car.shiftPoints?.up?.length||6);
  const rpmNorm=ramp(p.engineRPM,e.idle,e.redline),gearFactor=lerp(1.24,.82,(car.gear-1)/Math.max(1,maxGear-1));
  const decel=(.28+1.05*rpmNorm)*gearFactor*p.clutch;
  const delta=Math.min(Math.abs(forward),decel*dt);
  forward-=Math.sign(forward)*delta;
  MW6_INTERNALS.setBodyVelocity(car,forward,lateral);
  p.engineBrake=decel;
}

function detectShift(car,oldGear){
  const p=car.phase7;
  if(car.gear!==oldGear&&oldGear>0&&car.gear>0){
    p.shiftEvents++;
    p.shiftCut=p.shiftDuration;
    p.clutch=Math.min(p.clutch,.34);
  }
  p.lastGear=car.gear;
}

export function createVehicle(spec,p,track){return setupDrivetrain(createPhase6Vehicle(spec,p,track));}

export function stepVehicle(car,input,track,dt=FIXED_DT){
  if(!car.phase7)setupDrivetrain(car);
  const oldGear=car.gear;
  const processed=preprocessDrivetrain(car,input,dt);
  stepPhase6Vehicle(car,processed,track,dt);
  detectShift(car,oldGear);
  applyLSD(car,clamp(input.throttle||0,0,1),dt);
  measureWheelspin(car);
  updateEngineRPM(car,input,dt);
  applyEngineBraking(car,input,dt);
}

export function resetVehicle(car,track){
  const ok=resetPhase6Vehicle(car,track);
  if(ok)resetDrivetrain(car);
  return ok;
}

export const MW7_INTERNALS={
  setupDrivetrain,resetDrivetrain,tuneAssists,preprocessDrivetrain,couplePair,
  applyLSD,measureWheelspin,updateEngineRPM,applyEngineBraking,detectShift,axleDriven
};
