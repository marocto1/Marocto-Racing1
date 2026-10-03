import test from 'node:test';
import assert from 'node:assert/strict';
import {parseNativeCapture,createNativeCaptureTemplate,MW_NATIVE_CAPTURE_FORMAT,MW_NATIVE_CAPTURE_VERSION} from '../www/mw-native-capture.js';

test('native capture v1 expands indexed geometry and preserves materials',()=>{
  const doc=createNativeCaptureTemplate(),parsed=parseNativeCapture(doc);
  assert.equal(doc.format,MW_NATIVE_CAPTURE_FORMAT);assert.equal(doc.version,MW_NATIVE_CAPTURE_VERSION);
  assert.equal(parsed.body.length,1);assert.equal(parsed.body[0].positions.length,18);
  assert.equal(parsed.body[0].normals.length,18);assert.equal(parsed.body[0].uvs.length,12);
  assert.equal(parsed.body[0].texture,'textures/paint.png');assert.ok(parsed.wheel?.length===1);
});

test('native capture computes face normals when the dump has no normals',()=>{
  const doc={format:MW_NATIVE_CAPTURE_FORMAT,version:1,body:[{positions:[0,0,0,1,0,0,0,1,0],indices:[0,1,2]}]};
  const parsed=parseNativeCapture(JSON.stringify(doc)),n=parsed.body[0].normals;
  assert.equal(n.length,9);for(const value of n)assert.ok(Number.isFinite(value));
  assert.ok(Math.abs(n[2])>.99,'triangle normal should point along Z');
});

test('native capture rejects invalid indices instead of corrupting a mesh',()=>{
  const doc={format:MW_NATIVE_CAPTURE_FORMAT,version:1,body:[{positions:[0,0,0,1,0,0,0,1,0],indices:[0,1,9]}]};
  assert.throws(()=>parseNativeCapture(doc),/indices/);
});

test('unindexed capture must already be a complete triangle list',()=>{
  const doc={format:MW_NATIVE_CAPTURE_FORMAT,version:1,body:[{positions:[0,0,0,1,0,0,0,1,0,2,2,2]}]};
  assert.throws(()=>parseNativeCapture(doc),/divisible by 3/);
});

test('native capture rejects unsupported versions and axes',()=>{
  assert.throws(()=>parseNativeCapture({format:MW_NATIVE_CAPTURE_FORMAT,version:99,body:[]}),/version/);
  assert.throws(()=>parseNativeCapture({format:MW_NATIVE_CAPTURE_FORMAT,version:1,axes:{forward:'z',up:'z'},body:[{positions:[0,0,0,1,0,0,0,1,0]}]}),/axes/);
});
