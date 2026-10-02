/*
 * Phase 6 road-grip and drivetrain-control layer for Marocto Racing.
 *
 * This keeps the Phase 5 MW-family four-wheel suspension solver intact and
 * adds a road-focused control layer tuned for digital PC steering:
 * - steering command shaping for keyboard input
 * - traction-control throttle modulation from driven-wheel slip
 * - ABS-style service-brake release when a wheel is about to stay locked
 * - ESC-like yaw-rate correction and lateral-velocity recovery
 * - explicit handbrake drift remains available
 *
 * The underlying MW-family tire/drivetrain/suspension adaptation remains
 * MPL-2.0 derived from the public UndercoverMWPhysics project.
 */

import {
  createVehicle as createPhase5Vehicle,
  stepVehicle as stepPhase5Vehicle,
  collideBarrier,
  collideCars,
  resetVehicle as resetPhase5Vehicle,
  FIXED_DT
} from './physics-mw2005-suspension.js';

export {FIXED_DT,collideBarrier,collideCars};
export const PHYSICS_PROFILE='mw2005-grip-drivetrain-phase6';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const ramp=(v,a,b)=>clamp((v-a)/Math.max(1e-6,b-a),0,1);
const DEG=Math.PI/180;

const DEFAULTS={
  steerRise:4.4,
  steerReturn:7.5,
  steerHighSpeedScale:.82,
  tcsSlipStart:.12,
  tcsSlipFull:.52,
  tcsMinThrottle:.34,
  absRelease:.52,
  escYawBase:2.4,
  escYawSlip:6.8,
  lateralRecoveryBase:.75,
  lateralRecoverySlip:4.8,
  driftRecovery:7.0,
  roadDriftCap:.18,
  spinCatchYaw:1.9
};

function drivenWheel(car,w){
  const split=clamp(car.mw?.transmission?.split??0,0,1);
  return (w.axle===0&&split>0)||(w.axle===1&&split<1);
}

function bodyVelocity(car){
  const s=Math.sin(car.a),c=Math.cos(car.a);
  return {
    forward:car.vx*s+car.vz*c,
    lateral:car.vx*c-car.vz*s
  };
}

function setBodyVelocity(car,forward,lateral){
  const s=Math.sin(car.a),c=Math.cos(car.a);
  car.vx=s*forward+c*lateral;
  car.vz=c*forward-s*lateral;
  car.longitudinal=forward;
  car.lateral=lateral;
  car.v=forward;
}

function setupAssist(car){
  car.phase6={
    ...DEFAULTS,
    steerCommand:0,
    throttleCommand:0,
    tcsActive:false,
    absActive:false,
    escActive:false,
    drivenSlip:0,
    serviceLocks:0,
    targetYaw:0,
    slipAngle:0,
    inputThrottle:0,
    outputThrottle:0,
    inputBrake:0,
    outputBrake:0
  };
  car.assistModel='road-grip-tcs-abs-esc';
  return car;
}

function resetAssist(car){
  if(!car.phase6)return setupAssist(car);
  Object.assign(car.phase6,{
    steerCommand:0,
    throttleCommand:0,
    tcsActive:false,
    absActive:false,
    escActive:false,
    drivenSlip:0,
    serviceLocks:0,
    targetYaw:0,
    slipAngle:0,
    inputThrottle:0,
    outputThrottle:0,
    inputBrake:0,
    outputBrake:0
  });
}

function shapeSteering(car,input,dt,speed){
  const p=car.phase6,raw=clamp(input.steer||0,-1,1);
  const highSpeed=lerp(1,p.steerHighSpeedScale,ramp(speed,24,55));
  const target=raw*highSpeed;
  const rate=Math.abs(target)>Math.abs(p.steerCommand)?p.steerRise:p.steerReturn;
  p.steerCommand+=clamp(target-p.steerCommand,-rate*dt,rate*dt);
  if(Math.abs(raw)<.001&&Math.abs(p.steerCommand)<.002)p.steerCommand=0;
  return p.steerCommand;
}

function tractionControl(car,throttle,speed){
  const p=car.phase6;
  let maxSlip=0;
  for(const w of car.wheels||[]){
    if(!drivenWheel(car,w))continue;
    const denom=Math.max(3,Math.abs(w.roadSpeed||car.longitudinal||0));
    maxSlip=Math.max(maxSlip,Math.abs(w.slipSpeed||0)/denom);
  }
  p.drivenSlip=maxSlip;
  p.tcsActive=false;
  if(throttle<=0||speed<3||maxSlip<=p.tcsSlipStart)return throttle;
  const intervention=ramp(maxSlip,p.tcsSlipStart,p.tcsSlipFull);
  const limited=throttle*lerp(1,p.tcsMinThrottle,intervention);
  p.tcsActive=limited<throttle-.01;
  return limited;
}

