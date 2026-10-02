import {SURFACES} from './track.js';

export const FIXED_DT=1/120;
export const PHYSICS_PROFILE='nfsmw-experimental-v1';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const GEAR_RATIOS=[0,3.18,2.10,1.55,1.22,1.00,.84];
const GEAR_FORCE=[0,1.18,1.08,1.00,.94,.89,.84];
const FINAL_DRIVE=3.55;
const IDLE_RPM=950;
const REDLINE_RPM=7100;
const SHIFT_UP_RPM=6550;
const SHIFT_DOWN_RPM=2450;

function torqueCurve(rpm){
  const x=clamp((rpm-IDLE_RPM)/(REDLINE_RPM-IDLE_RPM),0,1);
  // Broad arcade torque plateau: strong mid-range, softer right at idle/redline.
  return .70+.42*Math.sin(Math.PI*Math.pow(x,.82));
}

function updateGearbox(car,forward,dt){
  const wheelR=.35;
  car.shiftTimer=Math.max(0,car.shiftTimer-dt);
  if(forward<-.8){
    car.gear=-1;
    car.rpm=clamp(IDLE_RPM+Math.abs(forward)*165,IDLE_RPM,5200);
    return;
  }
  if(car.gear<1)car.gear=1;
  const wheelRpm=Math.abs(forward)/(Math.PI*2*wheelR)*60;
  let rpm=wheelRpm*GEAR_RATIOS[car.gear]*FINAL_DRIVE;
  rpm=Math.max(IDLE_RPM,rpm);
  if(car.shiftTimer<=0){
    if(rpm>SHIFT_UP_RPM&&car.gear<6){car.gear++;car.shiftTimer=.16;rpm*=.72;}
    else if(rpm<SHIFT_DOWN_RPM&&car.gear>1){car.gear--;car.shiftTimer=.12;rpm*=1.28;}
  }
  car.rpm=clamp(rpm,IDLE_RPM,REDLINE_RPM+400);
}

export function createVehicle(spec,p,track){
  const spawn={};
  track.at(track.length-14-p*5,p===0?-2.5:2.5,spawn);
  return {
    p,spec,x:spawn.x,z:spawn.z,prevX:spawn.x,prevZ:spawn.z,
    a:Math.atan2(spawn.tx,spawn.tz),vx:0,vz:0,v:0,longitudinal:0,lateral:0,
    yawRate:0,steerAngle:0,wheelSpin:0,n:100,boost:false,handbrake:false,
    roll:0,pitch:0,surface:'asphalt',contact:{index:spawn.index},
    progress:track.createProgress(),collisionCount:0,resetCooldown:0,
    gear:1,rpm:IDLE_RPM,shiftTimer:0,slipAngle:0,tractionAssist:0,stabilityAssist:0
  };
}

