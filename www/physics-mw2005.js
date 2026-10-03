/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * Directly adapted for Marocto Racing's 2D rigid-body model from the public
 * UndercoverMWPhysics project by gaycoderprincess and contributors:
 * https://github.com/gaycoderprincess/UndercoverMWPhysics
 *
 * The engine torque interpolation, shift-point strategy, aerodynamic model,
 * speed grip/traction tables, steering tables, load-sensitive lateral tire
 * tables, brake constants, yaw-control and drift-friction concepts below are
 * derived from that MPL-2.0 source. Marocto Racing does not implement the
 * upstream four-wheel 3D suspension/collision solver, so axle loads and force
 * integration are adapted to this engine rather than copied byte-for-byte.
 */

import {SURFACES} from './track.js';
import {getMWData} from './mw2005-data.js';

export const FIXED_DT=1/120;
export const PHYSICS_PROFILE='mw2005-real-port-phase3';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const ramp=(v,a,b)=>clamp((v-a)/(b-a),0,1);
const MPH=.44704;
const FTLB_TO_NM=1.3558179483314;
const WHEEL_RADIUS=.35;
const BRAKING_TORQUE=4;
const EBRAKING_TORQUE=10;
const TIRE_ELLIPSE=1.5;
const INV_TIRE_ELLIPSE=1/TIRE_ELLIPSE;
const LOAD_FACTOR=.8;
const GRIP_FACTOR=2.5;
const CORNER_SCALE=1000;
const OFF_THROTTLE_DRAG=2;
const CG_HEIGHT=.50;

const GRIP_VS_SPEED=[.833,.958,1.008,1.0167,1.033,1.033,1.033,1.0167,1,1];
const TRACTION_VS_SPEED=[.909,1.045,1.09,1.09,1.09,1.09,1.09,1.045,1,1];
const STEERING_RANGE=[40,20,10,5.5,4.5,3.25,2.9,2.9,2.9,2.9];
const STEERING_SPEED=[1,1,1,.56,.5,.35,.3,.3,.3,.3];
const STEERING_RANGE_COEFF=[1,1,1.1,1.2,1.25,1.35];
const DRIFT_REAR_FRICTION=[1.1,.95,.87,.77,.67,.6,.51,.43,.37,.34];
const LOAD_TABLES=[
  [0,0,0,0,0,0],
  [0,1.2,2.3,3,3,2.8],
  [0,1.7,3.2,4.3,5.1,5.2],
  [0,1.8,3.5,4.9,5.8,6.1],
  [0,1.83,3.6,5,5.96,6.4],
  [0,1.86,3.7,5.1,6.13,6.7],
  [0,1.9,3.8,5.2,6.3,7.1]
];

