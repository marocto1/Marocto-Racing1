import test from 'node:test';
import assert from 'node:assert/strict';
import {Track} from '../www/track.js';
import {CAR_SPECS} from '../www/cars.js';
import {createVehicle,FIXED_DT} from '../www/physics.js';

const track=new Track();

test('ordered gates count a lap across the complete legal corridor',()=>{
  const car=createVehicle(CAR_SPECS[0],0,track);
  const lateral=track.halfWidth+2.2;
  for(let i=1;i<=24;i++){
    const gate=track.gates[i%24];
    const x=gate.x+gate.nx*lateral,z=gate.z+gate.nz*lateral;
    car.prevX=x-gate.tx*.6;car.prevZ=z-gate.tz*.6;
    car.x=x+gate.tx*.6;car.z=z+gate.tz*.6;
    assert.equal(track.updateProgress(car,FIXED_DT),true,`gate ${i%24} should count from the shoulder`);
  }
  assert.equal(car.progress.completed,1);
  assert.equal(car.progress.next,1);
});

test('gate crossings outside the barrier corridor still do not count',()=>{
  const car=createVehicle(CAR_SPECS[0],0,track),gate=track.gates[1];
  const lateral=track.barrierOffset+1.5,x=gate.x+gate.nx*lateral,z=gate.z+gate.nz*lateral;
  car.prevX=x-gate.tx*.6;car.prevZ=z-gate.tz*.6;
  car.x=x+gate.tx*.6;car.z=z+gate.tz*.6;
  assert.equal(track.updateProgress(car,FIXED_DT),false);
  assert.equal(car.progress.next,1);
});
