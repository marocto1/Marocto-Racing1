/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * Phase 4 extends Marocto Racing's MPL-2.0 MW2005 adaptation with a planar
 * four-wheel solver. It keeps the public UndercoverMWPhysics-derived torque,
 * steering, tire and handling data used by Phase 3, but each wheel now owns
 * independent load, angular velocity, slip, brake-lock and tire-force state.
 *
 * Upstream reference:
 * https://github.com/gaycoderprincess/UndercoverMWPhysics
 */

import {SURFACES} from './track.js';
import {
  createVehicle as createPhase3Vehicle,
  collideBarrier,
  collideCars,
  resetVehicle as resetPhase3Vehicle,
  FIXED_DT,
  MW_INTERNALS
} from './physics-mw2005.js';

export {FIXED_DT,collideBarrier,collideCars};
export const PHYSICS_PROFILE='mw2005-four-wheel-phase4';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const ramp=(v,a,b)=>clamp((v-a)/(b-a),0,1);
const FTLB_TO_NM=1.3558179483314;
const MPH=.44704;
const WHEEL_RADIUS=.35;
const WHEEL_INERTIA=10;
const BRAKING_TORQUE=4;
const EBRAKING_TORQUE=10;
const STATIC_TO_DYNAMIC_BRAKE=1.2;
const BRAKE_LOCK_ANGULAR_FACTOR=100;
const TIRE_ELLIPSE=1.5;
const INV_TIRE_ELLIPSE=1/TIRE_ELLIPSE;
const CG_HEIGHT=.50;
const LBIN_TO_NM=175.126835;
const OFF_THROTTLE_DRAG=2;
const ROLLING_FRICTION=2;

const STEERING_RANGE=[40,20,10,5.5,4.5,3.25,2.9,2.9,2.9,2.9];
const STEERING_SPEED=[1,1,1,.56,.5,.35,.3,.3,.3,.3];
const STEERING_RANGE_COEFF=[1,1,1.1,1.2,1.25,1.35];
const GRIP_VS_SPEED=[.833,.958,1.008,1.0167,1.033,1.033,1.033,1.0167,1,1];
const TRACTION_VS_SPEED=[.909,1.045,1.09,1.09,1.09,1.09,1.09,1.045,1,1];
const DRIFT_REAR_FRICTION=[1.1,.95,.87,.77,.67,.6,.51,.43,.37,.34];

function table(values,x,min=0,max=1){
  if(values.length===1)return values[0];
  const f=clamp((x-min)/(max-min),0,1)*(values.length-1),i=Math.floor(f),j=Math.min(values.length-1,i+1);
  return lerp(values[i],values[j],f-i);
}
function forwardRatios(mw){return mw.transmission.ratios.slice(2).filter(v=>v>0);}
function inductionRPM(mw){
  const e=mw.engine,i=mw.induction;return i?i.spool*(e.redline-e.idle)+e.idle:e.redline;
}
function inductionBoostAt(mw,rpm,spool=1){
  const i=mw.induction,e=mw.engine;if(!i)return 0;
  const spoolRpm=inductionRPM(mw);let boost=0;
  if(rpm>=spoolRpm)boost=lerp(i.low,i.high,ramp(rpm,spoolRpm,e.redline));
  else if(i.vacuum<0)boost=ramp(rpm,e.idle,spoolRpm)*i.vacuum;
  return boost*clamp(spool,0,1);
}
function engineBrakeFactor(mw,rpm){
  const e=mw.engine;return table(e.braking,clamp(rpm,e.idle,e.redline),e.idle,e.maxRpm);
}
function lateralGripScale(speed){return table(GRIP_VS_SPEED,ramp(speed,0,85*MPH))*1.2;}
function tractionScale(speed){return table(TRACTION_VS_SPEED,ramp(speed,0,85*MPH))*1.1;}
function pilotFactor(speed){return lerp(.85,1,ramp(speed,30*MPH,50*MPH));}
function maxSlip(speed){return .5+ramp(speed,10,71);}

