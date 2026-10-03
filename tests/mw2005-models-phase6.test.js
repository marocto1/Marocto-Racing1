import test from 'node:test';
import assert from 'node:assert/strict';
import {encodePngRgba} from '../scripts/mw-texture-png.mjs';
import {buildNativeCapture,summarizeRawDrawStream} from '../scripts/mw-draw-capture-lib.mjs';

const key='0x123456789abcdef0';
const raw={
  format:'marocto-mw-draw-stream',version:1,source:'phase6-test',axes:{forward:'z',up:'y'},
  textures:[{id:'mwtex_test',materialKey:key,sampler:0,address:0x123000,format:6,width:2,height:2,swizzle:0x688,endian:0,tiled:false,dataFile:'textures/mwtex_test.rgba',texture:'textures/mwtex_test.png'}],
  draws:[{frame:1,role:'body',material:'mwmat_test',materialKey:key,texture:'textures/mwtex_test.png',shader:'vs1_ps2',object:100,positions:[-1,0,-1,1,0,-1,0,1,1],normals:[0,1,0,0,1,0,0,1,0],uvs:[0,0,1,0,.5,1],indices:[0,1,2]}]
};

test('Phase 6 PNG encoder creates RGBA PNG with correct IHDR',()=>{
  const rgba=Buffer.from([255,0,0,255,0,255,0,255,0,0,255,255,255,255,255,255]);
  const png=encodePngRgba(2,2,rgba);
  assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  assert.equal(png.toString('ascii',12,16),'IHDR');
  assert.equal(png.readUInt32BE(16),2);
  assert.equal(png.readUInt32BE(20),2);
  assert.equal(png[24],8);
  assert.equal(png[25],6);
});

test('Phase 6 texture metadata survives into native capture and material binding',()=>{
  const capture=buildNativeCapture(raw);
  assert.equal(capture.metadata.phase,'models-phase6-textures');
  assert.equal(capture.metadata.textures,1);
  assert.equal(capture.textures.length,1);
  assert.equal(capture.textures[0].format,6);
  assert.equal(capture.materials[0].texture,'textures/mwtex_test.png');
  assert.equal(capture.body[0].texture,'textures/mwtex_test.png');
  assert.equal(summarizeRawDrawStream(raw).textures,1);
});

test('Phase 5 raw captures stay backward compatible with no texture table',()=>{
  const legacy={...raw,textures:undefined,draws:raw.draws.map(({texture,...d})=>d)};
  const capture=buildNativeCapture(legacy);
  assert.equal(capture.metadata.phase,'models-phase5-materials');
  assert.equal(capture.metadata.textures,0);
  assert.equal(capture.textures,undefined);
});