function table(values,x,min=0,max=1){
  if(values.length===1)return values[0];
  const f=clamp((x-min)/(max-min),0,1)*(values.length-1),i=Math.floor(f),j=Math.min(values.length-1,i+1);
  return lerp(values[i],values[j],f-i);
}
function torqueFtLb(mw,rpm){
  const e=mw.engine,r=clamp(rpm,e.idle,e.redline);
  return table(e.torque,r,e.idle,e.maxRpm);
}
function engineBrakeFactor(mw,rpm){
  const e=mw.engine;return table(e.braking,clamp(rpm,e.idle,e.redline),e.idle,e.maxRpm);
}
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
function forwardRatios(mw){return mw.transmission.ratios.slice(2).filter(v=>v>0);}
function rpmForSpeed(mw,speed,gear){
  const ratios=forwardRatios(mw),ratio=ratios[clamp(gear-1,0,ratios.length-1)]*mw.transmission.final;
  const e=mw.engine,minW=e.idle*Math.PI*2/60,maxW=e.redline*Math.PI*2/60,diffW=Math.abs(speed)/WHEEL_RADIUS;
  const av=minW+diffW*ratio*(maxW-minW)/maxW;
  return clamp(av*60/(Math.PI*2),e.idle,e.redline);
}
function speedForRpm(mw,rpm,gear){
  const ratios=forwardRatios(mw),ratio=ratios[clamp(gear-1,0,ratios.length-1)]*mw.transmission.final;
  const e=mw.engine,minW=e.idle*Math.PI*2/60,maxW=e.redline*Math.PI*2/60,av=clamp(rpm,e.idle,e.redline)*Math.PI*2/60;
  return Math.max(0,(av-minW)*maxW/Math.max(1e-6,maxW-minW)*WHEEL_RADIUS/ratio);
}
function shiftPoints(mw){
  const ratios=forwardRatios(mw),e=mw.engine,up=new Array(ratios.length).fill(e.redline),down=new Array(ratios.length).fill(e.idle);
  for(let g=0;g<ratios.length-1;g++){
    let rpm=(e.redline+e.idle)*.5,chosen=e.redline-100;
    while(rpm<e.redline){
      const current=torqueFtLb(mw,rpm)*(1+inductionBoostAt(mw,rpm,1));
      const nextRpm=rpm*(ratios[g+1]/ratios[g]);
      const next=torqueFtLb(mw,nextRpm)*(1+inductionBoostAt(mw,nextRpm,1))*(ratios[g+1]/ratios[g]);
      if(next>current){chosen=rpm;break;}rpm+=50;
    }
    up[g]=Math.min(chosen,e.redline);down[g+1]=(ratios[g+1]/ratios[g])*up[g];
  }
  return {up,down};
}
function updateDrivetrain(car,forward,throttle,dt){
  const mw=car.mw,e=mw.engine,ratios=forwardRatios(mw),gb=car.shiftPoints;
  car.shiftTimer=Math.max(0,car.shiftTimer-dt);
  if(forward<-.8){car.gear=-1;car.rpm=clamp(e.idle+Math.abs(forward)*180,e.idle,e.redline);return;}
  if(car.gear<1)car.gear=1;
  car.rpm=rpmForSpeed(mw,forward,car.gear);
  if(car.shiftTimer<=0){
    const gi=car.gear-1;
    if(car.rpm>=gb.up[gi]&&car.gear<ratios.length){car.gear++;car.shiftTimer=mw.transmission.shiftSpeed;}
    else if(car.gear>1&&car.rpm<gb.down[gi]&&Math.abs(forward)>4){car.gear--;car.shiftTimer=mw.transmission.shiftSpeed;}
    else if(throttle>.82&&car.gear>1&&car.rpm<gb.down[gi]*1.18&&Math.abs(forward)>7){car.gear--;car.shiftTimer=mw.transmission.shiftSpeed;}
    car.rpm=rpmForSpeed(mw,forward,car.gear);
  }
  const ind=mw.induction;
  if(ind){
    const wants=throttle>.15&&car.rpm>inductionRPM(mw)*.85;
    car.spool=clamp(car.spool+(wants?dt/Math.max(.05,ind.up):-dt/Math.max(.05,ind.down)),0,1);
  }else car.spool=0;
}
function lateralGripScale(speed){return table(GRIP_VS_SPEED,ramp(speed,0,85*MPH))*1.2;}
function tractionScale(speed){return table(TRACTION_VS_SPEED,ramp(speed,0,85*MPH))*1.1;}
function pilotFactor(speed){return lerp(.85,1,ramp(speed,30*MPH,50*MPH));}
function loadValue(tableIndex,loadN){return table(LOAD_TABLES[tableIndex],loadN*.001*LOAD_FACTOR,0,10);}
function lateralTireForce(mw,axle,loadN,slipAngle,gripBoost){
  const angle=Math.abs(slipAngle)*180/Math.PI,norm=angle*.5,index=Math.floor(norm),extra=norm-index;
  let value;
  if(index>5)value=loadValue(6,loadN);
  else value=lerp(loadValue(index,loadN),loadValue(index+1,loadN),extra);
  return mw.tires.gripScale[axle]*CORNER_SCALE*gripBoost*GRIP_FACTOR*value;
}
function driftFriction(car,slip,input,dt,speed){
  const enter=speed>30*MPH&&((input.handbrake||0)>.5||Math.abs(slip)>12*Math.PI/180||(input.throttle||0)*Math.abs(slip)>12*Math.PI/180);
  car.driftValue=clamp(car.driftValue+(enter?8:-2)*dt,0,1);
  if(car.driftValue<=0)return 1;
  const counter=((input.steer||0)*slip>0)?Math.abs(input.steer||0):0;
  const coeff=Math.abs(slip)*.5+counter*4+Math.abs(car.yawRate)*.5;
  return table(DRIFT_REAR_FRICTION,clamp(coeff*car.driftValue,0,1));
}
function yawControlLimit(car,speed){
  const mw=car.mw,top=forwardRatios(mw).length,maxSpeed=speedForRpm(mw,mw.engine.redline,top),pct=clamp(Math.abs(speed)/Math.max(1,maxSpeed),0,1);
  return table(mw.tires.yaw,pct);
}
function combinedAxle(longForce,latForce,maxForce,driving){
  let lx=longForce*(driving?TIRE_ELLIPSE:1),ly=latForce;
  const len=Math.hypot(lx,ly);
  if(len>maxForce&&len>1e-6){const q=maxForce/len;lx*=q;ly*=q;}
  else if(driving)lx*=INV_TIRE_ELLIPSE;
  return [lx,ly];
}

