const RAW_FORMAT='marocto-mw-draw-stream';
const RAW_VERSION=1;
const OUT_FORMAT='marocto-mw-native-capture';
const OUT_VERSION=1;
const MAX_DRAWS=50000;
const MAX_VERTICES=2_000_000;
const q=(v,s=100000)=>Math.round(v*s)/s;
const finite=v=>Number.isFinite(Number(v));
const roleOf=d=>d.role==='wheel'?'wheel':'body';

function assertArray(a,name,multiple){
  if(!Array.isArray(a)||a.length===0||a.length%multiple!==0)throw Error(`${name} must be a non-empty array divisible by ${multiple}`);
  if(a.some(v=>!finite(v)))throw Error(`${name} contains non-finite values`);
  if(a.length/multiple>MAX_VERTICES)throw Error(`${name} is too large`);
}
function normalizeDraw(draw,index){
  if(!draw||typeof draw!=='object')throw Error(`draw ${index} must be an object`);
  assertArray(draw.positions,`draw ${index} positions`,3);
  const vc=draw.positions.length/3;
  if(draw.normals!=null){assertArray(draw.normals,`draw ${index} normals`,3);if(draw.normals.length/3!==vc)throw Error(`draw ${index} normals mismatch`);}
  if(draw.uvs!=null){assertArray(draw.uvs,`draw ${index} uvs`,2);if(draw.uvs.length/2!==vc)throw Error(`draw ${index} uvs mismatch`);}
  let indices=draw.indices;
  if(indices==null){if(vc%3!==0)throw Error(`draw ${index} without indices must contain triangles`);indices=Array.from({length:vc},(_,i)=>i);}else{
    if(!Array.isArray(indices)||indices.length===0||indices.length%3!==0)throw Error(`draw ${index} indices must be triangle indices`);
    if(indices.some(i=>!Number.isInteger(Number(i))||Number(i)<0||Number(i)>=vc))throw Error(`draw ${index} has invalid indices`);
    indices=indices.map(Number);
  }
  return {
    id:draw.id??index,frame:Number.isFinite(Number(draw.frame))?Number(draw.frame):0,
    role:roleOf(draw),material:typeof draw.material==='string'&&draw.material?draw.material:'default',
    texture:typeof draw.texture==='string'&&draw.texture?draw.texture:null,
    color:Array.isArray(draw.color)&&draw.color.length>=3?draw.color.slice(0,3).map(Number):null,
    positions:draw.positions.map(Number),normals:draw.normals?.map(Number)||null,uvs:draw.uvs?.map(Number)||null,indices,
    tag:typeof draw.tag==='string'?draw.tag:'',shader:draw.shader??null,object:draw.object??null
  };
}
export function parseRawDrawStream(input){
  const doc=typeof input==='string'?JSON.parse(input):input;
  if(!doc||typeof doc!=='object')throw Error('raw capture root must be an object');
  if(doc.format!==RAW_FORMAT)throw Error(`unsupported raw capture format: ${doc.format||'missing'}`);
  if(Number(doc.version)!==RAW_VERSION)throw Error(`unsupported raw capture version: ${doc.version}`);
  if(!Array.isArray(doc.draws)||doc.draws.length===0)throw Error('draws must be a non-empty array');
  if(doc.draws.length>MAX_DRAWS)throw Error(`draw count exceeds ${MAX_DRAWS}`);
  const axes=doc.axes||{forward:'z',up:'y'};
  if(!['x','y','z'].includes(axes.forward)||!['x','y','z'].includes(axes.up)||axes.forward===axes.up)throw Error('axes must use two distinct x/y/z axes');
  return {source:doc.source||'nfsmw-nx-draw-capture',axes,materials:Array.isArray(doc.materials)?doc.materials:[],draws:doc.draws.map(normalizeDraw),metadata:doc.metadata||{}};
}

