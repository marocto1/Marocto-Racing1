import test from 'node:test';
import assert from 'node:assert/strict';
import {Track} from '../www/track.js';
import {CAR_SPECS} from '../www/cars.js';
import {createAIController} from '../www/ai.js';
import {createVehicle,stepVehicle,collideBarrier,FIXED_DT} from '../www/physics-mw2005-wheel4.js';

const track=new Track();

function driveLap(spec,level=2,limit=180){
  const car=createVehicle(spec,0,track),ai=createAIController(track);ai.reset(car);
  let maxOffset=0,maxSpeed=0;
  for(let t=0;t<limit;t+=FIXED_DT){
    const control=ai.sample(car,null,level,FIXED_DT);
    stepVehicle(car,control,track,FIXED_DT);
    collideBarrier(car,track);
    track.updateProgress(car,FIXED_DT);
    maxOffset=Math.max(maxOffset,Math.abs(car.contact.lateral||0));maxSpeed=Math.max(maxSpeed,Math.hypot(car.vx,car.vz));
    assert.ok(Number.isFinite(car.x)&&Number.isFinite(car.z)&&Number.isFinite(car.yawRate));
    if(car.progress.completed>=1)return {time:t,maxOffset,maxSpeed,collisions:car.collisionCount,next:car.progress.next};
  }
  return {time:Infinity,maxOffset,maxSpeed,collisions:car.collisionCount,next:car.progress.next};
}

test('Phase 4 M3 can complete a full autonomous lap with four-wheel physics',()=>{
  const result=driveLap(CAR_SPECS[0],2,180);console.log('Phase4 M3 lap',result);
  assert.ok(result.time<180,`M3 stopped at checkpoint ${result.next}`);
  assert.ok(result.maxSpeed>12,'M3 should reach racing speed');
  assert.ok(result.maxOffset<13.5,'M3 should remain inside the barrier corridor');
});

test('Phase 4 AWD Evo can complete a full autonomous lap',()=>{
  const result=driveLap(CAR_SPECS[4],2,180);console.log('Phase4 Evo lap',result);
  assert.ok(result.time<180,`Evo stopped at checkpoint ${result.next}`);
  assert.ok(result.maxSpeed>12,'Evo should reach racing speed');
  assert.ok(result.maxOffset<13.5,'Evo should remain inside the barrier corridor');
});
