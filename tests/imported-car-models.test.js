import test from 'node:test';
import assert from 'node:assert/strict';
import {CAR_SPECS} from '../www/cars.js';
import {parseMTL,parseOBJ,normalizeSections,MW_MODEL_MANIFEST} from '../www/imported-car-models.js';

test('MW model manifest covers every current garage car',()=>{
  for(const spec of CAR_SPECS)assert.ok(MW_MODEL_MANIFEST.some(x=>x.match===spec.name),`missing model slot for ${spec.name}`);
});

test('OBJ/MTL importer triangulates faces and preserves material UV data',()=>{
  const mtl=parseMTL('newmtl paint\nKd 0.2 0.4 0.8\nmap_Kd paint.png\n');
  const obj=[
    'v -1 0 -2','v 1 0 -2','v 1 1 2','v -1 1 2',
    'vt 0 0','vt 1 0','vt 1 1','vt 0 1',
    'vn 0 1 0','usemtl paint','f 1/1/1 2/2/1 3/3/1 4/4/1'
  ].join('\n');
  const sections=parseOBJ(obj,mtl);
  assert.equal(sections.length,1);assert.equal(sections[0].positions.length,18);assert.equal(sections[0].uvs.length,12);
  assert.deepEqual(sections[0].color,[.2,.4,.8]);assert.equal(sections[0].texture,'paint.png');
});

test('normalizer fits imported body inside selected physics dimensions',()=>{
  const spec=CAR_SPECS[0],sections=parseOBJ('v -1 0 -2\nv 1 0 -2\nv 1 1 2\nv -1 1 2\nf 1 2 3 4');
  normalizeSections(sections,spec,{forward:'z',up:'y'});
  const p=sections[0].positions,x=[],y=[],z=[];for(let i=0;i<p.length;i+=3){x.push(p[i]);y.push(p[i+1]);z.push(p[i+2]);}
  assert.ok(Math.max(...x)-Math.min(...x)<=spec.width+1e-6);
  assert.ok(Math.max(...y)-Math.min(...y)<=spec.height+1e-6);
  assert.ok(Math.max(...z)-Math.min(...z)<=spec.length+1e-6);
  assert.ok(Math.min(...y)>=-1e-8,'model should sit on its floor');
});
