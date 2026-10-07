import {parseNativeCapture} from './mw-native-capture.js';
const DEFAULT_COLOR=[0.72,0.74,0.78];
const DEFAULT_PARAMS={roughness:.55,reflectivity:.14,opacity:1,emissive:0,normalStrength:0,detailStrength:.2};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

export const CAR_MODEL_MANIFEST=[
  {id:'track-r',match:'Touring GTR · E46 inspired',body:'assets/free-cars/track-r/body.obj',mtl:'assets/free-cars/track-r/body.mtl',forward:'z',up:'y',excludeWheelGroups:true,tintSpec:true,source:'kenney-cc0'},
  {id:'vector-f',match:'Vector R · R34 inspired',body:'assets/free-cars/vector-f/body.obj',mtl:'assets/free-cars/vector-f/body.mtl',forward:'z',up:'y',excludeWheelGroups:true,tintSpec:true,source:'kenney-cc0'},
  {id:'apex-s',match:'Apex J · Mk4 inspired',body:'assets/free-cars/apex-s/body.obj',mtl:'assets/free-cars/apex-s/body.mtl',forward:'z',up:'y',excludeWheelGroups:true,tintSpec:true,source:'kenney-cc0'},
  {id:'rotary-h',match:'Rotary F · FD inspired',body:'assets/free-cars/rotary-h/body.obj',mtl:'assets/free-cars/rotary-h/body.mtl',forward:'z',up:'y',excludeWheelGroups:true,tintSpec:true,source:'kenney-cc0'},
  {id:'rally-s',match:'Rally IX · Evo inspired',body:'assets/free-cars/rally-s/body.obj',mtl:'assets/free-cars/rally-s/body.mtl',forward:'z',up:'y',excludeWheelGroups:true,tintSpec:true,source:'kenney-cc0'},
  {id:'rearsport-x',match:'RearSport GT · 911 inspired',body:'assets/free-cars/rearsport-x/body.obj',mtl:'assets/free-cars/rearsport-x/body.mtl',forward:'z',up:'y',excludeWheelGroups:true,tintSpec:true,source:'kenney-cc0'}
];
export const MW_MODEL_MANIFEST=CAR_MODEL_MANIFEST;

function resolveIndex(i,n){const v=Number(i);return v<0?n+v:v-1;}
function colorOf(materials,name){return materials.get(name)?.kd||DEFAULT_COLOR;}
function textureOf(materials,name){return materials.get(name)?.map||null;}

export function parseMTL(text){
  const out=new Map();let current=null;
  for(const raw of text.split(/\r?\n/)){
    const line=raw.trim();if(!line||line.startsWith('#'))continue;
    const [cmd,...rest]=line.split(/\s+/);
    if(cmd==='newmtl'){current={kd:[1,1,1],map:null};out.set(rest.join(' '),current);}
    else if(cmd==='Kd'&&current&&rest.length>=3)current.kd=rest.slice(0,3).map(Number).map(v=>clamp(Number.isFinite(v)?v:1,0,1));
    else if(cmd==='map_Kd'&&current)current.map=rest.join(' ');
  }
  return out;
}

export function filterOBJGroups(text,{excludeWheels=false}={}){
  if(!excludeWheels)return text;
  let group='default';const out=[];
  for(const raw of text.split(/\r?\n/)){
    const line=raw.trim();
    if(line.startsWith('g ')){group=line.slice(2).trim().toLowerCase();out.push(raw);continue;}
    if(line.startsWith('f ')&&group.startsWith('wheel'))continue;
    out.push(raw);
  }
  return out.join('\n');
}

