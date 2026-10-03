import test from 'node:test';
import assert from 'node:assert/strict';
import {autoIsolateCarDraws,buildNativeCapture,MW_DRAW_STREAM_FORMAT,summarizeRawDrawStream} from '../scripts/mw-draw-capture-lib.mjs';

const cube=(sx,sy,sz)=>({
  positions:[-sx,-sy,-sz, sx,-sy,-sz, sx,sy,-sz, -sx,sy,-sz, -sx,-sy,sz, sx,-sy,sz, sx,sy,sz, -sx,sy,sz],
  normals:[0,1,0, 0,1,0, 0,1,0, 0,1,0, 0,1,0, 0,1,0, 0,1,0, 0,1,0],
  uvs:[0,0,1,0,1,1,0,1, 0,0,1,0,1,1,0,1],
  indices:[0,1,2,0,2,3,4,6,5,4,7,6,0,4,5,0,5,1,1,5,6,1,6,2,2,6,7,2,7,3,3,7,4,3,4,0]
});
const body=cube(.9,.6,2.2),wheel=cube(.32,.32,.16),scene=cube(20,4,20);
const raw={format:MW_DRAW_STREAM_FORMAT,version:1,source:'phase5-fixture',axes:{forward:'z',up:'y'},draws:[
  {...body,id:1,frame:20,role:'auto',object:100,material:'mwmat_paint',materialKey:'0x1111',shader:'vs10_ps20',tag:'car'},
  {...body,id:2,frame:20,role:'auto',object:100,material:'mwmat_glass',materialKey:'0x2222',shader:'vs10_ps21',tag:'car'},
  {...wheel,id:10,frame:20,role:'auto',object:200,material:'mwmat_tire',materialKey:'0x3333',shader:'vs11_ps22',tag:'wheel'},
  {...wheel,id:11,frame:20,role:'auto',object:200,material:'mwmat_tire',materialKey:'0x3333',shader:'vs11_ps22',tag:'wheel'},
  {...wheel,id:12,frame:20,role:'auto',object:200,material:'mwmat_tire',materialKey:'0x3333',shader:'vs11_ps22',tag:'wheel'},
  {...wheel,id:13,frame:20,role:'auto',object:200,material:'mwmat_tire',materialKey:'0x3333',shader:'vs11_ps22',tag:'wheel'},
  {...scene,id:99,frame:20,role:'auto',object:900,material:'garage',shader:'vs90_ps90',tag:'garage'}
]};

test('phase5 auto isolation keeps the car body and repeated compact wheel mesh',()=>{
  const isolated=autoIsolateCarDraws(raw);
  assert.equal(isolated.draws.filter(d=>d.role==='body').length,2);
  assert.equal(isolated.draws.filter(d=>d.role==='wheel').length,4);
  assert.ok(isolated.draws.every(d=>d.object!==900),'large garage scenery must be rejected');
  assert.equal(isolated.metadata.autoIsolation.mode,'phase5-object-shape');
});

test('phase5 carries native UVs, normals and sampler-derived material identity into capture.json',()=>{
  const out=buildNativeCapture(raw,{autoCar:true});
  assert.equal(out.metadata.uvDraws,6);
  assert.equal(out.metadata.normalDraws,6);
  assert.equal(out.body.length,2,'paint and glass remain separate materials');
  assert.equal(out.wheel.meshes.length,1);
  assert.ok(out.body.every(s=>s.uvs?.length>0&&s.normals?.length>0));
  const paint=out.materials.find(m=>m.id==='mwmat_paint');
  assert.equal(paint.materialKey,'0x1111');
});

test('phase5 summary exposes object groups and UV coverage for manual fallback',()=>{
  const s=summarizeRawDrawStream(raw);
  assert.equal(s.uvDraws,7);assert.equal(s.normalDraws,7);
  assert.ok(s.objects.some(x=>x.id==='100'));
});

test('phase5 keeps exact object filtering when auto selection is not desired',()=>{
  const out=buildNativeCapture(raw,{object:100});
  assert.equal(out.metadata.selectedDraws,2);
  assert.equal(out.wheel,undefined);
});