function ackermann(center,wheelbase,trackWidth){
  if(Math.abs(center)<1e-6)return [center,center];
  const sign=Math.sign(center),angle=Math.abs(center),radius=Math.abs(wheelbase/Math.tan(angle));
  const inside=Math.atan(wheelbase/Math.max(.05,radius-trackWidth*.5));
  const outside=Math.atan(wheelbase/(radius+trackWidth*.5));
  return sign>0?[sign*outside,sign*inside]:[sign*inside,sign*outside];
}
function wheelBaseState(index,x,z,axle,load){
  const front=axle===0,left=index===0||index===2;
  return {index,name:(front?'F':'R')+(left?'L':'R'),x,z,axle,front,left,steer:0,load,targetLoad:load,compression:0,omega:0,angularAcc:0,roadSpeed:0,slipSpeed:0,slipAngle:0,traction:1,brakeLocked:false,driveTorque:0,engineBrakeTorque:0,brakeTorque:0,brakeInput:0,ebrakeInput:0,longForce:0,latForce:0,spin:0,surface:'asphalt',contact:{},worldX:0,worldZ:0};
}
function setupWheels(car){
  const bias=car.mw.chassis.frontBias*.01,wb=car.spec.wheelbase,trackWidth=car.spec.width*.82,half=trackWidth*.5;
  const lf=wb*(1-bias),lr=wb*bias,weight=car.spec.mass*9.81,front=weight*bias,rear=weight*(1-bias);
  car.trackWidth=trackWidth;car.cgToFront=lf;car.cgToRear=lr;
  car.wheels=[
    wheelBaseState(0,-half,lf,0,front*.5),
    wheelBaseState(1, half,lf,0,front*.5),
    wheelBaseState(2,-half,-lr,1,rear*.5),
    wheelBaseState(3, half,-lr,1,rear*.5)
  ];
  car.latAccel=0;car.wheelModel='four-wheel-planar';car.wheelLoads=car.wheels.map(w=>w.load);
  car.frontLoad=front;car.rearLoad=rear;
  return car;
}
function resetWheelStates(car){
  const bias=car.mw.chassis.frontBias*.01,weight=car.spec.mass*9.81,front=weight*bias,rear=weight*(1-bias);
  for(const w of car.wheels){
    w.load=w.targetLoad=(w.axle===0?front:rear)*.5;w.compression=0;w.omega=0;w.angularAcc=0;w.roadSpeed=0;w.slipSpeed=0;w.slipAngle=0;w.traction=1;w.brakeLocked=false;w.driveTorque=0;w.engineBrakeTorque=0;w.brakeTorque=0;w.brakeInput=0;w.ebrakeInput=0;w.longForce=0;w.latForce=0;w.spin=0;w.surface='asphalt';w.contact={};
  }
  car.latAccel=0;car.wheelLoads=car.wheels.map(w=>w.load);
}
function queryWheelSurface(car,w,track){
  const s=Math.sin(car.a),c=Math.cos(car.a);
  w.worldX=car.x+c*w.x+s*w.z;w.worldZ=car.z-s*w.x+c*w.z;
  track.query(w.worldX,w.worldZ,w.contact);w.surface=w.contact.surface;return SURFACES[w.surface]||SURFACES.asphalt;
}
function steeringTarget(car,steerInput,throttle,brake,handbrake,forward,dt){
  const mw=car.mw;
  let maxSteerDeg=table(STEERING_RANGE,Math.max(0,forward),0,160);
  const tb=1-(throttle+1-(brake+(handbrake?1:0))*.5)*.5;
  maxSteerDeg*=1.45*tb*table(STEERING_SPEED,Math.max(0,forward),0,160)+1;
  maxSteerDeg*=table(STEERING_RANGE_COEFF,Math.abs(steerInput),0,1);
  const rearSlipDeg=Math.abs(car.slipAngle)*180/Math.PI;
  if(steerInput*car.slipAngle>0)maxSteerDeg=Math.max(maxSteerDeg,Math.min(45,rearSlipDeg));
  maxSteerDeg=Math.min(45,maxSteerDeg)*mw.tires.steering;
  const target=-steerInput*maxSteerDeg*Math.PI/180;
  const steerRate=180*table(STEERING_SPEED,Math.max(0,forward),0,160)*mw.tires.steering*Math.PI/180;
  car.steerAngle+=clamp(target-car.steerAngle,-steerRate*dt,steerRate*dt);
  const pair=ackermann(car.steerAngle,car.spec.wheelbase,car.trackWidth);
  car.wheels[0].steer=pair[0];car.wheels[1].steer=pair[1];car.wheels[2].steer=0;car.wheels[3].steer=0;
}
function drivenRoadSpeed(car,forward){
  const split=clamp(car.mw.transmission.split,0,1),driven=[];
  for(const w of car.wheels)if((w.axle===0&&split>0)||(w.axle===1&&split<1))driven.push(w);
  if(!driven.length)return forward;
  const avg=driven.reduce((sum,w)=>sum+Math.abs(w.omega*WHEEL_RADIUS),0)/driven.length;
  return Math.sign(Math.abs(forward)>.05?forward:1)*avg;
}
function updateDrivetrain(car,forward,throttle,dt,forceReverse=false){
  const mw=car.mw,e=mw.engine,ratios=forwardRatios(mw),gb=car.shiftPoints;
  car.shiftTimer=Math.max(0,car.shiftTimer-dt);
  if(forceReverse||forward<-.8){car.gear=-1;car.rpm=clamp(e.idle+Math.abs(forward)*180,e.idle,e.redline);}
  else{
    if(car.gear<1)car.gear=1;
    const driveSpeed=drivenRoadSpeed(car,forward);
    car.rpm=MW_INTERNALS.rpmForSpeed(mw,Math.abs(driveSpeed)>.25?driveSpeed:forward,car.gear);
    if(car.shiftTimer<=0){
      const gi=car.gear-1;
      if(car.rpm>=gb.up[gi]&&car.gear<ratios.length){car.gear++;car.shiftTimer=mw.transmission.shiftSpeed;}
      else if(car.gear>1&&car.rpm<gb.down[gi]&&Math.abs(forward)>4){car.gear--;car.shiftTimer=mw.transmission.shiftSpeed;}
      else if(throttle>.82&&car.gear>1&&car.rpm<gb.down[gi]*1.18&&Math.abs(forward)>7){car.gear--;car.shiftTimer=mw.transmission.shiftSpeed;}
      car.rpm=MW_INTERNALS.rpmForSpeed(mw,Math.abs(driveSpeed)>.25?driveSpeed:forward,car.gear);
    }
  }
  const ind=mw.induction;
  if(ind){
    const wants=throttle>.15&&car.rpm>inductionRPM(mw)*.85;
    car.spool=clamp(car.spool+(wants?dt/Math.max(.05,ind.up):-dt/Math.max(.05,ind.down)),0,1);
  }else car.spool=0;
}
function driftFriction(car,input,dt,speed){
  const slip=car.slipAngle,enter=speed>30*MPH&&((input.handbrake||0)>.5||Math.abs(slip)>12*Math.PI/180||(input.throttle||0)*Math.abs(slip)>12*Math.PI/180);
  car.driftValue=clamp(car.driftValue+(enter?8:-2)*dt,0,1);
  if(car.driftValue<=0)return 1;
  const counter=((input.steer||0)*slip>0)?Math.abs(input.steer||0):0;
  const coeff=Math.abs(slip)*.5+counter*4+Math.abs(car.yawRate)*.5;
  return table(DRIFT_REAR_FRICTION,clamp(coeff*car.driftValue,0,1));
}
function yawControlLimit(car,speed){
  const top=forwardRatios(car.mw).length,maxSpeed=MW_INTERNALS.speedForRpm(car.mw,car.mw.engine.redline,top),pct=clamp(Math.abs(speed)/Math.max(1,maxSpeed),0,1);
  return table(car.mw.tires.yaw,pct);
}
function updateWheelLoads(car,speed){
  const mw=car.mw,mass=car.spec.mass,weight=mass*9.81,bias=mw.chassis.frontBias*.01,wb=car.spec.wheelbase;
  const downforce=speed*2*mw.chassis.aero*1000,transfer=mass*clamp(car.longAccel,-18,18)*CG_HEIGHT/wb;
  const aeroFront=downforce*(mw.chassis.aeroCg*.01),aeroRear=downforce-aeroFront;
  const front=clamp(weight*bias-transfer+aeroFront,weight*.15,weight*.90),rear=clamp(weight*(1-bias)+transfer+aeroRear,weight*.10,weight*.90);
  const totalLatTransfer=mass*clamp(car.latAccel,-20,20)*CG_HEIGHT/Math.max(1.1,car.trackWidth);
  const sum=Math.max(1,front+rear),frontDiff=totalLatTransfer*(front/sum),rearDiff=totalLatTransfer*(rear/sum);
  const targets=[front*.5+frontDiff*.5,front*.5-frontDiff*.5,rear*.5+rearDiff*.5,rear*.5-rearDiff*.5];
  const minLoad=weight*.025;
  for(let i=0;i<4;i++){
    const w=car.wheels[i],axleTotal=w.axle===0?front:rear;
    w.targetLoad=clamp(targets[i],minLoad,Math.max(minLoad,axleTotal-minLoad));
    const spring=Math.max(1,mw.chassis.springs[w.axle]*LBIN_TO_NM),response=7+Math.min(10,spring/15000);
    w.load+= (w.targetLoad-w.load)*(1-Math.exp(-FIXED_DT*response));
    w.compression=clamp(w.load/spring,0,.25);
  }
  car.frontLoad=car.wheels[0].load+car.wheels[1].load;car.rearLoad=car.wheels[2].load+car.wheels[3].load;
  car.wheelLoads=car.wheels.map(w=>w.load);
}
function splitPair(total,left,right,lock){
  if(Math.abs(total)<1e-9)return [0,0];
  const bias=clamp((left.traction-right.traction)*clamp(lock,0,1)*.20,-.18,.18);
  return [total*(.5+bias),total*(.5-bias)];
}
function assignDriveTorques(car,driveInput,reverse){
  const mw=car.mw,t=mw.transmission,e=mw.engine;
  for(const w of car.wheels){w.driveTorque=0;w.engineBrakeTorque=0;}
  if(driveInput<=0)return;
  const ratios=forwardRatios(mw),gi=Math.max(0,car.gear-1);
  const gearRatio=reverse?Math.abs(t.ratios[0]):(ratios[gi]||ratios[0]);
  const eff=reverse?1:(t.eff[gi+2]??1),torqueNm=MW_INTERNALS.torqueFtLb(mw,car.rpm)*FTLB_TO_NM*(1+inductionBoostAt(mw,car.rpm,car.spool));
  const nos=car.boost&&!reverse?1.45:1,clutch=car.shiftTimer>0?.25:1,sign=reverse?-1:1;
  const total=sign*driveInput*torqueNm*gearRatio*t.final*eff*nos*clutch;
  let frontShare=clamp(t.split,0,1);
  if(frontShare>0&&frontShare<1){
    const fg=(car.wheels[0].traction+car.wheels[1].traction)*.5,rg=(car.wheels[2].traction+car.wheels[3].traction)*.5,center=t.diff[2]??0;
    frontShare=clamp(frontShare+(fg-rg)*center*.12,.2,.8);
  }
  const frontPair=splitPair(total*frontShare,car.wheels[0],car.wheels[1],t.diff[0]??0);
  const rearPair=splitPair(total*(1-frontShare),car.wheels[2],car.wheels[3],t.diff[1]??0);
  car.wheels[0].driveTorque=frontPair[0];car.wheels[1].driveTorque=frontPair[1];car.wheels[2].driveTorque=rearPair[0];car.wheels[3].driveTorque=rearPair[1];
}
function assignEngineBraking(car,forward,throttle,brake){
  if(throttle>=.02||brake>=.02||Math.abs(forward)<=1||car.gear<1)return;
  const mw=car.mw,t=mw.transmission,ratios=forwardRatios(mw),gi=Math.max(0,car.gear-1),ratio=ratios[gi]||1;
  const engineNm=MW_INTERNALS.torqueFtLb(mw,car.rpm)*FTLB_TO_NM*engineBrakeFactor(mw,car.rpm),total=-Math.sign(forward)*engineNm*ratio*t.final*.30;
  const frontShare=clamp(t.split,0,1),fp=splitPair(total*frontShare,car.wheels[0],car.wheels[1],t.diff[0]??0),rp=splitPair(total*(1-frontShare),car.wheels[2],car.wheels[3],t.diff[1]??0);
  car.wheels[0].engineBrakeTorque=fp[0];car.wheels[1].engineBrakeTorque=fp[1];car.wheels[2].engineBrakeTorque=rp[0];car.wheels[3].engineBrakeTorque=rp[1];
}
function assignBrakes(car,brake,handbrake,throttle,forward){
  const mw=car.mw,speedMph=Math.abs(forward)/MPH;
  for(const w of car.wheels){
    let b=brake;
    const driven=Math.abs(w.driveTorque)>1e-6;
    if(throttle>.8&&brake>.5&&speedMph<10&&driven)b=speedMph*.05;
    w.brakeInput=clamp(b,0,1);w.ebrakeInput=w.axle===1&&handbrake?1:0;
    w.brakeTorque=w.brakeInput*mw.brakes.torque[w.axle]*FTLB_TO_NM*BRAKING_TORQUE+w.ebrakeInput*mw.brakes.ebrake*FTLB_TO_NM*EBRAKING_TORQUE;
  }
}
function checkBrakeLock(car,w,fwdVel,latVel,dynamicFriction){
  const mw=car.mw,lockBrake=w.brakeInput*mw.brakes.lock[w.axle]*mw.brakes.torque[w.axle]*FTLB_TO_NM*BRAKING_TORQUE;
  const lockE=w.ebrakeInput*mw.brakes.ebrake*FTLB_TO_NM*EBRAKING_TORQUE,available=(lockBrake+lockE)*STATIC_TO_DYNAMIC_BRAKE;
  const groundSpeed=Math.hypot(fwdVel,latVel),slipGround=w.load*dynamicFriction/Math.max(.1,groundSpeed),groundForce=Math.abs(fwdVel)*slipGround;
  w.brakeLocked=available>1&&available>groundForce*WHEEL_RADIUS+Math.abs(w.omega)*BRAKE_LOCK_ANGULAR_FACTOR;
  if(w.brakeLocked)w.omega=0;
}
function solveWheel(car,w,surface,speed,dt,rearDrift,rearYawBoost){
  const mw=car.mw,steer=w.steer,c=Math.cos(steer),s=Math.sin(steer);
  const bodyLat=car.lateral+car.yawRate*w.z,bodyFwd=car.longitudinal-car.yawRate*w.x;
  const fwdVel=bodyLat*s+bodyFwd*c,latVel=bodyLat*c-bodyFwd*s,fwdAcc=(fwdVel-w.roadSpeed)/Math.max(dt,1e-4);
  w.roadSpeed=fwdVel;w.slipSpeed=w.omega*WHEEL_RADIUS-fwdVel;w.slipAngle=Math.atan2(latVel,Math.max(.1,Math.abs(fwdVel)));
  const pilot=pilotFactor(speed),tractionBoost=tractionScale(speed)*surface.grip*(w.axle===1?rearYawBoost:1),gripBoost=lateralGripScale(speed)*surface.grip;
  const dynamicFriction=mw.tires.dynamic[w.axle]*tractionBoost*pilot;
  checkBrakeLock(car,w,fwdVel,latVel,dynamicFriction);

  const motionSign=Math.sign(Math.abs(w.omega)>.05?w.omega:fwdVel),brakeOpp=-motionSign*w.brakeTorque;
  let totalTorque=w.driveTorque+w.engineBrakeTorque+brakeOpp;
  if(Math.abs(fwdVel)<1&&w.brakeTorque>0&&Math.abs(w.driveTorque)<1)totalTorque+=-fwdVel*w.load*.15*WHEEL_RADIUS;

  const skidSpeed=Math.hypot(w.slipSpeed,latVel),groundFriction=skidSpeed>1e-6?w.load*dynamicFriction/skidSpeed:0;
  let longForce,latForce;
  if(w.traction<.999||w.brakeLocked){
    longForce=groundFriction*w.slipSpeed;latForce=-groundFriction*latVel;
    if(speed<MPH&&dynamicFriction>.1){longForce/=dynamicFriction;latForce/=dynamicFriction;}
    const torqueLimit=totalTorque/WHEEL_RADIUS;
    if(Math.abs(longForce)>Math.abs(torqueLimit)&&Math.abs(torqueLimit)>0)longForce=torqueLimit;
  }else{
    longForce=totalTorque/WHEEL_RADIUS;
    const mag=MW_INTERNALS.lateralTireForce(mw,w.axle,w.load,w.slipAngle,gripBoost)*pilot;
    latForce=-Math.sign(w.slipAngle||latVel||0)*mag;
  }

  const driving=totalTorque*fwdVel>0&&!w.brakeLocked;
  if(driving)longForce*=TIRE_ELLIPSE;
  const maxForce=w.load*mw.tires.static[w.axle]*tractionBoost*pilot*(w.axle===1?rearDrift:1),len=Math.hypot(longForce,latForce);
  w.traction=1;
  let allowedSlip=maxSlip(speed);
  if(len>maxForce&&len>.001){const q=maxForce/len;w.traction=q;longForce*=q;latForce*=q;allowedSlip*=q*q;}
  else if(driving)longForce*=INV_TIRE_ELLIPSE;
  if(Math.abs(w.slipSpeed)>allowedSlip)w.traction*=allowedSlip/Math.abs(w.slipSpeed);
  if(fwdVel>1)longForce-=Math.sin(w.slipAngle)*latForce*.15/Math.max(.1,mw.tires.gripScale[w.axle]);

  const prevOmega=w.omega;
  if(w.brakeLocked){w.angularAcc=0;w.omega=0;}
  else{
    let angularAcc=w.angularAcc;
    if(w.traction<.999){
      const rolling=ROLLING_FRICTION*(1+surface.rolling*10),effective=totalTorque-longForce*WHEEL_RADIUS-w.omega*rolling;
      angularAcc=effective/WHEEL_INERTIA-(w.traction*w.slipSpeed)/(WHEEL_RADIUS*Math.max(dt,1e-4));
    }
    angularAcc=lerp(angularAcc,fwdAcc/WHEEL_RADIUS,w.traction);
    w.angularAcc=clamp(angularAcc,-900,900);w.omega+=w.angularAcc*dt;
    if(w.brakeTorque>0&&prevOmega*w.omega<0)w.omega=0;
  }
  w.longForce=longForce;w.latForce=latForce;w.spin=(w.spin+w.omega*dt)%(Math.PI*2);

  const bodyLatForce=latForce*c+longForce*s,bodyLongForce=-latForce*s+longForce*c;
  const yawMoment=w.z*bodyLatForce-w.x*bodyLongForce;
  return {lat:bodyLatForce,long:bodyLongForce,yaw:yawMoment};
}

