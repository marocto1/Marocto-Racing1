import {SURFACES} from './track.js';
export const FIXED_DT=1/120;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function createVehicle(spec,p,track){
  const spawn={};track.at(track.length-14-p*5,p===0?-2.5:2.5,spawn);
  return {p,spec,x:spawn.x,z:spawn.z,prevX:spawn.x,prevZ:spawn.z,a:Math.atan2(spawn.tx,spawn.tz),vx:0,vz:0,v:0,longitudinal:0,lateral:0,yawRate:0,steerAngle:0,wheelSpin:0,n:100,boost:false,handbrake:false,roll:0,pitch:0,surface:'asphalt',contact:{index:spawn.index},progress:track.createProgress(),collisionCount:0,resetCooldown:0};
}
export function stepVehicle(car,input,track,dt=FIXED_DT){
  car.prevX=car.x;car.prevZ=car.z;const spec=car.spec,mass=spec.mass,lf=spec.wheelbase*.48,lr=spec.wheelbase-lf;
  track.query(car.x,car.z,car.contact);car.surface=car.contact.surface;const surface=SURFACES[car.surface];
  const sin=Math.sin(car.a),cos=Math.cos(car.a),forward=car.vx*sin+car.vz*cos,lateral=car.vx*cos-car.vz*sin,speed=Math.hypot(car.vx,car.vz);
  // Steering rack, not immediate yaw. Full lock at walking speed, gentler at speed.
  const steerLimit=.57/(1+Math.abs(forward)/22);const target=input.steer*steerLimit;
  car.steerAngle+=(target-car.steerAngle)*(1-Math.exp(-dt*8));
  car.handbrake=input.handbrake>.5;
  car.boost=input.nitro>.5&&input.throttle>0&&forward>-1&&car.n>0;
  car.n=clamp(car.n+(car.boost?-28:7)*dt,0,100);
  const weight=mass*9.81,mu=surface.grip*spec.grip,frontLimit=weight*.50*mu,rearLimit=weight*.50*mu*(car.handbrake?.24:1);
  // Torque-limited launch, power-limited at speed; no artificial top-speed clamp.
  let drive=input.throttle*spec.power/(1+Math.max(0,forward)/32)*(car.boost?1.48:1);
  let brake=input.brake;
  if(brake>0&&forward<.65&&input.throttle===0){drive=-brake*spec.power*.48/(1+Math.abs(forward)/10);brake=0;}
  const brakeForce=(brake*weight*1.12+(car.handbrake?weight*.23:0))*Math.tanh(forward*2);
  drive=clamp(drive,-weight*mu*.7,weight*mu*.85);
  const drag=spec.drag*forward*Math.abs(forward),rolling=surface.rolling*weight*Math.tanh(forward*2);
  const fx=drive-brakeForce-drag-rolling;
  const denominator=Math.max(5.5,Math.abs(forward));
  const frontSlip=Math.atan2(lateral+lf*car.yawRate,denominator)-car.steerAngle*Math.tanh(forward/2);
  const rearSlip=Math.atan2(lateral-lr*car.yawRate,denominator);
  // Combined tire budget: acceleration/braking also use some available grip.
  const use=Math.min(.88,Math.abs(drive-brakeForce)/(weight*mu||1));
  const budget=Math.sqrt(1-use*use);
  const fFront=frontLimit*budget*Math.tanh(-72000*frontSlip/(frontLimit||1));
  const fRear=rearLimit*budget*Math.tanh(-78000*rearSlip/(rearLimit||1));
  const fy=fFront*Math.cos(car.steerAngle)+fRear;
  const inertia=mass*spec.wheelbase*spec.wheelbase*.29;
  car.yawRate+=((lf*fFront*Math.cos(car.steerAngle)-lr*fRear)/inertia-car.yawRate*.55)*dt;
  car.yawRate=clamp(car.yawRate,-2.7,2.7);
  car.vx+=(sin*fx+cos*fy)/mass*dt;car.vz+=(cos*fx-sin*fy)/mass*dt;
  // Static friction prevents idle creep and handbrake turning in place.
  if(speed<.16&&input.throttle===0&&input.brake===0){car.vx*=Math.exp(-dt*16);car.vz*=Math.exp(-dt*16);car.yawRate*=Math.exp(-dt*12);}
  car.a+=car.yawRate*dt;car.a=Math.atan2(Math.sin(car.a),Math.cos(car.a));
  car.x+=car.vx*dt;car.z+=car.vz*dt;
  car.longitudinal=car.vx*Math.sin(car.a)+car.vz*Math.cos(car.a);car.lateral=car.vx*Math.cos(car.a)-car.vz*Math.sin(car.a);car.v=car.longitudinal;
  car.wheelSpin=(car.wheelSpin+car.longitudinal*dt/.35)%(Math.PI*2);
  car.roll+=(-clamp(fy/weight*.07,-.085,.085)-car.roll)*(1-Math.exp(-dt*7));
  car.pitch+=(clamp(-fx/weight*.035,-.04,.04)-car.pitch)*(1-Math.exp(-dt*7));
  car.resetCooldown=Math.max(0,car.resetCooldown-dt);
}
export function collideBarrier(car,track){
  track.query(car.x,car.z,car.contact);const q=car.contact,sin=Math.sin(car.a),cos=Math.cos(car.a);
  // Support radius of oriented car against the continuous two-sided track boundary.
  const support=Math.abs(q.nx*cos-q.nz*sin)*car.spec.width*.5+Math.abs(q.nx*sin+q.nz*cos)*car.spec.length*.5;
  const max=track.barrierOffset-.24-support,sign=Math.sign(q.lateral)||1,penetration=Math.abs(q.lateral)-max;
  if(penetration<=0)return false;
  const nx=q.nx*sign,nz=q.nz*sign;car.x-=nx*penetration;car.z-=nz*penetration;
  const vn=car.vx*nx+car.vz*nz;
  if(vn>0){
    // Restitution affects normal velocity; tangential movement survives a glancing hit.
    car.vx-=nx*vn*1.16;car.vz-=nz*vn*1.16;
    const tangent=car.vx*(-nz)+car.vz*nx,friction=Math.min(Math.abs(tangent),vn*.18)*Math.sign(tangent);
    car.vx+=nz*friction;car.vz-=nx*friction;car.yawRate*=.68;car.collisionCount++;
  }return true;
}
// Oriented rectangle SAT + contact impulse. All scratch axes are scalars.
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
    const impulse=-(1+.20)*relative/sum;
    a.vx-=impulse*ia*nx;a.vz-=impulse*ia*nz;b.vx+=impulse*ib*nx;b.vz+=impulse*ib*nz;
    const tangent=(b.vx-a.vx)*(-nz)+(b.vz-a.vz)*nx,jt=clamp(-tangent/sum,-impulse*.16,impulse*.16);
    a.vx+=jt*ia*nz;a.vz-=jt*ia*nx;b.vx-=jt*ib*nz;b.vz+=jt*ib*nx;
    a.yawRate+=clamp(tangent*.012,-.2,.2);b.yawRate-=clamp(tangent*.012,-.2,.2);a.collisionCount++;b.collisionCount++;
  }return true;
}
export function resetVehicle(car,track){
  if(car.resetCooldown>0)return false;
  // Restore the last validated checkpoint; never skip ahead or advance lap progress.
  const out=car.contact;track.at(track.gates[car.progress.lastGate].s+4,car.p===0?-2.5:2.5,out);
  car.x=car.prevX=out.x;car.z=car.prevZ=out.z;car.a=Math.atan2(out.tx,out.tz);car.vx=car.vz=car.yawRate=car.steerAngle=0;car.resetCooldown=2;return true;
}
