import test from 'node:test';
import assert from 'node:assert/strict';
import {buildNativeCapture,parseRawDrawStream,summarizeRawDrawStream,MW_DRAW_STREAM_FORMAT} from '../scripts/mw-draw-capture-lib.mjs';

const raw={
  format:MW_DRAW_STREAM_FORMAT,version:1,source:'nfsmw-nx-test',axes:{forward:'z',up:'y'},
  materials:[{id:'paint',color:[.5,.6,.7]}],
  draws:[
    {id:1,frame:100,role:'body',tag:'player-car',shader:'vs_car',material:'paint',positions:[0,0,0,1,0,0,0,1,0],normals:[0,0,1,0,0,1,0,0,1],uvs:[0,0,1,0,0,1],indices:[0,1,2]},
    {id:2,frame:100,role:'body',tag:'player-car',shader:'vs_car',material:'paint',positions:[0,0,0,0,1,0,-1,0,0],normals:[0,0,1,0,0,1,0,0,1],uvs:[0,0,0,1,1,0],indices:[0,1,2]},
    {id:3,frame:100,role:'wheel',tag:'player-car',shader:'vs_wheel',material:'tire',positions:[0,0,0,.2,0,0,0,.2,0],indices:[0,1,2]},
    {id:4,frame:101,role:'body',tag:'road',shader:'vs_road',material:'road',positions:[0,0,0,10,0,0,0,0,10],indices:[0,1,2]}
  ]
};

test('phase3 raw draw stream validates and summarizes captured draws',()=>{
  const parsed=parseRawDrawStream(raw),summary=summarizeRawDrawStream(raw);
  assert.equal(parsed.draws.length,4);assert.equal(summary.draws,4);assert.equal(summary.triangles,4);
  assert.equal(summary.roles.body,3);assert.equal(summary.roles.wheel,1);
});

test('phase3 filters one frame/tag and emits Phase2 compatible capture',()=>{
  const out=buildNativeCapture(raw,{frame:100,tag:'player-car'});
  assert.equal(out.format,'marocto-mw-native-capture');assert.equal(out.version,1);
  assert.equal(out.body.length,1,'same body material should merge');
  assert.equal(out.wheel.meshes.length,1);assert.equal(out.metadata.selectedDraws,3);assert.equal(out.metadata.triangles,3);
  assert.ok(out.body[0].positions.length>=12,'body vertices survive merge');
});

test('phase3 deduplicates shared vertices but preserves triangle indices',()=>{
  const out=buildNativeCapture(raw,{frame:100,tag:'player-car'}),body=out.body[0];
  assert.equal(body.indices.length,6);
  assert.ok(body.positions.length/3<6,'shared identical vertices should be deduplicated');
  for(const i of body.indices)assert.ok(i>=0&&i<body.positions.length/3);
});

test('phase3 can isolate a shader and rejects empty filters',()=>{
  const out=buildNativeCapture(raw,{frame:100,shader:'vs_car'});
  assert.equal(out.metadata.selectedDraws,2);assert.equal(out.wheel,undefined);
  assert.throws(()=>buildNativeCapture(raw,{frame:999}),/no draw calls matched/);
});

test('phase3 rejects malformed geometry before writing a capture',()=>{
  const bad={format:MW_DRAW_STREAM_FORMAT,version:1,draws:[{positions:[0,0,0,1,0,0,0,1,0],indices:[0,1,8]}]};
  assert.throws(()=>parseRawDrawStream(bad),/invalid indices/);
});
