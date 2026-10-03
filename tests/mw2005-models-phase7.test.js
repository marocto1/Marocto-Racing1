import test from 'node:test';
import assert from 'node:assert/strict';
import {classifySamplerRole,inferMaterialSurface,materialParameters,buildMaterialMaps,textureStatistics} from '../scripts/mw-material-classifier.mjs';
import {buildNativeCapture,summarizeRawDrawStream} from '../scripts/mw-draw-capture-lib.mjs';

const key='0x1111222233334444';
const tri={frame:7,role:'body',material:'mwmat_body',materialKey:key,shader:'vs10_ps20',object:99,positions:[-1,0,-1,1,0,-1,0,1,1],normals:[0,1,0,0,1,0,0,1,0],uvs:[0,0,1,0,.5,1],indices:[0,1,2]};

test('Phase 7 sampler classifier separates diffuse, normal, emissive and environment roles',()=>{
  assert.equal(classifySamplerRole({samplerName:'DIFFUSEMAP_SAMPLER',sampler:0,samplerType:12}),'albedo');
  assert.equal(classifySamplerRole({samplerName:'NORMALMAP_SAMPLER',sampler:1,samplerType:12}),'normal');
  assert.equal(classifySamplerRole({samplerName:'HEADLIGHT_GLOW_SAMPLER',sampler:2,samplerType:12}),'emissive');
  assert.equal(classifySamplerRole({samplerName:'ENVMAP_CUBE_SAMPLER',sampler:3,samplerType:14}),'environment');
});

test('Phase 7 texture statistics detect alpha-heavy glass candidates',()=>{
  const rgba=Buffer.from([100,120,140,64, 100,120,140,64, 100,120,140,64, 100,120,140,64]);
  const stats=textureStatistics(rgba);
  assert.ok(stats.alphaMean>.24&&stats.alphaMean<.26);
  assert.equal(stats.alphaCoverage,1);
  const surface=inferMaterialSurface([{role:'albedo',samplerName:'WINDOW_DIFFUSE_SAMPLER',stats}],'body');
  assert.equal(surface,'glass');
  const p=materialParameters(surface,[{role:'albedo',stats}]);
  assert.ok(p.opacity>=.18&&p.opacity<=.68);
});

test('Phase 7 capture builds multi-map material and preserves metadata-only cube sampler',()=>{
  const raw={format:'marocto-mw-draw-stream',version:1,source:'phase7-test',axes:{forward:'z',up:'y'},metadata:{phase:'models-phase7-full-materials'},textures:[
    {id:'diff',materialKey:key,sampler:0,samplerType:12,samplerName:'DIFFUSEMAP_SAMPLER',role:'albedo',address:4096,format:6,width:4,height:4,swizzle:0,endian:0,tiled:false,texture:'textures/diff.png',stats:{alphaMean:1,alphaCoverage:0}},
    {id:'norm',materialKey:key,sampler:1,samplerType:12,samplerName:'NORMALMAP_SAMPLER',role:'normal',address:8192,format:20,width:4,height:4,swizzle:0,endian:0,tiled:false,texture:'textures/norm.png'},
    {id:'env',materialKey:key,sampler:3,samplerType:14,samplerName:'ENVMAP_CUBE_SAMPLER',role:'environment',address:12288,format:6,width:64,height:64,swizzle:0,endian:0,tiled:true,hasPixels:false}
  ],draws:[{...tri,texture:'textures/diff.png'}]};
  const capture=buildNativeCapture(raw);
  assert.equal(capture.metadata.phase,'models-phase7-full-materials');
  assert.equal(capture.metadata.textures,2);
  assert.equal(capture.metadata.samplerBindings,3);
  assert.equal(capture.textures.length,3);
  const material=capture.materials.find(m=>m.id==='mwmat_body');
  assert.equal(material.maps.albedo,'textures/diff.png');
  assert.equal(material.maps.normal,'textures/norm.png');
  assert.equal(material.surface,'paint');
  assert.ok(material.params.reflectivity>.3);
  assert.equal(material.samplers.find(s=>s.role==='environment').texture,undefined);
  const summary=summarizeRawDrawStream(raw);
  assert.equal(summary.samplerBindings,3);
  assert.equal(summary.samplerRoles.find(x=>x.id==='environment').count,1);
});

test('Phase 7 map builder does not replace first role map with later samplers',()=>{
  const maps=buildMaterialMaps([{role:'albedo',sampler:0,texture:'a.png'},{role:'albedo',sampler:4,texture:'b.png'},{role:'detail',sampler:2,texture:'d.png'}]);
  assert.deepEqual(maps,{albedo:'a.png',detail:'d.png'});
});