function absControl(car,brake,handbrake){
  const p=car.phase6;
  let locks=0;
  for(const w of car.wheels||[]){
    if(w.brakeLocked&&(w.ebrakeInput||0)<.5)locks++;
  }
  p.serviceLocks=locks;
  p.absActive=false;
  if(handbrake||brake<=0||locks===0)return brake;
  p.absActive=true;
  return brake*p.absRelease;
}

function preprocess(car,input,dt){
  const p=car.phase6,speed=Math.hypot(car.vx,car.vz),handbrake=(input.handbrake||0)>.5;
  const rawThrottle=clamp(input.throttle||0,0,1),rawBrake=clamp(input.brake||0,0,1);
  p.inputThrottle=rawThrottle;p.inputBrake=rawBrake;

  const throttleTarget=tractionControl(car,rawThrottle,speed);
  const rise=throttleTarget>p.throttleCommand?7.5:14;
  p.throttleCommand+=clamp(throttleTarget-p.throttleCommand,-rise*dt,rise*dt);
  const brakeOut=absControl(car,rawBrake,handbrake);
  p.outputThrottle=p.throttleCommand;p.outputBrake=brakeOut;

  return {
    ...input,
    steer:shapeSteering(car,input,dt,speed),
    throttle:p.throttleCommand,
    brake:brakeOut,
    handbrake:input.handbrake||0
  };
}

function stabilizeRoadCar(car,originalInput,dt){
  const p=car.phase6,handbrake=(originalInput.handbrake||0)>.5;
  let {forward,lateral}=bodyVelocity(car);
  const speed=Math.hypot(forward,lateral),slip=Math.abs(forward)<.8?0:Math.atan2(lateral,Math.abs(forward));
  const absSlip=Math.abs(slip),steer=Math.abs(originalInput.steer||0);
  p.slipAngle=slip;p.escActive=false;

  if(!handbrake){
    // Do not let ordinary keyboard cornering automatically enter the deep
    // MW drift-friction state. Handbrake still bypasses this cap.
    const roadDrift=ramp(absSlip,14*DEG,28*DEG)*p.roadDriftCap;
    car.driftValue=Math.min(car.driftValue||0,roadDrift);
    car.driftValue*=Math.exp(-dt*p.driftRecovery);

    const slipFactor=ramp(absSlip,4*DEG,24*DEG);
    const wb=Math.max(1.8,car.spec?.wheelbase||2.6);
    let targetYaw=(forward/wb)*Math.tan(car.steerAngle||0);
    targetYaw=clamp(targetYaw,-2.15,2.15);
    p.targetYaw=targetYaw;

    const yawGain=p.escYawBase+p.escYawSlip*slipFactor;
    const yawBlend=1-Math.exp(-dt*yawGain);
    const oldYaw=car.yawRate||0;
    car.yawRate=lerp(oldYaw,targetYaw,yawBlend);

    const lateralGain=p.lateralRecoveryBase+p.lateralRecoverySlip*slipFactor;
    // Preserve some natural slip at turn-in; remove the runaway portion that
    // causes snap-oversteer and endless fishtailing on digital steering.
    const preserve=lerp(1,.35,slipFactor);
    const recovered=lateral*Math.exp(-dt*lateralGain);
    lateral=lerp(lateral,recovered,1-preserve*.18);

    // At very large unintended slip angles, catch the spin more aggressively
    // without instantly snapping the car straight.
    if(absSlip>30*DEG&&speed>9){
      const catchBlend=1-Math.exp(-dt*p.spinCatchYaw);
      car.yawRate=lerp(car.yawRate,targetYaw,catchBlend);
      lateral*=Math.exp(-dt*2.2);
    }

    p.escActive=slipFactor>.08||Math.abs(car.yawRate-targetYaw)>.18;
    setBodyVelocity(car,forward,lateral);
  }else{
    // Handbrake remains the intentional drift mode. Only prevent numerical
    // spin escalation beyond a controllable range.
    p.targetYaw=car.yawRate||0;
    if(absSlip>55*DEG&&speed>8){
      car.yawRate*=Math.exp(-dt*.9);
      lateral*=Math.exp(-dt*.35);
      setBodyVelocity(car,forward,lateral);
    }
  }
}

export function createVehicle(spec,p,track){
  return setupAssist(createPhase5Vehicle(spec,p,track));
}

export function stepVehicle(car,input,track,dt=FIXED_DT){
  if(!car.phase6)setupAssist(car);
  const shaped=preprocess(car,input,dt);
  stepPhase5Vehicle(car,shaped,track,dt);
  stabilizeRoadCar(car,input,dt);
}

export function resetVehicle(car,track){
  const ok=resetPhase5Vehicle(car,track);
  if(ok)resetAssist(car);
  return ok;
}

export const MW6_INTERNALS={bodyVelocity,setBodyVelocity,shapeSteering,tractionControl,absControl,preprocess,stabilizeRoadCar,setupAssist,drivenWheel};
