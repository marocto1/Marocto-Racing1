import test from 'node:test';
import assert from 'node:assert/strict';
import {Track} from '../www/track.js';
import {CAR_SPECS} from '../www/cars.js';
import {createVehicle,stepVehicle,collideBarrier,FIXED_DT,PHYSICS_PROFILE} from '../www/physics-nfsmw.js';

const track=new Track();
const controls=()=>({steer:0,throttle:0,brake:0,nitro:0,handbrake:0,reset:0});
function run(car,input,seconds,walls=true){for(let t=0;t<seconds;t+=FIXED_DT){stepVehicle(car,input,track);if(walls)collideBarrier(car,track);}}
function place(car,s,lateral=0){const out={};track.at(s,lateral,out);car.x=car.prevX=out.x;car.z=car.prevZ=out.z;car.a=Math.atan2(out.tx,out.tz);car.vx=car.vz=car.yawRate=0;car.contact.index=out.index;}

test('experimental profile is isolated and launches through an automatic gearbox',()=>{
  assert.equal(PHYSICS_PROFILE,'nfsmw-experimental-v1');
  const car=createVehicle(CAR_SPECS[0],0,track),k=controls();place(car,35);k.throttle=1;run(car,k,7);
  assert.ok(Math.hypot(car.vx,car.vz)>16,'car should accelerate strongly');
  assert.ok(car.gear>=2,'automatic gearbox should upshift');
  assert.ok(car.rpm>=900&&car.rpm<7600,'rpm should stay in the modeled engine band');
});

test('nitrous adds acceleration and consumes the N2O tank',()=>{
  const normal=createVehicle(CAR_SPECS[1],0,track),boosted=createVehicle(CAR_SPECS[1],0,track);place(normal,80);place(boosted,80);
  const a=controls(),b=controls();a.throttle=b.throttle=1;b.nitro=1;run(normal,a,2.5);run(boosted,b,2.5);
  assert.ok(boosted.n<normal.n-20,'boost should consume N2O');
  assert.ok(Math.hypot(boosted.vx,boosted.vz)>Math.hypot(normal.vx,normal.vz),'boost should increase speed');
});

test('speed-sensitive steering and handbrake permit controllable arcade slip',()=>{
  const normal=createVehicle(CAR_SPECS[2],0,track),drift=createVehicle(CAR_SPECS[2],0,track);place(normal,110);place(drift,110);
  const k=controls();k.throttle=.65;k.steer=.75;run(normal,k,1.2);const normalSlip=Math.abs(normal.lateral);
  const d=controls();d.throttle=.65;d.steer=.75;d.handbrake=1;run(drift,d,1.2);
  assert.ok(Math.abs(drift.yawRate)>.02,'handbrake turn should rotate the car');
  assert.ok(Math.abs(drift.lateral)>normalSlip+.05,'handbrake should produce more lateral slip');
  assert.ok(Math.abs(drift.steerAngle)<=.61,'steering remains rack-limited');
});

test('low-grip surfaces still matter under the arcade assists',()=>{
  const road=createVehicle(CAR_SPECS[4],0,track),grass=createVehicle(CAR_SPECS[4],0,track);place(road,45,0);place(grass,45,11);
  const k=controls();k.throttle=1;run(road,k,1.3,false);run(grass,k,1.3,false);
  assert.equal(grass.surface,'grass');
  assert.ok(road.longitudinal>grass.longitudinal+.5,'grass should accelerate worse than asphalt');
});
