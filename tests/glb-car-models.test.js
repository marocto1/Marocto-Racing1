import test from 'node:test';
import assert from 'node:assert/strict';
import {parseGLB,normalizeGLBSections,HD_CAR_MANIFEST} from '../www/glb-car-models.js';

function pad4(n){return (n+3)&~3;}
function makeGLB(){
  const positions=new Float32Array([
    -1,0,-2, 1,0,-2, 1,1,-2,
    -1,0, 2, 1,0, 2, 1,1, 2
  ]);
  const normals=new Float32Array(Array(18).fill(0).map((_,i)=>i%3===1?1:0));
  const uvs=new Float32Array([0,0,1,0,1,1,0,0,1,0,1,1]);
  const indices=new Uint16Array([0,1,2,3,4,5]);
  const p0=0,p1=positions.byteLength,p2=p1+normals.byteLength,p3=p2+uvs.byteLength,binLen=pad4(p3+indices.byteLength);
  const bin=new Uint8Array(binLen);
  bin.set(new Uint8Array(positions.buffer),p0);bin.set(new Uint8Array(normals.buffer),p1);bin.set(new Uint8Array(uvs.buffer),p2);bin.set(new Uint8Array(indices.buffer),p3);
  const json={
    asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],
    nodes:[{mesh:0,name:'body'}],
    meshes:[{primitives:[{attributes:{POSITION:0,NORMAL:1,TEXCOORD_0:2},indices:3,material:0}]}],
    materials:[{name:'carpaint',pbrMetallicRoughness:{baseColorFactor:[.2,.4,.8,1],roughnessFactor:.35,metallicFactor:.5}}],
    bufferViews:[
      {buffer:0,byteOffset:p0,byteLength:positions.byteLength},
      {buffer:0,byteOffset:p1,byteLength:normals.byteLength},
      {buffer:0,byteOffset:p2,byteLength:uvs.byteLength},
      {buffer:0,byteOffset:p3,byteLength:indices.byteLength}
    ],
    accessors:[
      {bufferView:0,componentType:5126,count:6,type:'VEC3'},
      {bufferView:1,componentType:5126,count:6,type:'VEC3'},
      {bufferView:2,componentType:5126,count:6,type:'VEC2'},
      {bufferView:3,componentType:5123,count:6,type:'SCALAR'}
    ],
    buffers:[{byteLength:binLen}]
  };
  const jsonBytes=new TextEncoder().encode(JSON.stringify(json)),jsonLen=pad4(jsonBytes.length),total=12+8+jsonLen+8+binLen;
  const out=new ArrayBuffer(total),v=new DataView(out),u=new Uint8Array(out);let o=0;
  v.setUint32(o,0x46546c67,true);o+=4;v.setUint32(o,2,true);o+=4;v.setUint32(o,total,true);o+=4;
  v.setUint32(o,jsonLen,true);o+=4;v.setUint32(o,0x4e4f534a,true);o+=4;u.fill(0x20,o,o+jsonLen);u.set(jsonBytes,o);o+=jsonLen;
  v.setUint32(o,binLen,true);o+=4;v.setUint32(o,0x004e4942,true);o+=4;u.set(bin,o);
  return out;
}

test('HD car manifest exposes six distinct build-time GLBs',()=>{
  assert.equal(HD_CAR_MANIFEST.length,6);
  assert.equal(new Set(HD_CAR_MANIFEST.map(x=>x.id)).size,6);
  assert.ok(HD_CAR_MANIFEST.every(x=>x.file.endsWith('.glb')));
});

test('GLB parser expands indexed triangle data with material properties',()=>{
  const parsed=parseGLB(makeGLB(),{label:'fixture',baseUrl:'https://example.test/model.glb'});
  assert.equal(parsed.sections.length,1);
  const s=parsed.sections[0];
  assert.equal(s.positions.length,18);
  assert.equal(s.normals.length,18);
  assert.equal(s.uvs.length,12);
  assert.deepEqual(s.color,[.2,.4,.8]);
  assert.equal(s.surface,'paint');
  assert.ok(s.params.reflectivity>.2);
});

test('GLB normalization fits the body to the selected physics spec',()=>{
  const parsed=parseGLB(makeGLB(),{label:'fixture'});
  const spec={length:4.6,width:1.9,height:1.4};
  const normalized=normalizeGLBSections(parsed.sections,spec,{fit:.98});
  assert.ok(normalized.dimensions.length<=spec.length+.001);
  assert.ok(normalized.dimensions.width<=spec.width+.001);
  assert.ok(normalized.dimensions.height<=spec.height+.001);
  const ys=normalized.sections[0].positions.filter((_,i)=>i%3===1);
  assert.ok(Math.min(...ys)>=.029);
});