export function createVehicle(spec,p,track){
  const spawn={};track.at(track.length-14-p*5,p===0?-2.5:2.5,spawn);
  const mw=getMWData(spec),weight=spec.mass*9.81,bias=mw.chassis.frontBias*.01;
  return {p,spec,mw,x:spawn.x,z:spawn.z,prevX:spawn.x,prevZ:spawn.z,a:Math.atan2(spawn.tx,spawn.tz),vx:0,vz:0,v:0,longitudinal:0,lateral:0,yawRate:0,steerAngle:0,wheelSpin:0,n:100,boost:false,handbrake:false,roll:0,pitch:0,surface:'asphalt',contact:{index:spawn.index},progress:track.createProgress(),collisionCount:0,resetCooldown:0,gear:1,rpm:mw.engine.idle,shiftTimer:0,shiftPoints:shiftPoints(mw),spool:0,slipAngle:0,driftValue:0,longAccel:0,frontLoad:weight*bias,rearLoad:weight*(1-bias),driveLayout:mw.transmission.split===0?'RWD':mw.transmission.split===1?'FWD':'AWD',mwSource:mw.source,traction:1,understeer:0,oversteer:0};
}

export function stepVehicle(car,input,track,dt=FIXED_DT){
  car.prevX=car.x;car.prevZ=car.z;const mw=car.mw,spec=car.spec,mass=spec.mass,wb=spec.wheelbase;
  track.query(car.x,car.z,car.contact);car.surface=car.contact.surface;const surface=SURFACES[car.surface];
  const sin=Math.sin(car.a),cos=Math.cos(car.a),forward=car.vx*sin+car.vz*cos,lateral=car.vx*cos-car.vz*sin,speed=Math.hypot(car.vx,car.vz),absForward=Math.abs(forward);
  const throttle=clamp(input.throttle||0,0,1);let brake=clamp(input.brake||0,0,1);const steerInput=clamp(input.steer||0,-1,1);
  car.handbrake=(input.handbrake||0)>.5;
  car.boost=(input.nitro||0)>.5&&throttle>0&&forward>-1&&car.n>0;car.n=clamp(car.n+(car.boost?-30:6.5)*dt,0,100);
  updateDrivetrain(car,forward,throttle,dt);

  // Most Wanted human steering tables: speed range, brake/coast multiplier and rate limit.
  let maxSteerDeg=table(STEERING_RANGE,Math.max(0,forward),0,160);
  const tb=1-(throttle+1-(brake+(car.handbrake?1:0))*.5)*.5;
  maxSteerDeg*=1.45*tb*table(STEERING_SPEED,Math.max(0,forward),0,160)+1;
  maxSteerDeg*=table(STEERING_RANGE_COEFF,Math.abs(steerInput),0,1);
  const rearSlipDeg=Math.abs(car.slipAngle)*180/Math.PI;
  if(steerInput*car.slipAngle>0)maxSteerDeg=Math.max(maxSteerDeg,Math.min(45,rearSlipDeg));
  maxSteerDeg=Math.min(45,maxSteerDeg)*mw.tires.steering;
  const target=-steerInput*maxSteerDeg*Math.PI/180;
  const steerRate=180*table(STEERING_SPEED,Math.max(0,forward),0,160)*mw.tires.steering*Math.PI/180;
  car.steerAngle+=clamp(target-car.steerAngle,-steerRate*dt,steerRate*dt);

  const weight=mass*9.81,bias=mw.chassis.frontBias*.01;
  const downforce=speed*2*mw.chassis.aero*1000;
  const transfer=mass*clamp(car.longAccel,-16,16)*CG_HEIGHT/wb;
  const aeroFront=downforce*(mw.chassis.aeroCg*.01),aeroRear=downforce-aeroFront;
  car.frontLoad=clamp(weight*bias-transfer+aeroFront,weight*.18,weight*.88);
  car.rearLoad=clamp(weight*(1-bias)+transfer+aeroRear,weight*.12,weight*.88);

  const gripBoost=lateralGripScale(speed)*surface.grip,tractionBoost=tractionScale(speed)*surface.grip,pilot=pilotFactor(speed);
  const lf=wb*(1-bias),lr=wb*bias,denom=Math.max(1,absForward);
  const frontSlip=Math.atan2(lateral+lf*car.yawRate,denom)-car.steerAngle*Math.tanh(forward/1.5);
  const rearSlip=Math.atan2(lateral-lr*car.yawRate,denom);
  car.slipAngle=absForward<1?0:Math.atan2(lateral,absForward);
  const rearDrift=driftFriction(car,car.slipAngle,input,dt,speed);

  const frontLatMag=2*lateralTireForce(mw,0,car.frontLoad*.5,frontSlip,gripBoost)*pilot;
  const rearLatMag=2*lateralTireForce(mw,1,car.rearLoad*.5,rearSlip,gripBoost)*pilot;
  let frontLat=-Math.sign(frontSlip||0)*frontLatMag,rearLat=-Math.sign(rearSlip||0)*rearLatMag;

  // Original MW yaw-control boosts rear tire traction progressively with yaw and speed.
  let rearYawBoost=1;
  if(!(car.handbrake&&Math.abs(car.slipAngle)<20*Math.PI/180)){
    const yawLimit=yawControlLimit(car,speed),speedFactor=clamp(speed/30,0,1),bonus=Math.min(.35,Math.abs(car.slipAngle)*yawLimit*speedFactor);
    rearYawBoost+=bonus*(1-car.driftValue);
  }

  const reverse=brake>0&&forward<.65&&throttle===0;
  let driveTotal=0;
  if(reverse){driveTotal=-brake*mass*5;brake=0;}
  else if(throttle>0){
    const ratios=forwardRatios(mw),gi=Math.max(0,car.gear-1),ratio=ratios[gi]||ratios[0],eff=mw.transmission.eff[gi+2]??1;
    const torqueNm=torqueFtLb(mw,car.rpm)*FTLB_TO_NM*(1+inductionBoostAt(mw,car.rpm,car.spool));
    const nos=car.boost?1.45:1,clutch=car.shiftTimer>0?.25:1;
    driveTotal=throttle*torqueNm*ratio*mw.transmission.final*eff/WHEEL_RADIUS*nos*clutch;
  }
  const frontShare=clamp(mw.transmission.split,0,1),rearShare=1-frontShare;
  let frontLong=driveTotal*frontShare,rearLong=driveTotal*rearShare;

  const frontBrake=brake*(mw.brakes.torque[0]*FTLB_TO_NM*BRAKING_TORQUE/WHEEL_RADIUS)*2;
  const rearBrake=brake*(mw.brakes.torque[1]*FTLB_TO_NM*BRAKING_TORQUE/WHEEL_RADIUS)*2+(car.handbrake?(mw.brakes.ebrake*FTLB_TO_NM*EBRAKING_TORQUE/WHEEL_RADIUS)*2:0);
  const dir=Math.tanh(forward*2);
  frontLong-=frontBrake*dir;rearLong-=rearBrake*dir;

  if(throttle<.02&&brake<.02&&absForward>1){
    const engineNm=torqueFtLb(mw,car.rpm)*FTLB_TO_NM*engineBrakeFactor(mw,car.rpm),ratio=forwardRatios(mw)[Math.max(0,car.gear-1)]||1;
    rearLong-=Math.sign(forward)*engineNm*ratio*mw.transmission.final/WHEEL_RADIUS*.30;
  }

  const frontMax=car.frontLoad*mw.tires.static[0]*tractionBoost*pilot;
  const rearMax=car.rearLoad*mw.tires.static[1]*tractionBoost*pilot*rearDrift*rearYawBoost;
  [frontLong,frontLat]=combinedAxle(frontLong,frontLat,frontMax,frontLong*forward>0);
  [rearLong,rearLat]=combinedAxle(rearLong,rearLat,rearMax,rearLong*forward>0);
  car.traction=clamp((Math.hypot(frontLong,frontLat)+Math.hypot(rearLong,rearLat))/Math.max(1,frontMax+rearMax),0,1);

  const longForce=frontLong+rearLong;
  const lateralForce=frontLat*Math.cos(car.steerAngle)+rearLat;
  const dragScale=mw.chassis.drag*speed*(throttle>0?1:OFF_THROTTLE_DRAG);
  const dragX=-car.vx*dragScale,dragZ=-car.vz*dragScale;
  const rolling=surface.rolling*weight*Math.tanh(forward*2);

  car.vx+=(sin*(longForce-rolling)+cos*lateralForce+dragX)/mass*dt;
  car.vz+=(cos*(longForce-rolling)-sin*lateralForce+dragZ)/mass*dt;

  const inertia=mass*wb*wb*.29;
  let yawMoment=lf*frontLat*Math.cos(car.steerAngle)-lr*rearLat;
  // The original rear yaw friction does most of the stabilization. This small 2D damper replaces
  // roll/pitch coupling that our flat rigid body cannot reproduce.
  yawMoment-=car.yawRate*inertia*(car.driftValue>0?.08:.20)*mw.tires.yawSpeed;
  car.yawRate=clamp(car.yawRate+yawMoment/inertia*dt,-3.4,3.4);
  if(speed<.15&&throttle===0&&brake===0){car.vx*=Math.exp(-dt*18);car.vz*=Math.exp(-dt*18);car.yawRate*=Math.exp(-dt*14);}
  car.a=Math.atan2(Math.sin(car.a+car.yawRate*dt),Math.cos(car.a+car.yawRate*dt));
  car.x+=car.vx*dt;car.z+=car.vz*dt;

  const ns=Math.sin(car.a),nc=Math.cos(car.a),newForward=car.vx*ns+car.vz*nc;
  car.longAccel+=(clamp((newForward-forward)/Math.max(dt,1e-4),-20,20)-car.longAccel)*(1-Math.exp(-dt*8));
  car.longitudinal=newForward;car.lateral=car.vx*nc-car.vz*ns;car.v=car.longitudinal;
  car.understeer=clamp(Math.abs(frontSlip)/Math.max(.01,Math.abs(car.steerAngle))-.7,0,1);
  car.oversteer=clamp(Math.abs(rearSlip)-Math.abs(frontSlip),0,1);
  car.wheelSpin=(car.wheelSpin+car.longitudinal*dt/WHEEL_RADIUS)%(Math.PI*2);
  car.roll+=(-clamp(lateralForce/weight*.065,-.10,.10)-car.roll)*(1-Math.exp(-dt*8));
  car.pitch+=(clamp(-car.longAccel/9.81*.035,-.055,.055)-car.pitch)*(1-Math.exp(-dt*8));
  car.resetCooldown=Math.max(0,car.resetCooldown-dt);
}