export function parseOBJ(text,materials=new Map()){
  const v=[],vn=[],vt=[],sections=new Map();let material='default';
  const sec=()=>{if(!sections.has(material)){const texture=textureOf(materials,material);sections.set(material,{material,positions:[],normals:[],uvs:[],color:colorOf(materials,material),texture,maps:texture?{albedo:texture}:{},surface:'detail',params:{...DEFAULT_PARAMS}});}return sections.get(material);};
  const readPos=id=>v[resolveIndex(id.v,v.length)]||[0,0,0];
  const token=s=>{const [a,b,c]=s.split('/');return {v:a,t:b||null,n:c||null};};
  const emit=(a,b,c)=>{
    const s=sec(),ids=[a,b,c],pa=readPos(a),pb=readPos(b),pc=readPos(c);
    let nx=0,ny=1,nz=0;
    if(!a.n||!b.n||!c.n){const ux=pb[0]-pa[0],uy=pb[1]-pa[1],uz=pb[2]-pa[2],vx=pc[0]-pa[0],vy=pc[1]-pa[1],vz=pc[2]-pa[2];nx=uy*vz-uz*vy;ny=uz*vx-ux*vz;nz=ux*vy-uy*vx;const l=Math.hypot(nx,ny,nz)||1;nx/=l;ny/=l;nz/=l;}
    for(const id of ids){const p=readPos(id);s.positions.push(...p);if(id.n){const n=vn[resolveIndex(id.n,vn.length)]||[nx,ny,nz];s.normals.push(...n);}else s.normals.push(nx,ny,nz);if(id.t){const t=vt[resolveIndex(id.t,vt.length)]||[0,0];s.uvs.push(t[0],1-t[1]);}else s.uvs.push(0,0);}
  };
  for(const raw of text.split(/\r?\n/)){
    const line=raw.trim();if(!line||line.startsWith('#'))continue;const [cmd,...rest]=line.split(/\s+/);
    if(cmd==='v'&&rest.length>=3)v.push(rest.slice(0,3).map(Number));
    else if(cmd==='vn'&&rest.length>=3)vn.push(rest.slice(0,3).map(Number));
    else if(cmd==='vt'&&rest.length>=2)vt.push(rest.slice(0,2).map(Number));
    else if(cmd==='usemtl')material=rest.join(' ')||'default';
    else if(cmd==='f'&&rest.length>=3){const f=rest.map(token);for(let i=1;i<f.length-1;i++)emit(f[0],f[i],f[i+1]);}
  }
  return [...sections.values()].filter(s=>s.positions.length>0);
}

export function normalizeSections(sections,spec,{forward='z',up='y',wheel=false}={}){
  const all=[];for(const s of sections)for(let i=0;i<s.positions.length;i+=3)all.push([s.positions[i],s.positions[i+1],s.positions[i+2]]);
  if(!all.length)return sections;
  const axis={x:0,y:1,z:2},fi=axis[forward]??2,ui=axis[up]??1,wi=[0,1,2].find(i=>i!==fi&&i!==ui)??0;
  let min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const p of all)for(let i=0;i<3;i++){min[i]=Math.min(min[i],p[i]);max[i]=Math.max(max[i],p[i]);}
  const srcLength=Math.max(1e-5,max[fi]-min[fi]),srcWidth=Math.max(1e-5,max[wi]-min[wi]),srcHeight=Math.max(1e-5,max[ui]-min[ui]);
  const targetLength=wheel?0.70:spec.length,targetWidth=wheel?0.28:spec.width,targetHeight=wheel?0.70:spec.height;
  const scale=Math.min(targetLength/srcLength,targetWidth/srcWidth,targetHeight/srcHeight)*(wheel?1:.985);
  const center=[(min[0]+max[0])*.5,(min[1]+max[1])*.5,(min[2]+max[2])*.5],floor=min[ui];
  for(const s of sections){for(let i=0;i<s.positions.length;i+=3){const p=[s.positions[i],s.positions[i+1],s.positions[i+2]],out=[0,0,0];out[2]=(p[fi]-center[fi])*scale;out[1]=(p[ui]-floor)*scale;out[0]=(p[wi]-center[wi])*scale;s.positions[i]=out[0];s.positions[i+1]=out[1];s.positions[i+2]=out[2];}for(let i=0;i<s.normals.length;i+=3){const n=[s.normals[i],s.normals[i+1],s.normals[i+2]],out=[0,0,0];out[2]=n[fi];out[1]=n[ui];out[0]=n[wi];const l=Math.hypot(...out)||1;s.normals[i]=out[0]/l;s.normals[i+1]=out[1]/l;s.normals[i+2]=out[2]/l;}}
  return sections;
}

