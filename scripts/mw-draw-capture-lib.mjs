const RAW_FORMAT='marocto-mw-draw-stream';
const RAW_VERSION=1;
const OUT_FORMAT='marocto-mw-native-capture';
const OUT_VERSION=1;
const MAX_DRAWS=50000;
const MAX_VERTICES=2_000_000;
const q=(v,s=100000)=>Math.round(v*s)/s;
const finite=v=>Number.isFinite(Number(v));
const VALID_ROLES=new Set(['auto','body','wheel','scene']);
const roleOf=d=>VALID_ROLES.has(d.role)?d.role:'auto';

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
    materialKey:typeof draw.materialKey==='string'?draw.materialKey:null,
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

function bounds(draws){
  const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];let triangles=0;
  for(const d of draws){triangles+=d.indices.length/3;for(let i=0;i<d.positions.length;i+=3)for(let a=0;a<3;a++){const v=d.positions[i+a];lo[a]=Math.min(lo[a],v);hi[a]=Math.max(hi[a],v);}}
  return {lo,hi,size:hi.map((v,i)=>v-lo[i]),triangles};
}
const objectKey=d=>d.object==null?`draw:${d.id}`:`obj:${String(d.object)}`;
function groupObjects(draws){const map=new Map();for(const d of draws){const k=objectKey(d);if(!map.has(k))map.set(k,[]);map.get(k).push(d);}return [...map.entries()].map(([key,list])=>({key,draws:list,...bounds(list)}));}
function dimensions(group,axes){const ai={x:0,y:1,z:2},f=ai[axes.forward],u=ai[axes.up],w=[0,1,2].find(i=>i!==f&&i!==u);return {length:group.size[f],width:group.size[w],height:group.size[u]};}
function bodyScore(group,axes){
  const {length,width,height}=dimensions(group,axes),t=group.triangles;
  if(t<10||length<.45||length>10||width<.2||width>5||height<.08||height>4)return 0;
  const ratio=length/Math.max(width,.01),flat=length/Math.max(height,.01);
  const shape=(ratio>=1.25&&ratio<=5.5?1:.35)*(flat>=1.4&&flat<=12?1:.45);
  return Math.log2(t+2)*shape*(1+Math.min(1,length/4));
}
function isWheelGroup(group,axes){
  const {length,width,height}=dimensions(group,axes),mx=Math.max(length,width,height),mn=Math.max(.001,Math.min(length,width,height));
  return group.draws.length>=2&&group.triangles>=12&&mx>=.15&&mx<=1.7&&mx/mn<=8&&height<=1.6;
}
export function autoIsolateCarDraws(input){
  const doc=parseRawDrawStream(input),groups=groupObjects(doc.draws.filter(d=>d.role!=='scene'));
  const explicitBody=doc.draws.filter(d=>d.role==='body'),explicitWheel=doc.draws.filter(d=>d.role==='wheel');
  if(explicitBody.length){return {...doc,draws:[...explicitBody,...explicitWheel],metadata:{...doc.metadata,autoIsolation:{mode:'explicit',body:explicitBody.length,wheel:explicitWheel.length}}};}
  const wheelGroups=groups.filter(g=>isWheelGroup(g,doc.axes));
  const wheelKeys=new Set(wheelGroups.map(g=>g.key));
  const scored=groups.filter(g=>!wheelKeys.has(g.key)).map(g=>({g,score:bodyScore(g,doc.axes)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
  if(!scored.length)throw Error('auto car isolation found no car-like body groups; use --object/--shader manual filtering');
  const best=scored[0],selectedBody=scored.filter(x=>x.score>=best.score*.42).slice(0,8).map(x=>x.g);
  const bodyKeys=new Set(selectedBody.map(g=>g.key));
  const selected=[];
  for(const d of doc.draws){const key=objectKey(d);if(wheelKeys.has(key))selected.push({...d,role:'wheel'});else if(bodyKeys.has(key))selected.push({...d,role:'body'});}
  if(!selected.some(d=>d.role==='body'))throw Error('auto car isolation produced no body geometry');
  return {...doc,draws:selected,metadata:{...doc.metadata,autoIsolation:{mode:'phase5-object-shape',inputDraws:doc.draws.length,selectedDraws:selected.length,bodyObjects:[...bodyKeys],wheelObjects:[...wheelKeys]}}};
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
function stripPrivate(b){delete b._map;if(!b.normals.length)delete b.normals;if(!b.uvs.length)delete b.uvs;if(!b.texture)delete b.texture;if(!b.color)delete b.color;if(!b.materialKey)delete b.materialKey;return b;}
function materialColor(id){let h=2166136261;for(const c of id){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return [.38+((h>>>0)&255)/255*.42,.38+((h>>>8)&255)/255*.42,.38+((h>>>16)&255)/255*.42].map(v=>q(v,1000));}
function materialTable(doc,draws){const map=new Map();for(const m of doc.materials||[])if(m?.id)map.set(m.id,{...m});for(const d of draws){if(!map.has(d.material))map.set(d.material,{id:d.material,color:d.color||materialColor(d.material),...(d.texture?{texture:d.texture}:{}),...(d.materialKey?{materialKey:d.materialKey}:{})});}return [...map.values()];}

export function buildNativeCapture(raw,{frame=null,tag=null,shader=null,object=null,minTriangles=1,autoCar=false}={}){
  let doc=autoCar?autoIsolateCarDraws(raw):parseRawDrawStream(raw),draws=doc.draws;
  if(frame!=null)draws=draws.filter(d=>d.frame===Number(frame));
  if(tag)draws=draws.filter(d=>d.tag.includes(String(tag)));
  if(shader!=null)draws=draws.filter(d=>String(d.shader)===String(shader));
  if(object!=null)draws=draws.filter(d=>String(d.object)===String(object));
  draws=draws.filter(d=>d.role!=='scene'&&d.indices.length/3>=Number(minTriangles||1));
  if(!draws.length)throw Error('no draw calls matched the capture filters');
  const buckets={body:new Map(),wheel:new Map()};
  for(const d of draws){const role=d.role==='wheel'?'wheel':'body',key=`${d.material}|${d.texture||''}|${d.color?.join(',')||''}`;let b=buckets[role].get(key);if(!b){b={material:d.material,materialKey:d.materialKey,texture:d.texture,color:d.color,positions:[],normals:[],uvs:[],indices:[]};buckets[role].set(key,b);}addDrawToBucket(b,d);}
  const body=[...buckets.body.values()].map(stripPrivate);if(!body.length)throw Error('capture has no body geometry');
  const wheelMeshes=[...buckets.wheel.values()].map(stripPrivate),triangleCount=draws.reduce((n,d)=>n+d.indices.length/3,0);
  return {
    format:OUT_FORMAT,version:OUT_VERSION,source:doc.source,axes:doc.axes,materials:materialTable(doc,draws),body,
    ...(wheelMeshes.length?{wheel:{meshes:wheelMeshes}}:{}),
    metadata:{...doc.metadata,phase:'models-phase5-materials',selectedDraws:draws.length,triangles:triangleCount,uvDraws:draws.filter(d=>d.uvs).length,normalDraws:draws.filter(d=>d.normals).length,frames:[...new Set(draws.map(d=>d.frame))].sort((a,b)=>a-b)}
  };
}

export function summarizeRawDrawStream(raw){
  const doc=parseRawDrawStream(raw),frames=new Map(),roles={auto:0,body:0,wheel:0,scene:0},materials=new Map(),shaders=new Map(),objects=new Map();let triangles=0,uvDraws=0,normalDraws=0;
  for(const d of doc.draws){const t=d.indices.length/3;triangles+=t;roles[d.role]++;if(d.uvs)uvDraws++;if(d.normals)normalDraws++;frames.set(d.frame,(frames.get(d.frame)||0)+t);materials.set(d.material,(materials.get(d.material)||0)+t);if(d.shader!=null)shaders.set(String(d.shader),(shaders.get(String(d.shader))||0)+t);objects.set(String(d.object),(objects.get(String(d.object))||0)+t);}
  const top=m=>[...m.entries()].sort((a,b)=>b[1]-a[1]).slice(0,12).map(([id,count])=>({id,count}));
  return {draws:doc.draws.length,triangles,uvDraws,normalDraws,roles,frames:top(frames),materials:top(materials),shaders:top(shaders),objects:top(objects),source:doc.source,axes:doc.axes};
}

export const MW_DRAW_STREAM_FORMAT=RAW_FORMAT;
export const MW_DRAW_STREAM_VERSION=RAW_VERSION;
