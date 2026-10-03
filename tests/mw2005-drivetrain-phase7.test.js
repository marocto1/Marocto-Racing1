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
  MW7_INTERNALS
} from '../www/physics-mw2005-drivetrain.js';

const track=new Track();

function driveLap(spec,level=2,limit=195){
  const car=createVehicle(spec,0,track),ai=createAIController(track);ai.reset(car);
  let maxOffset=0,maxSpeed=0,maxWheelspin=0,maxYaw=0;
  for(let t=0;t<limit;t+=FIXED_DT){
    const control=ai.sample(car,null,level,FIXED_DT);
    stepVehicle(car,control,track,FIXED_DT);
    collideBarrier(car,track);
    track.updateProgress(car,FIXED_DT);
    maxOffset=Math.max(maxOffset,Math.abs(car.contact.lateral||0));
    maxSpeed=Math.max(maxSpeed,Math.hypot(car.vx,car.vz));
    maxWheelspin=Math.max(maxWheelspin,car.phase7?.wheelspin||0);
    maxYaw=Math.max(maxYaw,Math.abs(car.yawRate||0));
    assert.ok(Number.isFinite(car.x)&&Number.isFinite(car.z)&&Number.isFinite(car.rpm));
    if(car.progress.completed>=1)return {time:t,maxOffset,maxSpeed,maxWheelspin,maxYaw,next:car.progress.next,shiftEvents:car.phase7.shiftEvents};
  }
  return {time:Infinity,maxOffset,maxSpeed,maxWheelspin,maxYaw,next:car.progress.next,shiftEvents:car.phase7.shiftEvents};
}

test('Phase 7 exposes the stateful MW drivetrain profile',()=>{
  const car=createVehicle(CAR_SPECS[0],0,track);
  assert.equal(PHYSICS_PROFILE,'mw2005-full-drivetrain-phase7');
  assert.equal(car.drivetrainModel,'mw2005-clutch-lsd-launch-phase7');
  assert.equal(car.phase7.model,'mw2005-stateful-drivetrain-phase7');
  assert.equal(car.phase7.clutch,1);
  assert.ok(Number.isFinite(car.phase7.engineRPM));
});

test('launch clutch gives keyboard throttle a progressive bite and opens the TCS slip window',()=>{
  const car=createVehicle(CAR_SPECS[0],0,track);
  const out=MW7_INTERNALS.preprocessDrivetrain(car,{throttle:1,brake:0,steer:0},FIXED_DT);
  assert.equal(car.phase7.launchActive,true);
  assert.equal(car.phase7.burnoutActive,false);
  assert.ok(car.phase7.clutchTarget<1);
  assert.ok(out.throttle>0&&out.throttle<1);
  assert.ok(car.phase6.tcsSlipStart>.12);
});

test('standing burnout keeps the holding brake while allowing driven-wheel spin',()=>{
  const car=createVehicle(CAR_SPECS[0],0,track);
  const out=MW7_INTERNALS.preprocessDrivetrain(car,{throttle:1,brake:1,steer:0},FIXED_DT);
  assert.equal(car.phase7.burnoutActive,true);
  assert.equal(car.phase6.absRelease,1);
  assert.ok(car.phase6.tcsSlipStart>=.5);
  assert.equal(out.brake,1);
});

test('rear LSD reduces driven wheel-speed separation on the RWD M3',()=>{
  const car=createVehicle(CAR_SPECS[0],0,track);
  car.wheels[2].omega=92;car.wheels[3].omega=18;
  const before=Math.abs(car.wheels[2].omega-car.wheels[3].omega);
  for(let i=0;i<12;i++)MW7_INTERNALS.applyLSD(car,1,FIXED_DT);
  const after=Math.abs(car.wheels[2].omega-car.wheels[3].omega);
  assert.ok(after<before*.8,`expected rear LSD coupling: ${before} -> ${after}`);
  assert.ok(car.phase7.diffRear>=0);
});

test('AWD center differential reduces front/rear axle runaway on the Evo',()=>{
  const car=createVehicle(CAR_SPECS[4],0,track);
  car.wheels[0].omega=88;car.wheels[1].omega=88;car.wheels[2].omega=22;car.wheels[3].omega=22;
  const axleDiff=()=>Math.abs((car.wheels[0].omega+car.wheels[1].omega)*.5-(car.wheels[2].omega+car.wheels[3].omega)*.5);
  const before=axleDiff();
  for(let i=0;i<18;i++)MW7_INTERNALS.applyLSD(car,.9,FIXED_DT);
  const after=axleDiff();
  assert.ok(after<before*.8,`expected center coupling: ${before} -> ${after}`);
});

test('closed throttle adds gear/RPM dependent engine braking',()=>{
  const car=createVehicle(CAR_SPECS[0],0,track);
  car.a=0;car.vx=0;car.vz=28;car.gear=2;car.phase7.engineRPM=6200;car.phase7.clutch=1;
  const before=Math.hypot(car.vx,car.vz);
  for(let i=0;i<60;i++)MW7_INTERNALS.applyEngineBraking(car,{throttle:0,brake:0},FIXED_DT);
  const after=Math.hypot(car.vx,car.vz);
  assert.ok(after<before-.25,`expected engine braking: ${before} -> ${after}`);
  assert.ok(car.phase7.engineBrake>0);
});

test('full-throttle acceleration produces real automatic shift events without numerical instability',()=>{
  const car=createVehicle(CAR_SPECS[0],0,track);
  let maxGear=car.gear;
  for(let t=0;t<25;t+=FIXED_DT){
    stepVehicle(car,{throttle:1,brake:0,steer:0,handbrake:0,nitro:0},track,FIXED_DT);
    collideBarrier(car,track);
    maxGear=Math.max(maxGear,car.gear);
    assert.ok(Number.isFinite(car.rpm)&&Number.isFinite(car.phase7.engineRPM));
  }
  assert.ok(maxGear>=2,'automatic gearbox should upshift');
  assert.ok(car.phase7.shiftEvents>=1,'Phase 7 should observe and shape at least one shift');
});

test('Phase 7 M3 and AWD Evo complete full AI laps with drivetrain active',()=>{
  for(const index of [0,4]){
    const result=driveLap(CAR_SPECS[index],2,195);
    console.log('Phase7 lap',CAR_SPECS[index].id,result);
    assert.ok(result.time<195,`${CAR_SPECS[index].name}: stopped at checkpoint ${result.next}`);
    assert.ok(result.maxSpeed>12,'car should reach racing speed');
    assert.ok(result.maxOffset<13.5,'car should stay inside the barrier corridor');
    assert.ok(result.maxYaw<3.6,'yaw should remain controlled');
    assert.ok(result.shiftEvents>=1,'race lap should use the automatic gearbox');
  }
});
