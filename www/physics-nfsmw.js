import {SURFACES} from './track.js';

export const FIXED_DT=1/120;
export const PHYSICS_PROFILE='nfsmw-experimental-v2';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const GEAR_RATIOS=[0,3.18,2.10,1.55,1.22,1.00,.84];
const GEAR_FORCE=[0,1.20,1.10,1.02,.95,.89,.84];
const FINAL_DRIVE=3.55;
const IDLE_RPM=950;
const REDLINE_RPM=7100;
const SHIFT_UP_RPM=6550;
const SHIFT_DOWN_RPM=2350;
const CG_HEIGHT=.50;

function torqueCurve(rpm){
  const x=clamp((rpm-IDLE_RPM)/(REDLINE_RPM-IDLE_RPM),0,1);
  // Wide arcade plateau: the engine stays useful through the middle of the rev range.
  return .68+.46*Math.sin(Math.PI*Math.pow(x,.80));
}

function chassisTuning(spec){
  switch(spec.class){
    case 'touring': return {frontDrive:.38,turnIn:1.02,stability:1.04,throttleOversteer:.08};
    case 'coupe': return {frontDrive:.42,turnIn:.99,stability:1.08,throttleOversteer:.06};
    case 'sedan': return {frontDrive:.44,turnIn:.96,stability:1.12,throttleOversteer:.04};
    case 'lightweight': return {frontDrive:0,turnIn:1.10,stability:.88,throttleOversteer:.18};
    case 'rearengine': return {frontDrive:0,turnIn:1.04,stability:.94,throttleOversteer:.12};
    default: return {frontDrive:0,turnIn:1.06,stability:.92,throttleOversteer:.16};
  }
}

function updateGearbox(car,forward,throttle,dt){
  const wheelR=.35;
  car.shiftTimer=Math.max(0,car.shiftTimer-dt);
  if(forward<-.8){
    car.gear=-1;
    car.rpm=clamp(IDLE_RPM+Math.abs(forward)*165,IDLE_RPM,5200);
    return;
  }
  if(car.gear<1)car.gear=1;
  const wheelRpm=Math.abs(forward)/(Math.PI*2*wheelR)*60;
  let rpm=Math.max(IDLE_RPM,wheelRpm*GEAR_RATIOS[car.gear]*FINAL_DRIVE);
  if(car.shiftTimer<=0){
    const kickdown=throttle>.72&&car.gear>1&&rpm<3550&&Math.abs(forward)>7;
    if(kickdown){car.gear--;car.shiftTimer=.10;rpm*=1.30;}
    else if(rpm>SHIFT_UP_RPM&&car.gear<6){car.gear++;car.shiftTimer=.15;rpm*=.72;}
    else if(rpm<SHIFT_DOWN_RPM&&car.gear>1){car.gear--;car.shiftTimer=.11;rpm*=1.27;}
  }
  car.rpm=clamp(rpm,IDLE_RPM,REDLINE_RPM+400);
}

function tireForce(slip,stiffness,limit,falloff=.95){
  if(limit<=1)return 0;
  const abs=Math.abs(slip);
  const peak=Math.tanh(-stiffness*slip/limit);
  // Past the useful slip range the tire progressively lets go instead of staying glued forever.
  const fade=1/(1+Math.max(0,abs-.16)*falloff*5.5);
  return limit*peak*fade;
}

export function createVehicle(spec,p,track){
  const spawn={};
  track.at(track.length-14-p*5,p===0?-2.5:2.5,spawn);
  const weight=spec.mass*9.81;
  return {
    p,spec,x:spawn.x,z:spawn.z,prevX:spawn.x,prevZ:spawn.z,
    a:Math.atan2(spawn.tx,spawn.tz),vx:0,vz:0,v:0,longitudinal:0,lateral:0,
    yawRate:0,steerAngle:0,wheelSpin:0,n:100,boost:false,handbrake:false,
    roll:0,pitch:0,surface:'asphalt',contact:{index:spawn.index},
    progress:track.createProgress(),collisionCount:0,resetCooldown:0,
    gear:1,rpm:IDLE_RPM,shiftTimer:0,slipAngle:0,tractionAssist:0,stabilityAssist:0,
    brakeAssist:0,longAccel:0,frontLoad:weight*.52,rearLoad:weight*.48,driveLayout:chassisTuning(spec).frontDrive>0?'AWD':'RWD'
  };
}

