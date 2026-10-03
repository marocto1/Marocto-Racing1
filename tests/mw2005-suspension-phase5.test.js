import test from 'node:test';
import assert from 'node:assert/strict';
import {Track} from '../www/track.js';
import {CAR_SPECS} from '../www/cars.js';
import {getMWData} from '../www/mw2005-data.js';
import {createAIController} from '../www/ai.js';
import {createVehicle,stepVehicle,collideBarrier,FIXED_DT,PHYSICS_PROFILE,MW5_INTERNALS} from '../www/physics-mw2005-suspension.js';

const track=new Track();
const controls=()=>({steer:0,throttle:0,brake:0,nitro:0,handbrake:0,reset:0});
function place(car,s,lateral=0){const o={};track.at(s,lateral,o);car.x=car.prevX=o.x;car.z=car.prevZ=o.z;car.a=Math.atan2(o.tx,o.tz);car.vx=car.vz=car.yawRate=0;car.contact.index=o.index;}
function run(car,k,seconds){for(let t=0;t<seconds;t+=FIXED_DT)stepVehicle(car,k,track,FIXED_DT);}
function finiteSuspension(car){
  assert.ok(Number.isFinite(car.suspension.heave));assert.ok(Number.isFinite(car.suspension.roll));assert.ok(Number.isFinite(car.suspension.pitch));
  for(const w of car.wheels)for(const key of ['load','suspensionCompression','suspensionVelocity','suspensionForce','suspensionSpringForce','suspensionDamperForce','swayForce','visualY'])assert.ok(Number.isFinite(w[key]),`${w.name}.${key}`);
}

test('Phase 5 exposes MW four-wheel spring/shock/sway profile',()=>{
  assert.equal(PHYSICS_PROFILE,'mw2005-four-wheel-suspension-phase5');
  const car=createVehicle(CAR_SPECS[0],0,track);
  assert.equal(car.wheelModel,'four-wheel-mw-suspension');
  assert.equal(car.suspension.model,'mw-spring-shock-sway-phase5');
  assert.equal(car.wheels.length,4);
});

test('original M3 suspension dataset is wired into Marocto Racing',()=>{
  const ch=getMWData(CAR_SPECS[0]).chassis;
  assert.deepEqual(ch.rideHeight,[6,6]);assert.deepEqual(ch.travel,[8,8]);
  assert.deepEqual(ch.shock,[60,50]);assert.deepEqual(ch.shockExt,[75,77]);assert.deepEqual(ch.shockValving,[20,20]);
  assert.deepEqual(ch.shockDigression,[.2,.2]);assert.deepEqual(ch.springProgression,[7.5,7.5]);assert.deepEqual(ch.sway,[200,200]);assert.equal(ch.shockBlowout,5);
});

test('MW spring progression recovers static wheel load',()=>{
  const ch=getMWData(CAR_SPECS[0]).chassis,load=CAR_SPECS[0].mass*9.81*(ch.frontBias*.01)*.5;
  const c=MW5_INTERNALS.staticCompression(load,ch.springs[0],ch.springProgression[0]);
  const force=MW5_INTERNALS.springForce(c,ch.springs[0],ch.springProgression[0]);
  assert.ok(c>0&&c<ch.travel[0]*.0254);assert.ok(Math.abs(force-load)/load<1e-8);
});

test('curb split creates independent wheel travel and anti-roll force',()=>{
  const car=createVehicle(CAR_SPECS[0],0,track);place(car,80,7.55);
  MW5_INTERNALS.prepareSuspensionLoads(car,track,FIXED_DT);finiteSuspension(car);
  const surfaces=new Set(car.wheels.map(w=>w.surface));
  assert.ok(surfaces.has('asphalt')||surfaces.has('curb'));
  const heights=car.wheels.map(w=>w.roadHeight),compressions=car.wheels.map(w=>w.suspensionCompression);
  assert.ok(Math.max(...heights)-Math.min(...heights)>.003,'split surface should create road-height difference');
  assert.ok(Math.max(...compressions)-Math.min(...compressions)>.002,'each wheel must have independent travel');
  assert.ok(car.wheels.some(w=>Math.abs(w.swayForce)>1),'anti-roll bar should react to left/right compression difference');
});

test('hard braking produces physical pitch/dive state without numerical instability',()=>{
  const car=createVehicle(CAR_SPECS[2],0,track);place(car,120,0);const s=Math.sin(car.a),c=Math.cos(car.a);car.vx=s*24;car.vz=c*24;
  const k=controls();k.brake=1;run(car,k,.8);finiteSuspension(car);
  assert.ok(Math.abs(car.suspension.pitch)>.002,'body pitch should react to braking');
  const front=(car.wheels[0].suspensionCompression+car.wheels[1].suspensionCompression)*.5,rear=(car.wheels[2].suspensionCompression+car.wheels[3].suspensionCompression)*.5;
  assert.notEqual(front,rear);
});

function driveLap(spec,level=2,limit=180){
  const car=createVehicle(spec,0,track),ai=createAIController(track);ai.reset(car);let maxOffset=0,maxSpeed=0,maxRoll=0,maxTravel=0;
  for(let t=0;t<limit;t+=FIXED_DT){
    const k=ai.sample(car,null,level,FIXED_DT);stepVehicle(car,k,track,FIXED_DT);collideBarrier(car,track);track.updateProgress(car,FIXED_DT);
    maxOffset=Math.max(maxOffset,Math.abs(car.contact.lateral||0));maxSpeed=Math.max(maxSpeed,Math.hypot(car.vx,car.vz));maxRoll=Math.max(maxRoll,Math.abs(car.roll));maxTravel=Math.max(maxTravel,car.suspension.maxTravelUse);
    finiteSuspension(car);if(car.progress.completed>=1)return {time:t,maxOffset,maxSpeed,maxRoll,maxTravel,next:car.progress.next};
  }
  return {time:Infinity,maxOffset,maxSpeed,maxRoll,maxTravel,next:car.progress.next};
}

test('Phase 5 M3 and AWD Evo complete full AI laps with active suspension',()=>{
  for(const spec of [CAR_SPECS[0],CAR_SPECS[4]]){
    const result=driveLap(spec);console.log('Phase5 lap',spec.class,result);
    assert.ok(result.time<180,`${spec.name}: stopped at checkpoint ${result.next}`);
    assert.ok(result.maxSpeed>12);assert.ok(result.maxOffset<13.5);assert.ok(result.maxRoll>.001);assert.ok(result.maxTravel>.05);
  }
});