function makeVertexKey(p,n,uv){return `${q(p[0])},${q(p[1])},${q(p[2])}|${q(n?.[0]||0)},${q(n?.[1]||0)},${q(n?.[2]||0)}|${q(uv?.[0]||0)},${q(uv?.[1]||0)}`;}
function addDrawToBucket(bucket,d){
  const map=bucket._map||(bucket._map=new Map());
  for(let k=0;k<d.indices.length;k++){
    const i=d.indices[k],p=[d.positions[i*3],d.positions[i*3+1],d.positions[i*3+2]],n=d.normals?[d.normals[i*3],d.normals[i*3+1],d.normals[i*3+2]]:null,uv=d.uvs?[d.uvs[i*2],d.uvs[i*2+1]]:null,key=makeVertexKey(p,n,uv);
    let out=map.get(key);if(out==null){out=bucket.positions.length/3;map.set(key,out);bucket.positions.push(...p);if(n)bucket.normals.push(...n);if(uv)bucket.uvs.push(...uv);}
    bucket.indices.push(out);
  }
}
function stripPrivate(b){delete b._map;if(!b.normals.length)delete b.normals;if(!b.uvs.length)delete b.uvs;if(!b.texture)delete b.texture;if(!b.color)delete b.color;return b;}

export function buildNativeCapture(raw,{frame=null,tag=null,shader=null,minTriangles=1}={}){
  const doc=parseRawDrawStream(raw);
  let draws=doc.draws;
  if(frame!=null)draws=draws.filter(d=>d.frame===Number(frame));
  if(tag)draws=draws.filter(d=>d.tag.includes(String(tag)));
  if(shader!=null)draws=draws.filter(d=>String(d.shader)===String(shader));
  draws=draws.filter(d=>d.indices.length/3>=Number(minTriangles||1));
  if(!draws.length)throw Error('no draw calls matched the capture filters');
  const buckets={body:new Map(),wheel:new Map()};
  for(const d of draws){const key=`${d.material}|${d.texture||''}|${d.color?.join(',')||''}`;let b=buckets[d.role].get(key);if(!b){b={material:d.material,texture:d.texture,color:d.color,positions:[],normals:[],uvs:[],indices:[]};buckets[d.role].set(key,b);}addDrawToBucket(b,d);}
  const body=[...buckets.body.values()].map(stripPrivate);if(!body.length)throw Error('capture has no body geometry');
  const wheelMeshes=[...buckets.wheel.values()].map(stripPrivate);
  const triangleCount=draws.reduce((n,d)=>n+d.indices.length/3,0);
  return {
    format:OUT_FORMAT,version:OUT_VERSION,source:doc.source,axes:doc.axes,materials:doc.materials,body,
    ...(wheelMeshes.length?{wheel:{meshes:wheelMeshes}}:{}),
    metadata:{...doc.metadata,phase:'models-phase3-draw-capture',selectedDraws:draws.length,triangles:triangleCount,frames:[...new Set(draws.map(d=>d.frame))].sort((a,b)=>a-b)}
  };
}

export function summarizeRawDrawStream(raw){
  const doc=parseRawDrawStream(raw),frames=new Map(),roles={body:0,wheel:0},materials=new Map(),shaders=new Map();let triangles=0;
  for(const d of doc.draws){const t=d.indices.length/3;triangles+=t;roles[d.role]++;frames.set(d.frame,(frames.get(d.frame)||0)+t);materials.set(d.material,(materials.get(d.material)||0)+t);if(d.shader!=null)shaders.set(String(d.shader),(shaders.get(String(d.shader))||0)+t);}
  const top=m=>[...m.entries()].sort((a,b)=>b[1]-a[1]).slice(0,12).map(([id,count])=>({id,count}));
  return {draws:doc.draws.length,triangles,roles,frames:top(frames),materials:top(materials),shaders:top(shaders),source:doc.source,axes:doc.axes};
}

export const MW_DRAW_STREAM_FORMAT=RAW_FORMAT;
export const MW_DRAW_STREAM_VERSION=RAW_VERSION;