export function collideBarrier(car,track){
  track.query(car.x,car.z,car.contact);const q=car.contact,sin=Math.sin(car.a),cos=Math.cos(car.a);
  const support=Math.abs(q.nx*cos-q.nz*sin)*car.spec.width*.5+Math.abs(q.nx*sin+q.nz*cos)*car.spec.length*.5;
  const max=track.barrierOffset-.24-support,sign=Math.sign(q.lateral)||1,penetration=Math.abs(q.lateral)-max;if(penetration<=0)return false;
  const nx=q.nx*sign,nz=q.nz*sign;car.x-=nx*penetration;car.z-=nz*penetration;const vn=car.vx*nx+car.vz*nz;
  if(vn>0){car.vx-=nx*vn*1.14;car.vz-=nz*vn*1.14;const tangent=car.vx*(-nz)+car.vz*nx,friction=Math.min(Math.abs(tangent),vn*.16)*Math.sign(tangent);car.vx+=nz*friction;car.vz-=nx*friction;car.yawRate*=.72;car.collisionCount++;}return true;
}
export function collideCars(a,b){
  const dx=b.x-a.x,dz=b.z-a.z;if(dx*dx+dz*dz>30)return false;const ac=Math.cos(a.a),as=Math.sin(a.a),bc=Math.cos(b.a),bs=Math.sin(b.a);let depth=Infinity,nx=0,nz=0;
  for(let i=0;i<4;i++){const x=i===0?ac:i===1?as:i===2?bc:bs,z=i===0?-as:i===1?ac:i===2?-bs:bc;const ra=Math.abs(x*ac-z*as)*a.spec.width*.5+Math.abs(x*as+z*ac)*a.spec.length*.5,rb=Math.abs(x*bc-z*bs)*b.spec.width*.5+Math.abs(x*bs+z*bc)*b.spec.length*.5,overlap=ra+rb-Math.abs(dx*x+dz*z);if(overlap<=0)return false;if(overlap<depth){depth=overlap;const sign=dx*x+dz*z>=0?1:-1;nx=x*sign;nz=z*sign;}}
  const ia=1/a.spec.mass,ib=1/b.spec.mass,sum=ia+ib,correction=depth+.003;a.x-=nx*correction*ia/sum;a.z-=nz*correction*ia/sum;b.x+=nx*correction*ib/sum;b.z+=nz*correction*ib/sum;const relative=(b.vx-a.vx)*nx+(b.vz-a.vz)*nz;
  if(relative<0){const impulse=-(1+.18)*relative/sum;a.vx-=impulse*ia*nx;a.vz-=impulse*ia*nz;b.vx+=impulse*ib*nx;b.vz+=impulse*ib*nz;const tangent=(b.vx-a.vx)*(-nz)+(b.vz-a.vz)*nx,jt=clamp(-tangent/sum,-impulse*.14,impulse*.14);a.vx+=jt*ia*nz;a.vz-=jt*ia*nx;b.vx-=jt*ib*nz;b.vz+=jt*ib*nx;a.yawRate+=clamp(tangent*.010,-.18,.18);b.yawRate-=clamp(tangent*.010,-.18,.18);a.collisionCount++;b.collisionCount++;}return true;
}
export function resetVehicle(car,track){
  if(car.resetCooldown>0)return false;const out=car.contact;track.at(track.gates[car.progress.lastGate].s+4,car.p===0?-2.5:2.5,out);car.x=car.prevX=out.x;car.z=car.prevZ=out.z;car.a=Math.atan2(out.tx,out.tz);car.vx=car.vz=car.yawRate=car.steerAngle=0;car.gear=1;car.rpm=car.mw.engine.idle;car.shiftTimer=0;car.spool=0;car.longAccel=0;car.slipAngle=0;car.driftValue=0;car.resetCooldown=2;return true;
}

export const MW_INTERNALS={torqueFtLb,rpmForSpeed,speedForRpm,shiftPoints,lateralTireForce,lateralGripScale,tractionScale};
