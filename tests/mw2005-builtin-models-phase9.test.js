import test from 'node:test';
import assert from 'node:assert/strict';
import {CAR_SPECS,buildCar} from '../www/cars.js';

test('Phase 9 ships six distinct built-in car models with no external assets required',()=>{
  assert.equal(CAR_SPECS.length,6);
  assert.equal(new Set(CAR_SPECS.map(s=>s.model)).size,6);
  for(const spec of CAR_SPECS){
    const model=buildCar(spec);
    assert.equal(model.modelId,spec.model);
    assert.ok(model.body.vertexCount>1200,`${spec.model} body is too simple: ${model.body.vertexCount}`);
    assert.ok(model.wheel.vertexCount>250,`${spec.model} wheel is too simple: ${model.wheel.vertexCount}`);
    assert.ok(model.wheelRadius>.3&&model.wheelRadius<.4);
    assert.ok(model.wheelX>spec.width*.45);
    assert.ok(model.wheelZ>spec.wheelbase*.45);
  }
});

test('Phase 9 signature geometry is not the same mesh copied six times',()=>{
  const counts=CAR_SPECS.map(spec=>buildCar(spec).body.vertexCount);
  assert.ok(new Set(counts).size>=5,`expected model-specific geometry, got vertex counts ${counts.join(', ')}`);
});
