import test from 'node:test';
import assert from 'node:assert/strict';
import {Track} from '../www/track.js';
import {CAR_SPECS} from '../www/cars.js';
import {createVehicle,stepVehicle,FIXED_DT,PHYSICS_PROFILE,MW4_INTERNALS} from '../www/physics-mw2005-wheel4.js';

const track=new Track();
const input=()=>({steer:0,throttle:0,brake:0,nitro:0,handbrake:0,reset:0});
function place(car,s,lateral=0){const o={};track.at(s,lateral,o);car.x=car.prevX=o.x;car.z=car.prevZ=o.z;car.a=Math.atan2(o.tx,o.tz);car.vx=car.vz=car.yawRate=0;car.longitudinal=car.lateral=0;car.contact.index=o.index;for(const w of car.wheels)w.contact.index=o.index;}
function run(car,k,seconds){for(let t=0;t<seconds;t+=FIXED_DT)stepVehicle(car,k,track,FIXED_DT);}
function finiteWheel(w){for(const key of ['load','compression','omega','angularAcc','roadSpeed','slipSpeed','slipAngle','traction','driveTorque','brakeTorque','longForce','latForce','spin'])assert.ok(Number.isFinite(w[key]),`${w.name}.${key} must be finite`);}

test('Phase 4 exposes the four-wheel profile',()=>{assert.equal(PHYSICS_PROFILE,'mw2005-four-wheel-phase4');});

test('vehicles own four independent wheel states at real axle positions',()=>{
  const car=createVehicle(CAR_SPECS[0],0,track);
  assert.equal(car.wheelModel,'four-wheel-planar');assert.equal(car.wheels.length,4);
  assert.deepEqual(car.wheels.map(w=>w.name),['FL','FR','RL','RR']);
  assert.ok(car.wheels[0].z>0&&car.wheels[2].z<0);
  assert.ok(car.wheels[0].x<0&&car.wheels[1].x>0);
  car.wheels.forEach(finiteWheel);
});

test('Ackermann gives the inside front wheel more steering angle',()=>{
  const [left,right]=MW4_INTERNALS.ackermann(.35,2.73,1.55);
  assert.ok(right>left&&left>0);
  const [left2,right2]=MW4_INTERNALS.ackermann(-.35,2.73,1.55);
  assert.ok(Math.abs(left2)>Math.abs(right2)&&left2<0&&right2<0);
});

test('RWD M3 sends engine torque only to rear wheels while AWD Evo drives all four',()=>{
  const m3=createVehicle(CAR_SPECS[0],0,track),evo=createVehicle(CAR_SPECS[4],0,track);place(m3,40);place(evo,40);
  const k=input();k.throttle=1;stepVehicle(m3,k,track,FIXED_DT);stepVehicle(evo,k,track,FIXED_DT);
  assert.equal(m3.wheels[0].driveTorque,0);assert.equal(m3.wheels[1].driveTorque,0);assert.ok(m3.wheels[2].driveTorque>0&&m3.wheels[3].driveTorque>0);
  assert.ok(evo.wheels.every(w=>w.driveTorque>0));
});

test('lateral load transfer creates left/right wheel-load separation',()=>{
  const car=createVehicle(CAR_SPECS[0],0,track);place(car,70);car.latAccel=8;stepVehicle(car,input(),track,FIXED_DT);
  assert.notEqual(car.wheels[0].load,car.wheels[1].load);assert.notEqual(car.wheels[2].load,car.wheels[3].load);
  assert.ok(car.wheels.every(w=>w.load>0));
});

test('each wheel resolves its own track surface near the road edge',()=>{
  const car=createVehicle(CAR_SPECS[2],0,track);place(car,90,7.8);stepVehicle(car,input(),track,FIXED_DT);
  const surfaces=new Set(car.wheels.map(w=>w.surface));
  assert.ok(surfaces.size>=2,`expected split surfaces, got ${[...surfaces].join(',')}`);
});

test('handbrake is rear-wheel only and can lock rear wheels independently',()=>{
  const car=createVehicle(CAR_SPECS[2],0,track);place(car,100);const s=Math.sin(car.a),c=Math.cos(car.a);car.vx=s*16;car.vz=c*16;car.longitudinal=16;
  const k=input();k.handbrake=1;k.steer=.35;run(car,k,.25);
  assert.equal(car.wheels[0].ebrakeInput,0);assert.equal(car.wheels[1].ebrakeInput,0);assert.equal(car.wheels[2].ebrakeInput,1);assert.equal(car.wheels[3].ebrakeInput,1);
  assert.ok(car.wheels.slice(2).some(w=>w.brakeLocked||Math.abs(w.slipSpeed)>1));
  car.wheels.forEach(finiteWheel);
});

test('four-wheel M3 remains numerically stable under full-throttle acceleration',()=>{
  const car=createVehicle(CAR_SPECS[0],0,track);place(car,35);const k=input();k.throttle=1;run(car,k,4);
  assert.ok(Math.hypot(car.vx,car.vz)>6,'M3 should accelerate');
  assert.ok(Number.isFinite(car.x)&&Number.isFinite(car.z)&&Number.isFinite(car.yawRate));
  assert.ok(car.gear>=1&&car.gear<=6);assert.ok(car.traction>=0&&car.traction<=1);
  car.wheels.forEach(finiteWheel);
});