export function stepVehicle(car,input,track,dt=FIXED_DT){
  car.prevX=car.x;car.prevZ=car.z;
  const spec=car.spec,mass=spec.mass,wb=spec.wheelbase,lf=wb*.48,lr=wb-lf,tune=chassisTuning(spec);
  track.query(car.x,car.z,car.contact);
  car.surface=car.contact.surface;
  const surface=SURFACES[car.surface];

  const sin=Math.sin(car.a),cos=Math.cos(car.a);
  const forward=car.vx*sin+car.vz*cos;
  const lateral=car.vx*cos-car.vz*sin;
  const speed=Math.hypot(car.vx,car.vz);
  const absForward=Math.abs(forward);
  const throttle=clamp(input.throttle||0,0,1);
  let brake=clamp(input.brake||0,0,1);

  // Fast low-speed rack, progressively calmer above city speeds. A little more authority remains
  // around 100-160 km/h so the car can still attack MW-like sweeping corners.
  const speedBlend=clamp(absForward/62,0,1);
  const steerLimit=lerp(.61,.215,Math.pow(speedBlend,.70));
  const steerResponse=lerp(13.0,7.3,speedBlend);
  const targetSteer=-clamp(input.steer||0,-1,1)*steerLimit;
  car.steerAngle+=(targetSteer-car.steerAngle)*(1-Math.exp(-dt*steerResponse));

  car.handbrake=(input.handbrake||0)>.5&&absForward>2.5;
  car.boost=(input.nitro||0)>.5&&throttle>0&&forward>-1&&car.n>0;
  car.n=clamp(car.n+(car.boost?-30:6.5)*dt,0,100);

  updateGearbox(car,forward,throttle,dt);

  const weight=mass*9.81;
  const staticFront=weight*(lr/wb),staticRear=weight*(lf/wb);
  const transfer=mass*clamp(car.longAccel,-13,13)*CG_HEIGHT/wb;
  const aero=weight*clamp(speed*speed*.000075,0,.30);
  car.frontLoad=clamp(staticFront-transfer+aero*.46,weight*.25,weight*.80);
  car.rearLoad=clamp(staticRear+transfer+aero*.54,weight*.20,weight*.82);

  const surfaceMu=surface.grip*spec.grip;
  const frontGrip=car.frontLoad*surfaceMu;
  const rearGripBase=car.rearLoad*surfaceMu;

  const reverseRequest=brake>0&&forward<.72&&throttle===0;
  let drive=0;
  if(reverseRequest){
    drive=-brake*spec.power*.50/(1+absForward/12);
    brake=0;
  }else if(throttle>0){
    const curve=torqueCurve(car.rpm);
    const gearMul=GEAR_FORCE[Math.max(1,car.gear)]||.84;
    const speedFalloff=1/(1+Math.max(0,forward)/46);
    const shiftCut=car.shiftTimer>0?.60:1;
    drive=throttle*spec.power*curve*gearMul*speedFalloff*shiftCut*(car.boost?1.50:1);
  }

  // AWD classes share demand between axles; RWD cars ask the rear axle for all propulsion.
  const driveFrontShare=tune.frontDrive;
  const driveRearShare=1-driveFrontShare;
  const driveCapacity=frontGrip*driveFrontShare*.92+rearGripBase*driveRearShare*.94;
  const rawDrive=Math.abs(drive);
  const tractionRatio=rawDrive/(driveCapacity||1);
  car.tractionAssist=clamp((tractionRatio-.86)/.42,0,1);
  if(!car.handbrake&&tractionRatio>.86){
    const scale=lerp(1,.72,car.tractionAssist);
    drive*=scale;
  }

  let brakeForce=brake*weight*1.33*Math.tanh(forward*2.2);
  const maxBrake=(frontGrip+rearGripBase)*.96;
  car.brakeAssist=clamp((Math.abs(brakeForce)-maxBrake*.84)/(maxBrake*.35||1),0,1);
  if(Math.abs(brakeForce)>maxBrake)brakeForce=Math.sign(brakeForce)*maxBrake;
  const handbrakeForce=(car.handbrake?weight*.19:0)*Math.tanh(forward*2.2);

  // Lift-off / engine braking is deliberately noticeable, as in an arcade racer, but not enough to spin the car.
  const engineBrake=throttle<.04&&brake<.04&&absForward>4?weight*.018*Math.tanh(forward*.4):0;
  const drag=spec.drag*forward*Math.abs(forward)*1.10;
  const rolling=surface.rolling*weight*Math.tanh(forward*2);
  const fx=drive-brakeForce-handbrakeForce-engineBrake-drag-rolling;

  const denom=Math.max(4.5,absForward);
  const frontSlip=Math.atan2(lateral+lf*car.yawRate,denom)-car.steerAngle*Math.tanh(forward/1.8);
  const rearSlip=Math.atan2(lateral-lr*car.yawRate,denom);
  car.slipAngle=Math.atan2(lateral,Math.max(1,absForward));

  const driveFront=Math.abs(drive)*driveFrontShare;
  const driveRear=Math.abs(drive)*driveRearShare;
  const brakeFront=Math.abs(brakeForce)*.67;
  const brakeRear=Math.abs(brakeForce)*.33+Math.abs(handbrakeForce);
  const frontLongUse=clamp((driveFront+brakeFront)/(frontGrip||1),0,.97);
  const rearLongUse=clamp((driveRear+brakeRear)/(rearGripBase||1),0,.97);
  const frontBudget=Math.sqrt(Math.max(.06,1-frontLongUse*frontLongUse));
  const rearBudget=Math.sqrt(Math.max(.05,1-rearLongUse*rearLongUse));

  const turnDemand=clamp(Math.abs(car.steerAngle)/.45,0,1)*clamp(absForward/12,0,1);
  const powerOversteer=tune.throttleOversteer*throttle*turnDemand;
  const rearRelease=car.handbrake?.36:clamp(1-powerOversteer,.72,1);
  const frontLimit=frontGrip*frontBudget;
  const rearLimit=rearGripBase*rearBudget*rearRelease;
  const frontStiff=76000+mass*8.5;
  const rearStiff=81500+mass*8.0;
  const fFront=tireForce(frontSlip,frontStiff,frontLimit,.80);
  const fRear=tireForce(rearSlip,rearStiff,rearLimit,car.handbrake?1.35:.92);

  // Stability control follows the bicycle-model yaw target and suppresses only excess slip.
  // It fades heavily while drifting so the driver can hold an angle rather than being snapped straight.
  const idealYaw=absForward>1?forward*Math.tan(car.steerAngle)/wb:0;
  const yawError=idealYaw-car.yawRate;
  const slipExcess=Math.sign(car.slipAngle)*Math.max(0,Math.abs(car.slipAngle)-.055);
  const stabilityFade=car.handbrake?.12:clamp(1-Math.abs(car.slipAngle)/.48,.28,1);
  const stabilityGain=tune.stability*surfaceMu*stabilityFade;
  const inertia=mass*wb*wb*.285;
  const stabilityMoment=(yawError*inertia*.70-slipExcess*inertia*2.25)*stabilityGain;
  car.stabilityAssist=stabilityMoment;

  // Gentle lateral damping keeps tiny corrections planted, but it no longer kills a real drift angle.
  const dampWindow=1-clamp(Math.abs(car.slipAngle)/.20,0,1);
  const lateralDamping=clamp(-lateral*mass*(.72+absForward*.010)*dampWindow*stabilityGain,-(frontGrip+rearGripBase)*.10,(frontGrip+rearGripBase)*.10);
  const fy=fFront*Math.cos(car.steerAngle)+fRear+lateralDamping;

  // Turn-in assist acts as a small chassis moment, not as a teleporting rotation.
  const turnIn=-car.steerAngle*forward*Math.min(absForward,34)*mass*.0048*tune.turnIn;
  let yawAccel=(lf*fFront*Math.cos(car.steerAngle)-lr*fRear+stabilityMoment+turnIn)/inertia;
  yawAccel-=car.yawRate*(car.handbrake?.10:.32);
  if(absForward<1.2)yawAccel*=absForward/1.2;
  car.yawRate=clamp(car.yawRate+yawAccel*dt,-3.05,3.05);

  car.vx+=(sin*fx+cos*fy)/mass*dt;
  car.vz+=(cos*fx-sin*fy)/mass*dt;

  if(speed<.16&&throttle===0&&brake===0){
    car.vx*=Math.exp(-dt*18);car.vz*=Math.exp(-dt*18);car.yawRate*=Math.exp(-dt*14);
  }

  car.a+=car.yawRate*dt;
  car.a=Math.atan2(Math.sin(car.a),Math.cos(car.a));
  car.x+=car.vx*dt;car.z+=car.vz*dt;

  const newSin=Math.sin(car.a),newCos=Math.cos(car.a);
  const newForward=car.vx*newSin+car.vz*newCos;
  const measuredAccel=(newForward-forward)/Math.max(dt,1e-4);
  car.longAccel+= (clamp(measuredAccel,-18,18)-car.longAccel)*(1-Math.exp(-dt*7));
  car.longitudinal=newForward;
  car.lateral=car.vx*newCos-car.vz*newSin;
  car.v=car.longitudinal;
  car.wheelSpin=(car.wheelSpin+car.longitudinal*dt/.35)%(Math.PI*2);

  const lateralG=fy/weight;
  car.roll+=(-clamp(lateralG*.067,-.095,.095)-car.roll)*(1-Math.exp(-dt*8));
  car.pitch+=(clamp(-car.longAccel/9.81*.032,-.052,.052)-car.pitch)*(1-Math.exp(-dt*8));
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
  car.vx=car.vz=car.yawRate=car.steerAngle=0;car.gear=1;car.rpm=IDLE_RPM;car.shiftTimer=0;
  car.longAccel=0;car.slipAngle=0;car.resetCooldown=2;
  return true;
}
