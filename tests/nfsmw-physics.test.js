import test from 'node:test';
import assert from 'node:assert/strict';
import {Track} from '../www/track.js';
import {CAR_SPECS} from '../www/cars.js';
import {createVehicle,stepVehicle,collideBarrier,FIXED_DT,PHYSICS_PROFILE} from '../www/physics-nfsmw.js';

const track=new Track();
const controls=()=>({steer:0,throttle:0,brake:0,nitro:0,handbrake:0,reset:0});
function run(car,input,seconds,walls=true){for(let t=0;t<seconds;t+=FIXED_DT){stepVehicle(car,input,track);if(walls)collideBarrier(car,track);}}
function place(car,s,lateral=0){const out={};track.at(s,lateral,out);car.x=car.prevX=out.x;car.z=car.prevZ=out.z;car.a=Math.atan2(out.tx,out.tz);car.vx=car.vz=car.yawRate=0;car.contact.index=out.index;}
function finiteCar(car){for(const key of ['x','z','vx','vz','a','yawRate','steerAngle','rpm','slipAngle','longAccel','frontLoad','rearLoad','tractionAssist','brakeAssist','stabilityAssist'])assert.ok(Number.isFinite(car[key]),`${key} must stay finite`);}

test('phase 2 profile is isolated and drivetrain stays valid',()=>{
  assert.equal(PHYSICS_PROFILE,'nfsmw-experimental-v2');
  const car=createVehicle(CAR_SPECS[0],0,track),k=controls();place(car,35);k.throttle=1;run(car,k,5);
  finiteCar(car);
  assert.ok(Math.hypot(car.vx,car.vz)>5,'throttle should move the car');
  assert.ok(car.gear>=1&&car.gear<=6,'automatic gearbox stays in range');
  assert.ok(car.rpm>=900&&car.rpm<8000,'rpm stays in the modeled band');
  assert.equal(car.driveLayout,'AWD');
});

test('RWD and AWD chassis profiles are both active',()=>{
  const awd=createVehicle(CAR_SPECS[1],0,track),rwd=createVehicle(CAR_SPECS[2],0,track);
  assert.equal(awd.driveLayout,'AWD');
  assert.equal(rwd.driveLayout,'RWD');
});

test('nitrous consumes its tank without destabilizing the car',()=>{
  const car=createVehicle(CAR_SPECS[1],0,track);place(car,80);const k=controls();k.throttle=1;k.nitro=1;run(car,k,2);
  finiteCar(car);assert.ok(car.n<60,'boost should consume N2O');assert.equal(car.boost,true);
});

test('longitudinal load transfer responds to acceleration and braking',()=>{
  const car=createVehicle(CAR_SPECS[3],0,track);place(car,60);const k=controls();k.throttle=1;run(car,k,1.1,false);
  finiteCar(car);const accelFront=car.frontLoad,accelRear=car.rearLoad;
  assert.ok(accelRear>0&&accelFront>0,'axle loads remain positive');
  k.throttle=0;k.brake=1;run(car,k,.45,false);finiteCar(car);
  assert.ok(car.frontLoad>accelFront*.92,'braking should not unload the front axle');
  assert.ok(car.frontLoad>car.rearLoad*.90,'braking should shift the balance forward');
  assert.ok(accelRear>car.rearLoad*.85,'acceleration should have carried meaningful rear load');
});

test('steering and handbrake create a finite controllable drift state',()=>{
  const car=createVehicle(CAR_SPECS[2],0,track);place(car,110);const k=controls();k.throttle=.72;k.steer=.78;run(car,k,.8);k.handbrake=1;run(car,k,.8);
  finiteCar(car);assert.ok(Math.abs(car.steerAngle)>0.01,'steering rack should respond');assert.ok(Math.abs(car.yawRate)>0.001,'car should rotate');assert.ok(Math.abs(car.steerAngle)<=.62,'steering remains rack-limited');assert.equal(car.handbrake,true);
});

test('surface model exposes reduced-grip terrain to phase 2 physics',()=>{
  const grass=createVehicle(CAR_SPECS[4],0,track);place(grass,45,11);const k=controls();k.throttle=1;run(grass,k,.15,false);
  finiteCar(grass);assert.equal(grass.surface,'grass');
});