export function stepVehicle(car,input,track,dt=FIXED_DT){
  car.prevX=car.x;car.prevZ=car.z;
  const spec=car.spec,mass=spec.mass,lf=spec.wheelbase*.48,lr=spec.wheelbase-lf;
  track.query(car.x,car.z,car.contact);
  car.surface=car.contact.surface;
  const surface=SURFACES[car.surface];

  const sin=Math.sin(car.a),cos=Math.cos(car.a);
  const forward=car.vx*sin+car.vz*cos;
  const lateral=car.vx*cos-car.vz*sin;
  const speed=Math.hypot(car.vx,car.vz);
  const absForward=Math.abs(forward);

  // MW-style control layer: fast rack at low speed, progressively calmer at speed.
  const speedBlend=clamp(absForward/58,0,1);
  const steerLimit=lerp(.60,.205,Math.pow(speedBlend,.72));
  const steerResponse=lerp(12.5,7.0,speedBlend);
  const targetSteer=-clamp(input.steer,-1,1)*steerLimit;
  car.steerAngle+=(targetSteer-car.steerAngle)*(1-Math.exp(-dt*steerResponse));

  car.handbrake=input.handbrake>.5&&absForward>2.5;
  car.boost=input.nitro>.5&&input.throttle>0&&forward>-1&&car.n>0;
  car.n=clamp(car.n+(car.boost?-31:6.5)*dt,0,100);

  updateGearbox(car,forward,dt);

  const weight=mass*9.81;
  const surfaceMu=surface.grip*spec.grip;
  const aeroLoad=1+clamp(speed*speed*.000085,0,.30);
  const totalGrip=weight*surfaceMu*aeroLoad;

  let drive=0;
  let brake=clamp(input.brake,0,1);
  const throttle=clamp(input.throttle,0,1);
  const reverseRequest=brake>0&&forward<.75&&throttle===0;
  if(reverseRequest){
    drive=-brake*spec.power*.52/(1+absForward/12);
    brake=0;
  }else if(throttle>0){
    const curve=torqueCurve(car.rpm);
    const gearMul=GEAR_FORCE[Math.max(1,car.gear)]||.84;
    const speedFalloff=1/(1+Math.max(0,forward)/42);
    const shiftCut=car.shiftTimer>0?.62:1;
    drive=throttle*spec.power*curve*gearMul*speedFalloff*shiftCut*(car.boost?1.52:1);
  }

  const brakeForce=(brake*weight*1.28+(car.handbrake?weight*.20:0))*Math.tanh(forward*2.2);
  const driveLimit=totalGrip*(car.handbrake?.43:.82);
  drive=clamp(drive,-driveLimit*.60,driveLimit);

  const drag=spec.drag*forward*Math.abs(forward)*1.12;
  const rolling=surface.rolling*weight*Math.tanh(forward*2);
  const fx=drive-brakeForce-drag-rolling;

  const denom=Math.max(4.8,absForward);
  const frontSlip=Math.atan2(lateral+lf*car.yawRate,denom)-car.steerAngle*Math.tanh(forward/1.8);
  const rearSlip=Math.atan2(lateral-lr*car.yawRate,denom);
  car.slipAngle=Math.atan2(lateral,Math.max(1,absForward));

  const longitudinalUse=clamp(Math.abs(drive-brakeForce)/(totalGrip||1),0,.92);
  const combinedBudget=Math.sqrt(Math.max(.12,1-longitudinalUse*longitudinalUse));
  const frontLimit=totalGrip*.52*combinedBudget;
  const rearGripScale=car.handbrake?.27:1;
  const rearLimit=totalGrip*.48*combinedBudget*rearGripScale;

  // Saturating tire response: immediate arcade bite near zero slip but controllable beyond the peak.
  const frontStiff=76000+mass*8;
  const rearStiff=82000+mass*8;
  let fFront=frontLimit*Math.tanh(-frontStiff*frontSlip/(frontLimit||1));
  let fRear=rearLimit*Math.tanh(-rearStiff*rearSlip/(rearLimit||1));

  // Stability help is strongest in normal grip and fades during handbrake drift.
  const stabilityGain=(car.handbrake?.18:.72)*surfaceMu;
  const lateralDamping=clamp(-lateral*mass*(1.35+absForward*.018)*stabilityGain,-totalGrip*.20,totalGrip*.20);
  const yawDamping=car.handbrake?.18:.62;
  car.stabilityAssist=lateralDamping;

  // Small turn-in assist gives the fast, planted MW-style response without rotating in place.
  const turnIn=-car.steerAngle*forward*Math.min(absForward,32)*mass*.0065;
  const fy=fFront*Math.cos(car.steerAngle)+fRear+lateralDamping;
  const inertia=mass*spec.wheelbase*spec.wheelbase*.285;
  let yawAccel=(lf*fFront*Math.cos(car.steerAngle)-lr*fRear+turnIn)/inertia;
  yawAccel-=car.yawRate*yawDamping;
  if(absForward<1.2)yawAccel*=absForward/1.2;
  car.yawRate+=yawAccel*dt;
  car.yawRate=clamp(car.yawRate,-2.85,2.85);

  car.vx+=(sin*fx+cos*fy)/mass*dt;
  car.vz+=(cos*fx-sin*fy)/mass*dt;

  // Arcade traction assist: suppress violent longitudinal wheelspin while retaining drift slip.
  const tractionNeed=Math.max(0,Math.abs(drive)-totalGrip*.62)/(totalGrip||1);
  car.tractionAssist=tractionNeed;
  if(tractionNeed>0&&!car.handbrake){
    const retain=Math.exp(-dt*(1.5+tractionNeed*5));
    const fwd=car.vx*sin+car.vz*cos,lat=car.vx*cos-car.vz*sin;
    const assistedLat=lat*retain;
    car.vx=fwd*sin+assistedLat*cos;
    car.vz=fwd*cos-assistedLat*sin;
  }

  if(speed<.16&&throttle===0&&brake===0){
    car.vx*=Math.exp(-dt*18);car.vz*=Math.exp(-dt*18);car.yawRate*=Math.exp(-dt*14);
  }

  car.a+=car.yawRate*dt;
  car.a=Math.atan2(Math.sin(car.a),Math.cos(car.a));
  car.x+=car.vx*dt;car.z+=car.vz*dt;
  car.longitudinal=car.vx*Math.sin(car.a)+car.vz*Math.cos(car.a);
  car.lateral=car.vx*Math.cos(car.a)-car.vz*Math.sin(car.a);
  car.v=car.longitudinal;
  car.wheelSpin=(car.wheelSpin+car.longitudinal*dt/.35)%(Math.PI*2);

  const lateralG=fy/weight;
  car.roll+=(-clamp(lateralG*.065,-.09,.09)-car.roll)*(1-Math.exp(-dt*8));
  car.pitch+=(clamp(-fx/weight*.04,-.045,.045)-car.pitch)*(1-Math.exp(-dt*8));
  car.resetCooldown=Math.max(0,car.resetCooldown-dt);
}

