export const MW_NATIVE_CAPTURE_FORMAT='marocto-mw-native-capture';
export const MW_NATIVE_CAPTURE_VERSION=1;
const MAX_VERTICES=2_000_000;
const DEFAULT_COLOR=[.72,.74,.78];
const DEFAULT_PARAMS={roughness:.55,reflectivity:.14,opacity:1,emissive:0,normalStrength:0,detailStrength:.2};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

function finiteArray(value,name,multiple){
  if(!Array.isArray(value)||value.length===0||value.length%multiple!==0)throw Error(`${name} must be a non-empty array divisible by ${multiple}`);
  if(value.length/multiple>MAX_VERTICES)throw Error(`${name} exceeds ${MAX_VERTICES} vertices`);
  const out=value.map(Number);if(out.some(v=>!Number.isFinite(v)))throw Error(`${name} contains non-finite values`);return out;
}
function optionalArray(value,name,multiple){if(value==null)return null;return finiteArray(value,name,multiple);}
function color(value){if(!Array.isArray(value)||value.length<3)return DEFAULT_COLOR.slice();return value.slice(0,3).map(Number).map(v=>clamp(Number.isFinite(v)?v:1,0,1));}
function stringMap(value){const out={};if(!value||typeof value!=='object')return out;for(const [k,v] of Object.entries(value))if(typeof v==='string'&&v)out[k]=v;return out;}
function params(value){const out={...DEFAULT_PARAMS};if(!value||typeof value!=='object')return out;for(const k of Object.keys(out)){const v=Number(value[k]);if(Number.isFinite(v))out[k]=v;}out.roughness=clamp(out.roughness,0,1);out.reflectivity=clamp(out.reflectivity,0,1);out.opacity=clamp(out.opacity,0,1);out.emissive=Math.max(0,out.emissive);out.normalStrength=clamp(out.normalStrength,0,2);out.detailStrength=clamp(out.detailStrength,0,2);return out;}
function normalizeMaterialTable(doc){
  const map=new Map();for(const raw of Array.isArray(doc.materials)?doc.materials:[]){if(!raw||typeof raw.id!=='string'||!raw.id)continue;const maps=stringMap(raw.maps),legacy=typeof raw.texture==='string'?raw.texture:null;if(legacy&&!maps.albedo)maps.albedo=legacy;map.set(raw.id,{color:color(raw.color||raw.kd),texture:legacy||maps.albedo||null,maps,surface:typeof raw.surface==='string'?raw.surface:'detail',params:params(raw.params),samplers:Array.isArray(raw.samplers)?raw.samplers:[]});}return map;
}
function faceNormal(a,b,c){const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;const l=Math.hypot(nx,ny,nz)||1;return [nx/l,ny/l,nz/l];}
function read3(a,i){return [a[i*3],a[i*3+1],a[i*3+2]];}