export function createVehicle(spec,p,track){return setupWheels(createPhase3Vehicle(spec,p,track));}

export function stepVehicle(car,input,track,dt=FIXED_DT){
  car.prevX=car.x;car.prevZ=car.z;
  track.query(car.x,car.z,car.contact);car.surface=car.contact.surface;
  const sin=Math.sin(car.a),cos=Math.cos(car.a),forward=car.vx*sin+car.vz*cos,lateral=car.vx*cos-car.vz*sin,speed=Math.hypot(car.vx,car.vz);
  car.longitudinal=forward;car.lateral=lateral;car.v=forward;
  const throttle=clamp(input.throttle||0,0,1),rawBrake=clamp(input.brake||0,0,1),steerInput=clamp(input.steer||0,-1,1);
  car.handbrake=(input.handbrake||0)>.5;
  const reverse=rawBrake>0&&forward<.65&&throttle===0,driveInput=reverse?rawBrake:throttle,serviceBrake=reverse?0:rawBrake;
  car.boost=(input.nitro||0)>.5&&throttle>0&&!reverse&&forward>-1&&car.n>0;car.n=clamp(car.n+(car.boost?-30:6.5)*dt,0,100);
  updateDrivetrain(car,forward,driveInput,dt,reverse);
  steeringTarget(car,steerInput,throttle,serviceBrake,car.handbrake,forward,dt);
  updateWheelLoads(car,speed);

  car.slipAngle=Math.abs(forward)<1?0:Math.atan2(lateral,Math.abs(forward));
  const rearDrift=driftFriction(car,input,dt,speed);
  let rearYawBoost=1;
  if(!(car.handbrake&&Math.abs(car.slipAngle)<20*Math.PI/180)){
    const limit=yawControlLimit(car,speed),bonus=Math.min(.35,Math.abs(car.slipAngle)*limit*clamp(speed/30,0,1));rearYawBoost+=bonus*(1-car.driftValue);
  }

  assignDriveTorques(car,driveInput,reverse);assignEngineBraking(car,forward,throttle,serviceBrake);assignBrakes(car,serviceBrake,car.handbrake,throttle,forward);

  let sumLat=0,sumLong=0,yawMoment=0,rollingAvg=0;
  for(const w of car.wheels){
    const surface=queryWheelSurface(car,w,track),force=solveWheel(car,w,surface,speed,dt,rearDrift,rearYawBoost);
    sumLat+=force.lat;sumLong+=force.long;yawMoment+=force.yaw;rollingAvg+=surface.rolling;
  }
  rollingAvg*=.25;

  const weight=car.spec.mass*9.81,rolling=rollingAvg*weight*Math.tanh(forward*2),bodyLong=sumLong-rolling;
  const dragScale=car.mw.chassis.drag*speed*(throttle>0?1:OFF_THROTTLE_DRAG),dragX=-car.vx*dragScale,dragZ=-car.vz*dragScale,mass=car.spec.mass;
  car.vx+=(sin*bodyLong+cos*sumLat+dragX)/mass*dt;car.vz+=(cos*bodyLong-sin*sumLat+dragZ)/mass*dt;

  const inertia=mass*(car.spec.wheelbase*car.spec.wheelbase+car.trackWidth*car.trackWidth)*.25;
  yawMoment-=car.yawRate*inertia*(car.driftValue>0?.055:.13)*car.mw.tires.yawSpeed;
  car.yawRate=clamp(car.yawRate+yawMoment/Math.max(1,inertia)*dt,-3.6,3.6);
  if(speed<.12&&throttle===0&&serviceBrake===0&&!car.handbrake){car.vx*=Math.exp(-dt*18);car.vz*=Math.exp(-dt*18);car.yawRate*=Math.exp(-dt*14);}
  car.a=Math.atan2(Math.sin(car.a+car.yawRate*dt),Math.cos(car.a+car.yawRate*dt));car.x+=car.vx*dt;car.z+=car.vz*dt;

  const ns=Math.sin(car.a),nc=Math.cos(car.a),newForward=car.vx*ns+car.vz*nc,newLateral=car.vx*nc-car.vz*ns;
  const targetLong=clamp((newForward-forward)/Math.max(dt,1e-4),-22,22),targetLat=clamp((newLateral-lateral)/Math.max(dt,1e-4),-25,25);
  car.longAccel+=(targetLong-car.longAccel)*(1-Math.exp(-dt*8));car.latAccel+=(targetLat-car.latAccel)*(1-Math.exp(-dt*8));
  car.longitudinal=newForward;car.lateral=newLateral;car.v=newForward;
  const frontSlip=(Math.abs(car.wheels[0].slipAngle)+Math.abs(car.wheels[1].slipAngle))*.5,rearSlip=(Math.abs(car.wheels[2].slipAngle)+Math.abs(car.wheels[3].slipAngle))*.5;
  car.understeer=clamp(frontSlip/Math.max(.01,Math.abs(car.steerAngle))-.7,0,1);car.oversteer=clamp(rearSlip-frontSlip,0,1);
  car.traction=car.wheels.reduce((n,w)=>n+w.traction,0)*.25;car.wheelSpin=car.wheels.reduce((n,w)=>n+w.spin,0)*.25;
  car.roll+=(-clamp(car.latAccel/9.81*.055,-.11,.11)-car.roll)*(1-Math.exp(-dt*8));car.pitch+=(clamp(-car.longAccel/9.81*.038,-.06,.06)-car.pitch)*(1-Math.exp(-dt*8));
  car.resetCooldown=Math.max(0,car.resetCooldown-dt);
}

export function resetVehicle(car,track){
  const ok=resetPhase3Vehicle(car,track);if(ok)resetWheelStates(car);return ok;
}

export const MW4_INTERNALS={ackermann,setupWheels,updateWheelLoads,splitPair,solveWheel,drivenRoadSpeed};