export function collideBarrier(car,track){
  track.query(car.x,car.z,car.contact);const q=car.contact,sin=Math.sin(car.a),cos=Math.cos(car.a);
  const support=Math.abs(q.nx*cos-q.nz*sin)*car.spec.width*.5+Math.abs(q.nx*sin+q.nz*cos)*car.spec.length*.5;
  const max=track.barrierOffset-.24-support,sign=Math.sign(q.lateral)||1,penetration=Math.abs(q.lateral)-max;
  if(penetration<=0)return false;
  const nx=q.nx*sign,nz=q.nz*sign;car.x-=nx*penetration;car.z-=nz*penetration;
  const vn=car.vx*nx+car.vz*nz;
  if(vn>0){
    car.vx-=nx*vn*1.14;car.vz-=nz*vn*1.14;
    const tangent=car.vx*(-nz)+car.vz*nx,friction=Math.min(Math.abs(tangent),vn*.16)*Math.sign(tangent);
    car.vx+=nz*friction;car.vz-=nx*friction;car.yawRate*=.72;car.collisionCount++;
  }return true;
}

export function collideCars(a,b){
  const dx=b.x-a.x,dz=b.z-a.z;if(dx*dx+dz*dz>30)return false;
  const ac=Math.cos(a.a),as=Math.sin(a.a),bc=Math.cos(b.a),bs=Math.sin(b.a);
  let depth=Infinity,nx=0,nz=0;
  for(let i=0;i<4;i++){
    const x=i===0?ac:i===1?as:i===2?bc:bs,z=i===0?-as:i===1?ac:i===2?-bs:bc;
    const ra=Math.abs(x*ac-z*as)*a.spec.width*.5+Math.abs(x*as+z*ac)*a.spec.length*.5;
    const rb=Math.abs(x*bc-z*bs)*b.spec.width*.5+Math.abs(x*bs+z*bc)*b.spec.length*.5;
    const overlap=ra+rb-Math.abs(dx*x+dz*z);if(overlap<=0)return false;
    if(overlap<depth){depth=overlap;const sign=dx*x+dz*z>=0?1:-1;nx=x*sign;nz=z*sign;}
  }
  const ia=1/a.spec.mass,ib=1/b.spec.mass,sum=ia+ib,correction=depth+.003;
  a.x-=nx*correction*ia/sum;a.z-=nz*correction*ia/sum;b.x+=nx*correction*ib/sum;b.z+=nz*correction*ib/sum;
  const relative=(b.vx-a.vx)*nx+(b.vz-a.vz)*nz;
  if(relative<0){
    const impulse=-(1+.18)*relative/sum;
    a.vx-=impulse*ia*nx;a.vz-=impulse*ia*nz;b.vx+=impulse*ib*nx;b.vz+=impulse*ib*nz;
    const tangent=(b.vx-a.vx)*(-nz)+(b.vz-a.vz)*nx,jt=clamp(-tangent/sum,-impulse*.14,impulse*.14);
    a.vx+=jt*ia*nz;a.vz-=jt*ia*nx;b.vx-=jt*ib*nz;b.vz+=jt*ib*nx;
    a.yawRate+=clamp(tangent*.010,-.18,.18);b.yawRate-=clamp(tangent*.010,-.18,.18);a.collisionCount++;b.collisionCount++;
  }return true;
}

export function resetVehicle(car,track){
  if(car.resetCooldown>0)return false;
  const out=car.contact;track.at(track.gates[car.progress.lastGate].s+4,car.p===0?-2.5:2.5,out);
  car.x=car.prevX=out.x;car.z=car.prevZ=out.z;car.a=Math.atan2(out.tx,out.tz);
  car.vx=car.vz=car.yawRate=car.steerAngle=0;car.gear=1;car.rpm=IDLE_RPM;car.shiftTimer=0;car.resetCooldown=2;
  return true;
}