export function captureMeshToSection(mesh,materials=new Map()){
  if(!mesh||typeof mesh!=='object')throw Error('capture mesh must be an object');
  const positions=finiteArray(mesh.positions,'positions',3),vertexCount=positions.length/3;
  const normals=optionalArray(mesh.normals,'normals',3),uvs=optionalArray(mesh.uvs,'uvs',2);
  if(normals&&normals.length/3!==vertexCount)throw Error('normals vertex count does not match positions');
  if(uvs&&uvs.length/2!==vertexCount)throw Error('uv vertex count does not match positions');
  let indices;
  if(mesh.indices==null){if(vertexCount%3!==0)throw Error('unindexed mesh vertex count must be divisible by 3');indices=Array.from({length:vertexCount},(_,i)=>i);}
  else{indices=mesh.indices.map(Number);if(!indices.length||indices.length%3!==0||indices.some(i=>!Number.isInteger(i)||i<0||i>=vertexCount))throw Error('indices must be valid triangle indices');}
  if(indices.length/3>MAX_VERTICES)throw Error('capture contains too many triangles');
  const materialId=typeof mesh.material==='string'?mesh.material:'default',material=materials.get(materialId)||{},maps={...(material.maps||{})};
  const meshTexture=typeof mesh.texture==='string'?mesh.texture:null,texture=meshTexture||material.texture||maps.albedo||null;if(texture&&!maps.albedo)maps.albedo=texture;
  const section={material:materialId,positions:[],normals:[],uvs:[],color:color(mesh.color||material.color),texture,maps,surface:material.surface||'detail',params:params(material.params),samplers:material.samplers||[]};
  for(let i=0;i<indices.length;i+=3){const ids=[indices[i],indices[i+1],indices[i+2]],n=normals?null:faceNormal(read3(positions,ids[0]),read3(positions,ids[1]),read3(positions,ids[2]));for(const id of ids){const p=read3(positions,id);section.positions.push(...p);if(normals)section.normals.push(...read3(normals,id));else section.normals.push(...n);if(uvs)section.uvs.push(uvs[id*2],uvs[id*2+1]);else section.uvs.push(0,0);}}
  return section;
}
function parseMeshes(value,materials,label){if(!Array.isArray(value))throw Error(`${label} must be an array`);const out=value.map(m=>captureMeshToSection(m,materials)).filter(s=>s.positions.length);if(!out.length)throw Error(`${label} has no drawable meshes`);return out;}
function positiveNumber(v,fallback){v=Number(v);return Number.isFinite(v)&&v>0?v:fallback;}

export function parseNativeCapture(input){
  const doc=typeof input==='string'?JSON.parse(input):input;if(!doc||typeof doc!=='object')throw Error('capture root must be an object');
  if(doc.format!==MW_NATIVE_CAPTURE_FORMAT)throw Error(`unsupported capture format: ${doc.format||'missing'}`);
  if(Number(doc.version)!==MW_NATIVE_CAPTURE_VERSION)throw Error(`unsupported capture version: ${doc.version}`);
  const materials=normalizeMaterialTable(doc),body=parseMeshes(doc.body,materials,'body');
  let wheel=null;if(doc.wheel?.meshes)wheel=parseMeshes(doc.wheel.meshes,materials,'wheel.meshes');
  const forward=doc.axes?.forward||doc.forward||'z',up=doc.axes?.up||doc.up||'y';if(!['x','y','z'].includes(forward)||!['x','y','z'].includes(up)||forward===up)throw Error('capture axes must use two distinct x/y/z axes');
  return {source:typeof doc.source==='string'?doc.source:'nfsmw-x360-native-capture',forward,up,body,wheel,wheelX:positiveNumber(doc.wheel?.x,null),wheelZ:positiveNumber(doc.wheel?.z,null),wheelRadius:positiveNumber(doc.wheel?.radius,.35),metadata:doc.metadata&&typeof doc.metadata==='object'?doc.metadata:{}};
}

export function createNativeCaptureTemplate(){return {format:MW_NATIVE_CAPTURE_FORMAT,version:MW_NATIVE_CAPTURE_VERSION,source:'nfsmw-x360',axes:{forward:'z',up:'y'},materials:[{id:'paint',color:[.8,.8,.8],texture:'textures/paint.png',surface:'paint',maps:{albedo:'textures/paint.png'},params:{roughness:.34,reflectivity:.46,opacity:1,emissive:0,normalStrength:.7,detailStrength:.25}}],body:[{material:'paint',positions:[-1,0,-2,1,0,-2,1,1,2,-1,1,2],uvs:[0,0,1,0,1,1,0,1],indices:[0,1,2,0,2,3]}],wheel:{radius:.35,meshes:[{material:'tire',positions:[-.2,0,-.3,.2,0,-.3,.2,0,.3,-.2,0,.3],indices:[0,1,2,0,2,3]}]},metadata:{note:'Template only. Replace with geometry captured from a legally owned copy of NFSMW.'}};}
