import test from 'node:test';
import assert from 'node:assert/strict';
import {Track} from '../www/track.js';
import {CAR_SPECS} from '../www/cars.js';
import {createAIController} from '../www/ai.js';
import {
  createVehicle,
  stepVehicle,
  collideBarrier,
  FIXED_DT,
  PHYSICS_PROFILE,
  MW6_INTERNALS
} from '../www/physics-mw2005-grip.js';

const track=new Track();

function body(car){
  const s=Math.sin(car.a),c=Math.cos(car.a);
  return {forward:car.vx*s+car.vz*c,lateral:car.vx*c-car.vz*s};
}

function driveLap(spec,level=2,limit=190){
  const car=createVehicle(spec,0,track),ai=createAIController(track);ai.reset(car);
  let maxOffset=0,maxSpeed=0,maxSlip=0,maxYaw=0;
  for(let t=0;t<limit;t+=FIXED_DT){
    const control=ai.sample(car,null,level,FIXED_DT);
    stepVehicle(car,control,track,FIXED_DT);
    collideBarrier(car,track);
    track.updateProgress(car,FIXED_DT);
    maxOffset=Math.max(maxOffset,Math.abs(car.contact.lateral||0));
    maxSpeed=Math.max(maxSpeed,Math.hypot(car.vx,car.vz));
    maxSlip=Math.max(maxSlip,Math.abs(car.phase6?.slipAngle||0));
    maxYaw=Math.max(maxYaw,Math.abs(car.yawRate||0));
    assert.ok(Number.isFinite(car.x)&&Number.isFinite(car.z)&&Number.isFinite(car.yawRate));
    if(car.progress.completed>=1)return {time:t,maxOffset,maxSpeed,maxSlip,maxYaw,next:car.progress.next};
  }
  return {time:Infinity,maxOffset,maxSpeed,maxSlip,maxYaw,next:car.progress.next};
}

test('Phase 6 exposes road-grip drivetrain profile and assist state',()=>{
  const car=createVehicle(CAR_SPECS[0],0,track);
  assert.equal(PHYSICS_PROFILE,'mw2005-grip-drivetrain-phase6');
  assert.equal(car.assistModel,'road-grip-tcs-abs-esc');
  assert.equal(typeof car.phase6.tcsActive,'boolean');
  assert.equal(typeof car.phase6.absActive,'boolean');
  assert.equal(typeof car.phase6.escActive,'boolean');
});

test('TCS reduces throttle when driven wheels report excessive slip',()=>{
  const car=createVehicle(CAR_SPECS[0],0,track);
  const driven=car.wheels.filter(w=>MW6_INTERNALS.drivenWheel(car,w));
  assert.ok(driven.length>=2);
  for(const w of driven){w.roadSpeed=18;w.slipSpeed=12;}
  const out=MW6_INTERNALS.tractionControl(car,1,25);
  assert.ok(out<.8,`expected TCS intervention, got throttle ${out}`);
  assert.equal(car.phase6.tcsActive,true);
});

test('ABS releases service brake after a wheel-lock event but not handbrake drift',()=>{
  const car=createVehicle(CAR_SPECS[0],0,track);
  car.wheels[0].brakeLocked=true;car.wheels[0].ebrakeInput=0;
  const service=MW6_INTERNALS.absControl(car,1,false);
  assert.ok(service<1&&service>0);
  assert.equal(car.phase6.absActive,true);
  const handbrake=MW6_INTERNALS.absControl(car,1,true);
  assert.equal(handbrake,1);
});

test('ESC catches unintended road oversteer without deleting explicit handbrake drift',()=>{
  const car=createVehicle(CAR_SPECS[0],0,track);
  car.a=0;car.vx=14;car.vz=30;car.longitudinal=30;car.lateral=14;car.yawRate=2.2;car.steerAngle=.08;car.driftValue=.82;
  const before=body(car),yawBefore=Math.abs(car.yawRate);
  MW6_INTERNALS.stabilizeRoadCar(car,{steer:.35,handbrake:0},FIXED_DT);
  const after=body(car);
  assert.ok(Math.abs(after.lateral)<Math.abs(before.lateral),'ESC should reduce runaway lateral velocity');
  assert.ok(Math.abs(car.yawRate)<yawBefore,'ESC should reduce excessive yaw rate');
  assert.ok(car.driftValue<.2,'ordinary road cornering should not remain in deep drift friction state');

  car.vx=14;car.vz=30;car.yawRate=1.4;car.driftValue=.75;
  MW6_INTERNALS.stabilizeRoadCar(car,{steer:.8,handbrake:1},FIXED_DT);
  assert.ok(car.driftValue>.7,'handbrake should keep intentional drift state available');
});

test('digital steering is shaped instead of instantly slamming full lock at speed',()=>{
  const car=createVehicle(CAR_SPECS[0],0,track);
  const first=MW6_INTERNALS.shapeSteering(car,{steer:1},FIXED_DT,38);
  assert.ok(first>0&&first<.2,`first keyboard steering step should be progressive, got ${first}`);
  for(let i=0;i<80;i++)MW6_INTERNALS.shapeSteering(car,{steer:1},FIXED_DT,38);
  assert.ok(car.phase6.steerCommand>.5&&car.phase6.steerCommand<.9);
});

test('Phase 6 M3 and AWD Evo complete full AI laps with grip assists active',()=>{
  for(const index of [0,4]){
    const result=driveLap(CAR_SPECS[index],2,190);
    console.log('Phase6 lap',CAR_SPECS[index].id,result);
    assert.ok(result.time<190,`${CAR_SPECS[index].name}: stopped at checkpoint ${result.next}`);
    assert.ok(result.maxSpeed>12,'car should reach racing speed');
    assert.ok(result.maxOffset<13.5,'car should stay inside the barrier corridor');
    assert.ok(result.maxYaw<3.6,'yaw should remain controlled');
  }
});
