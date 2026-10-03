import test from 'node:test';
import assert from 'node:assert/strict';
import {Track} from '../www/track.js';
import {CAR_SPECS} from '../www/cars.js';
import {getMWData} from '../www/mw2005-data.js';
import {createVehicle,stepVehicle,FIXED_DT,PHYSICS_PROFILE,MW_INTERNALS} from '../www/physics-mw2005.js';

const track=new Track();
const input=()=>({steer:0,throttle:0,brake:0,nitro:0,handbrake:0,reset:0});
function place(car,s,lateral=0){const o={};track.at(s,lateral,o);car.x=car.prevX=o.x;car.z=car.prevZ=o.z;car.a=Math.atan2(o.tx,o.tz);car.vx=car.vz=car.yawRate=0;car.contact.index=o.index;}
function run(car,k,seconds){for(let t=0;t<seconds;t+=FIXED_DT)stepVehicle(car,k,track,FIXED_DT);}
function finite(car){for(const key of ['x','z','vx','vz','a','yawRate','steerAngle','rpm','frontLoad','rearLoad','slipAngle','driftValue','traction'])assert.ok(Number.isFinite(car[key]),`${key} must be finite`);}

test('Phase 3 exposes the direct MW adaptation profile',()=>{
  assert.equal(PHYSICS_PROFILE,'mw2005-real-port-phase3');
});

test('original M3 GTR torque table and calculated shift points are wired',()=>{
  const mw=getMWData(CAR_SPECS[0]);
  assert.equal(mw.source,'MW2005/bmwm3gtre46');
  assert.equal(MW_INTERNALS.torqueFtLb(mw,mw.engine.idle),170);
  assert.equal(mw.engine.redline,8500);
  const points=MW_INTERNALS.shiftPoints(mw);
  assert.equal(points.up.length,6);
  assert.equal(points.down.length,6);
  for(const rpm of points.up)assert.ok(Number.isFinite(rpm)&&rpm>=mw.engine.idle&&rpm<=mw.engine.redline);
});

test('all six Marocto cars resolve to original Black Box datasets',()=>{
  const sources=CAR_SPECS.map(spec=>getMWData(spec).source);
  assert.deepEqual(sources,[
    'MW2005/bmwm3gtre46','Carbon/skyline','MW2005/supra','MW2005/rx7','MW2005/lancerevo8','MW2005/911turbo'
  ]);
});

test('MW torque, gearing and traction accelerate the M3 without numerical instability',()=>{
  const car=createVehicle(CAR_SPECS[0],0,track);place(car,35);const k=input();k.throttle=1;run(car,k,4);finite(car);
  assert.ok(Math.hypot(car.vx,car.vz)>8,'M3 should build meaningful speed');
  assert.ok(car.gear>=1&&car.gear<=6);
  assert.ok(car.rpm>=car.mw.engine.idle&&car.rpm<=car.mw.engine.redline+1);
  assert.equal(car.driveLayout,'RWD');
});

test('Evo and Skyline use AWD torque split while Supra remains RWD',()=>{
  const skyline=createVehicle(CAR_SPECS[1],0,track),supra=createVehicle(CAR_SPECS[2],0,track),evo=createVehicle(CAR_SPECS[4],0,track);
  assert.equal(skyline.driveLayout,'AWD');assert.equal(supra.driveLayout,'RWD');assert.equal(evo.driveLayout,'AWD');
});

test('load-sensitive MW lateral force grows with wheel load',()=>{
  const mw=getMWData(CAR_SPECS[0]),slip=6*Math.PI/180;
  const low=MW_INTERNALS.lateralTireForce(mw,0,2000,slip,1),high=MW_INTERNALS.lateralTireForce(mw,0,5000,slip,1);
  assert.ok(high>low&&low>0);
});

test('handbrake can enter the MW drift state above 30 mph',()=>{
  const car=createVehicle(CAR_SPECS[2],0,track);place(car,100);const sin=Math.sin(car.a),cos=Math.cos(car.a);car.vx=sin*16;car.vz=cos*16;
  const k=input();k.throttle=.55;k.steer=.8;k.handbrake=1;run(car,k,.35);finite(car);
  assert.ok(car.driftValue>0,'drift state should ramp in');
});

test('surface grip still participates in the adapted tire solver',()=>{
  const car=createVehicle(CAR_SPECS[4],0,track);place(car,45,11);const k=input();k.throttle=.5;run(car,k,.1);finite(car);assert.equal(car.surface,'grass');
});
