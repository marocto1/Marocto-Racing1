import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildMaterialMaps} from '../scripts/mw-material-classifier.mjs';
import {buildNativeCapture} from '../scripts/mw-draw-capture-lib.mjs';
import {parseNativeCapture} from '../www/mw-native-capture.js';

const key='0x8888777766665555';
const faces=['px','nx','py','ny','pz','nz'].map((name,cubeFace)=>({
  id:`env_${name}`,materialKey:key,sampler:3,samplerType:14,samplerName:'ENVMAP_CUBE_SAMPLER',role:'environment',cubeFace,cubeFaceName:name,address:0x500000+cubeFace*0x1000,format:6,width:4,height:4,swizzle:0,endian:0,tiled:true,texture:`textures/env_${name}.png`
}));
const draw={frame:8,role:'body',material:'mwmat_paint',materialKey:key,shader:'vs1_ps2',object:1,positions:[-1,0,-1,1,0,-1,0,1,1],normals:[0,1,0,0,1,0,0,1,0],uvs:[0,0,1,0,.5,1],indices:[0,1,2]};

test('Phase 8 material map accepts a complete cubemap in Xenos face order',()=>{
  const maps=buildMaterialMaps(faces);
  assert.deepEqual(maps.environmentCube,faces.map(f=>f.texture));
  assert.equal(maps.environment,undefined);
});

test('Phase 8 rejects partial cubemap instead of reflecting the wrong face',()=>{
  const maps=buildMaterialMaps(faces.slice(0,5));
  assert.equal(maps.environmentCube,undefined);
  assert.equal(maps.environment,undefined);
});

test('Phase 8 native capture preserves six cubemap face paths',()=>{
  const raw={format:'marocto-mw-draw-stream',version:1,source:'phase8-test',axes:{forward:'z',up:'y'},metadata:{phase:'models-phase8-cubemaps'},textures:faces,draws:[draw]};
  const capture=buildNativeCapture(raw),material=capture.materials.find(m=>m.id==='mwmat_paint');
  assert.equal(capture.metadata.phase,'models-phase8-cubemaps');
  assert.equal(capture.metadata.cubeFaces,6);
  assert.deepEqual(material.maps.environmentCube,faces.map(f=>f.texture));
  assert.equal(capture.textures.filter(t=>t.cubeFace!=null).length,6);
  const parsed=parseNativeCapture(capture);
  assert.deepEqual(parsed.body[0].maps.environmentCube,faces.map(f=>f.texture));
});

test('Phase 8 WebGL shader exposes six explicit D3D/Xenos cubemap faces',()=>{
  const source=readFileSync(new URL('../www/engine.js',import.meta.url),'utf8');
  for(const face of ['PX','NX','PY','NY','PZ','NZ'])assert.match(source,new RegExp(`environmentCube${face}`));
  assert.match(source,/useEnvironmentCube/);
  assert.match(source,/sampleEnvironmentCube/);
  assert.match(source,/textureLod\(environmentCubePX/);
  assert.match(source,/CLAMP_TO_EDGE/);
});