async function fetchText(url){const r=await fetch(new URL(url,import.meta.url));if(!r.ok)throw Error(`${r.status} ${url}`);return r.text();}
async function maybeText(url){try{return await fetchText(url);}catch{return null;}}
function resolveTextures(sections,base){
  for(const s of sections){
    s.textureURLs={};
    for(const [role,path] of Object.entries(s.maps||{})){
      if(Array.isArray(path)&&role==='environmentCube'&&path.length===6){
        try{s.textureURLs[role]=path.map(face=>new URL(face,base).href);}catch{/* ignore malformed cubemap URL */}
        continue;
      }
      if(typeof path!=='string'||!path)continue;try{s.textureURLs[role]=new URL(path,base).href;}catch{/* ignore malformed capture URL */}
    }
    if(s.texture&&!s.textureURLs.albedo){try{s.textureURLs.albedo=new URL(s.texture,base).href;}catch{/* ignore */}}
    s.textureURL=typeof s.textureURLs.albedo==='string'?s.textureURLs.albedo:null;
  }
  return sections;
}

async function loadNativeCapture(spec,entry){
  if(!entry.capture)return null;const text=await maybeText(entry.capture);if(!text)return null;
  const native=parseNativeCapture(text),axes={forward:native.forward||entry.forward,up:native.up||entry.up},base=new URL(entry.capture,import.meta.url);
  const body=resolveTextures(normalizeSections(native.body,spec,axes),base),wheel=native.wheel?resolveTextures(normalizeSections(native.wheel,spec,{...axes,wheel:true}),base):null;
  return {source:'mw2005-native-capture',captureSource:native.source,metadata:native.metadata,id:entry.id,body,wheel,wheelX:spec.width*.505,wheelZ:spec.wheelbase*.5,wheelRadius:.35};
}
async function loadOBJCar(spec,entry){
  const bodyText=await maybeText(entry.body);if(!bodyText)return null;
  const mtlText=entry.mtl?await maybeText(entry.mtl):null,materials=mtlText?parseMTL(mtlText):new Map(),materialBase=new URL(entry.mtl||entry.body,import.meta.url);
  const bodySource=filterOBJGroups(bodyText,{excludeWheels:Boolean(entry.excludeWheelGroups)});
  const body=resolveTextures(normalizeSections(parseOBJ(bodySource,materials),spec,entry),materialBase);
  if(entry.tintSpec)for(const section of body){section.color=[...spec.color];section.texture=null;section.textureURL=null;section.maps={};section.textureURLs={};section.surface='paint';section.params={...DEFAULT_PARAMS,roughness:.38,reflectivity:.24};}
  let wheel=null;if(entry.wheel){const wheelText=await maybeText(entry.wheel);if(wheelText)wheel=resolveTextures(normalizeSections(parseOBJ(wheelText,materials),spec,{...entry,wheel:true}),materialBase);}
  return {source:entry.source||'obj-import',id:entry.id,body,wheel,wheelX:spec.width*.505,wheelZ:spec.wheelbase*.5,wheelRadius:.35};
}

export async function loadImportedCar(spec,entry){
  if(!entry)return null;
  try{const native=await loadNativeCapture(spec,entry);if(native)return native;}catch(error){console.warn('Native capture invalid, trying OBJ fallback',entry.id,error);}
  return loadOBJCar(spec,entry);
}

export async function loadImportedCarSet(specs){
  return Promise.all(specs.map(async spec=>{const entry=CAR_MODEL_MANIFEST.find(x=>x.match===spec.name);try{return await loadImportedCar(spec,entry);}catch(error){console.warn('Imported car fallback',spec.name,error);return null;}}));
}
