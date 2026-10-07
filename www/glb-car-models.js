const TYPES={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16};
const COMPONENTS={
  5120:{bytes:1,get:(v,o)=>v.getInt8(o),norm:v=>Math.max(-1,v/127)},
  5121:{bytes:1,get:(v,o)=>v.getUint8(o),norm:v=>v/255},
  5122:{bytes:2,get:(v,o)=>v.getInt16(o,true),norm:v=>Math.max(-1,v/32767)},
  5123:{bytes:2,get:(v,o)=>v.getUint16(o,true),norm:v=>v/65535},
  5125:{bytes:4,get:(v,o)=>v.getUint32(o,true),norm:v=>v/4294967295},
  5126:{bytes:4,get:(v,o)=>v.getFloat32(o,true),norm:v=>v}
};

export const HD_CAR_MANIFEST=[
  {id:'bmw-m4',label:'BMW M4 Competition',file:'assets/hd-cars/bmw-m4.glb',source:'CC BY 4.0 · SRT Performance',fit:.985},
  {id:'tesla-model3',label:'Tesla Model 3',file:'assets/hd-cars/tesla-model3.glb',source:'CC BY 4.0 · Ameer Studio',flipZ:true,fit:.985},
  {id:'mustang-2005',label:'Mustang GT 2005',file:'assets/hd-cars/mustang-2005.glb',source:'CC BY 4.0 · Ricy',fit:.985},
  {id:'car-concept',label:'K15 Concept Coupé',file:'assets/hd-cars/car-concept.glb',source:'CC BY 4.0 · Khronos sample asset',fit:.985},
  {id:'toy-car',label:'Toy Car GT',file:'assets/hd-cars/toy-car.glb',source:'CC0 · Guido Odendahl / Eric Chadwick',fit:.985,includeNodes:['ToyCar']},
  {id:'porsche-911',label:'Porsche 911 Carrera 4S',file:'assets/hd-cars/porsche-911.glb',source:'CC BY 4.0 · Lionsharp Studios',fit:.985}
];

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function mul(a,b){
  const o=new Float64Array(16);
  for(let c=0;c<4;c++)for(let r=0;r<4;r++)o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];
  return o;
}
function trs(node){
  if(Array.isArray(node.matrix)&&node.matrix.length===16)return Float64Array.from(node.matrix);
  const t=node.translation||[0,0,0],s=node.scale||[1,1,1],q=node.rotation||[0,0,0,1],x=q[0],y=q[1],z=q[2],w=q[3];
  const x2=x+x,y2=y+y,z2=z+z,xx=x*x2,xy=x*y2,xz=x*z2,yy=y*y2,yz=y*z2,zz=z*z2,wx=w*x2,wy=w*y2,wz=w*z2;
  return Float64Array.from([
    (1-(yy+zz))*s[0],(xy+wz)*s[0],(xz-wy)*s[0],0,
    (xy-wz)*s[1],(1-(xx+zz))*s[1],(yz+wx)*s[1],0,
    (xz+wy)*s[2],(yz-wx)*s[2],(1-(xx+yy))*s[2],0,
    t[0],t[1],t[2],1
  ]);
}
function point(m,x,y,z){return [m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]];}
function direction(m,x,y,z){let X=m[0]*x+m[4]*y+m[8]*z,Y=m[1]*x+m[5]*y+m[9]*z,Z=m[2]*x+m[6]*y+m[10]*z,l=Math.hypot(X,Y,Z)||1;return [X/l,Y/l,Z/l];}
function identity(){return Float64Array.from([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);}
function u32(v,o){return v.getUint32(o,true);}
function decodeText(bytes){return new TextDecoder().decode(bytes).replace(/\0+$/,'').trim();}

export function parseGLB(buffer,{baseUrl='',label='car',includeNodes=null}={}){
  const view=new DataView(buffer);
  if(view.byteLength<20||u32(view,0)!==0x46546c67||u32(view,4)!==2)throw Error(`Invalid GLB: ${label}`);
  let offset=12,json=null,bin=null;
  while(offset+8<=view.byteLength){
    const len=u32(view,offset),type=u32(view,offset+4),start=offset+8,end=start+len;
    if(end>view.byteLength)throw Error(`Broken GLB chunk: ${label}`);
    if(type===0x4e4f534a)json=JSON.parse(decodeText(new Uint8Array(buffer,start,len)));
    else if(type===0x004e4942)bin=buffer.slice(start,end);
    offset=end;
  }
  if(!json||!bin)throw Error(`GLB missing JSON/BIN: ${label}`);
  const unsupported=(json.extensionsRequired||[]).filter(x=>x==='KHR_draco_mesh_compression'||x==='EXT_meshopt_compression');
  if(unsupported.length)throw Error(`Compressed GLB unsupported (${unsupported.join(', ')}): ${label}`);
  const binView=new DataView(bin),imageCache=new Map();
  function accessor(index){
    const a=json.accessors?.[index];if(!a)throw Error(`Missing accessor ${index}`);
    if(a.sparse)throw Error(`Sparse accessor unsupported in ${label}`);
    const n=TYPES[a.type];const ct=COMPONENTS[a.componentType];if(!n||!ct)throw Error(`Unsupported accessor type in ${label}`);
    const out=new Float64Array(a.count*n);if(a.bufferView==null)return {data:out,count:a.count,size:n};
    const bv=json.bufferViews?.[a.bufferView];if(!bv||Number(bv.buffer||0)!==0)throw Error(`Unsupported GLB buffer in ${label}`);
    const stride=bv.byteStride||ct.bytes*n,base=(bv.byteOffset||0)+(a.byteOffset||0);
    for(let i=0;i<a.count;i++)for(let k=0;k<n;k++){
      const raw=ct.get(binView,base+i*stride+k*ct.bytes);
      out[i*n+k]=a.normalized?ct.norm(raw):raw;
    }
    return {data:out,count:a.count,size:n};
  }
  function imageURL(imageIndex){
    if(imageIndex==null)return null;if(imageCache.has(imageIndex))return imageCache.get(imageIndex);
    const image=json.images?.[imageIndex];if(!image)return null;let url=null;
    if(image.uri)url=image.uri.startsWith('data:')?image.uri:new URL(image.uri,baseUrl).href;
    else if(image.bufferView!=null){
      const bv=json.bufferViews?.[image.bufferView];if(!bv||Number(bv.buffer||0)!==0)return null;
      const bytes=new Uint8Array(bin,(bv.byteOffset||0),bv.byteLength);
      url=URL.createObjectURL(new Blob([bytes],{type:image.mimeType||'image/png'}));
    }
    imageCache.set(imageIndex,url);return url;
  }
  function textureURL(info){
    if(!info||info.index==null)return null;
    const t=json.textures?.[info.index];if(!t)return null;
    const src=t.extensions?.KHR_texture_basisu?.source??t.source;
    return imageURL(src);
  }
  function materialInfo(index){
    const m=json.materials?.[index]||{},p=m.pbrMetallicRoughness||{},f=p.baseColorFactor||[1,1,1,1],name=String(m.name||'material').toLowerCase();
    const transmission=Number(m.extensions?.KHR_materials_transmission?.transmissionFactor||0);
    let surface='paint';
    if(/glass|window|windscreen|windshield/.test(name))surface='glass';
    else if(/tire|tyre|rubber/.test(name))surface='rubber';
    else if(/headlight|taillight|lamp|light|emiss/.test(name))surface='light';
    else if(/chrome|metal|rim|wheel|alloy/.test(name))surface='metal';
    let rough=Number(p.roughnessFactor??.48),refl=.16+Number(p.metallicFactor??0)*.38,opacity=Number(f[3]??1),emissive=0;
    if(surface==='glass'){opacity=Math.min(opacity,transmission>0?Math.max(.14,1-transmission*.7):.42);rough=Math.min(rough,.22);refl=Math.max(refl,.34);}
    if(surface==='rubber'){rough=Math.max(rough,.82);refl=.035;}
    if(surface==='metal'){rough=Math.min(rough,.32);refl=Math.max(refl,.42);}
    const ef=m.emissiveFactor||[0,0,0];emissive=Math.max(...ef,0);if(surface==='light'&&m.emissiveTexture)emissive=Math.max(emissive,.45);
    return {
      name:m.name||'material',surface,color:[clamp(Number(f[0]??1),0,1),clamp(Number(f[1]??1),0,1),clamp(Number(f[2]??1),0,1)],
      params:{roughness:clamp(rough,0,1),reflectivity:clamp(refl,0,.92),opacity:clamp(opacity,.06,1),emissive:clamp(emissive,0,4),normalStrength:Number(m.normalTexture?.scale??1),detailStrength:.2},
      textureURLs:{albedo:textureURL(p.baseColorTexture),normal:textureURL(m.normalTexture),emissive:textureURL(m.emissiveTexture)}
    };
  }
  const sections=[];
  function emitPrimitive(primitive,world,nodeName=''){
    if((primitive.mode??4)!==4||primitive.attributes?.POSITION==null)return;
    if(Array.isArray(includeNodes)&&includeNodes.length&&!includeNodes.includes(nodeName))return;
    const pos=accessor(primitive.attributes.POSITION),nor=primitive.attributes.NORMAL!=null?accessor(primitive.attributes.NORMAL):null,uv=primitive.attributes.TEXCOORD_0!=null?accessor(primitive.attributes.TEXCOORD_0):null;
    const indices=primitive.indices!=null?accessor(primitive.indices).data:null;
    const count=indices?indices.length:pos.count,positions=[],normals=[],uvs=[];
    for(let i=0;i<count;i++){
      const vi=indices?Math.trunc(indices[i]):i,p=point(world,pos.data[vi*3],pos.data[vi*3+1],pos.data[vi*3+2]);positions.push(...p);
      if(nor){const n=direction(world,nor.data[vi*3],nor.data[vi*3+1],nor.data[vi*3+2]);normals.push(...n);}else normals.push(0,0,0);
      if(uv&&uv.size>=2)uvs.push(uv.data[vi*uv.size],1-uv.data[vi*uv.size+1]);else uvs.push(0,0);
    }
    if(!nor){
      for(let i=0;i<positions.length;i+=9){
        const ax=positions[i],ay=positions[i+1],az=positions[i+2],bx=positions[i+3],by=positions[i+4],bz=positions[i+5],cx=positions[i+6],cy=positions[i+7],cz=positions[i+8];
        let nx=(by-ay)*(cz-az)-(bz-az)*(cy-ay),ny=(bz-az)*(cx-ax)-(bx-ax)*(cz-az),nz=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax),l=Math.hypot(nx,ny,nz)||1;nx/=l;ny/=l;nz/=l;
        normals.splice(i,9,nx,ny,nz,nx,ny,nz,nx,ny,nz);
      }
    }
    const mat=materialInfo(primitive.material);sections.push({...mat,nodeName,positions,normals,uvs});
  }
  const roots=json.scenes?.[json.scene??0]?.nodes??json.nodes?.map((_,i)=>i)??[];
  function walk(index,parent){
    const node=json.nodes?.[index];if(!node)return;const world=mul(parent,trs(node));
    if(node.mesh!=null){const mesh=json.meshes?.[node.mesh];for(const primitive of mesh?.primitives||[])emitPrimitive(primitive,world,node.name||mesh?.name||'');}
    for(const child of node.children||[])walk(child,world);
  }
  for(const root of roots)walk(root,identity());
  if(!sections.length)throw Error(`No triangle meshes in ${label}`);
  return {json,sections};
}

function rotateXZ(x,z,angle){const c=Math.cos(angle),s=Math.sin(angle);return [x*c+z*s,-x*s+z*c];}
export function normalizeGLBSections(sections,spec,entry={}){
  let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
  for(const s of sections)for(let i=0;i<s.positions.length;i+=3){const x=s.positions[i],y=s.positions[i+1],z=s.positions[i+2];minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);minZ=Math.min(minZ,z);maxZ=Math.max(maxZ,z);}
  const sx=maxX-minX,sz=maxZ-minZ,swap=sx>sz*1.08,baseYaw=(swap?Math.PI/2:0)+(Number(entry.yaw)||0);
  let aMinX=Infinity,aMinZ=Infinity,aMaxX=-Infinity,aMaxZ=-Infinity;
  for(const s of sections)for(let i=0;i<s.positions.length;i+=3){let [x,z]=rotateXZ(s.positions[i],s.positions[i+2],baseYaw);if(entry.flipZ)z=-z;aMinX=Math.min(aMinX,x);aMaxX=Math.max(aMaxX,x);aMinZ=Math.min(aMinZ,z);aMaxZ=Math.max(aMaxZ,z);}
  const spanX=Math.max(.001,aMaxX-aMinX),spanY=Math.max(.001,maxY-minY),spanZ=Math.max(.001,aMaxZ-aMinZ),fit=Number(entry.fit)||.985;
  const scale=Math.min(spec.width/spanX,spec.height/spanY,spec.length/spanZ)*fit,cx=(aMinX+aMaxX)/2,cz=(aMinZ+aMaxZ)/2,floor=.03;
  for(const s of sections){
    for(let i=0;i<s.positions.length;i+=3){
      let [x,z]=rotateXZ(s.positions[i],s.positions[i+2],baseYaw);if(entry.flipZ)z=-z;
      s.positions[i]=(x-cx)*scale;s.positions[i+1]=(s.positions[i+1]-minY)*scale+floor;s.positions[i+2]=(z-cz)*scale;
      let [nx,nz]=rotateXZ(s.normals[i],s.normals[i+2],baseYaw);if(entry.flipZ)nz=-nz;const ny=s.normals[i+1],l=Math.hypot(nx,ny,nz)||1;s.normals[i]=nx/l;s.normals[i+1]=ny/l;s.normals[i+2]=nz/l;
    }
  }
  return {sections,scale,dimensions:{width:spanX*scale,height:spanY*scale,length:spanZ*scale}};
}

export async function loadHDCar(entry,spec){
  const url=new URL(entry.file,location.href).href,r=await fetch(url,{cache:'force-cache'});if(!r.ok)throw Error(`HD model ${r.status}: ${entry.id}`);
  const parsed=parseGLB(await r.arrayBuffer(),{baseUrl:url,label:entry.id,includeNodes:entry.includeNodes||null}),normalized=normalizeGLBSections(parsed.sections,spec,entry);
  return {id:entry.id,displayName:entry.label,source:`hd-glb:${entry.source}`,body:normalized.sections,wheel:null,embeddedWheels:true,wheelX:spec.width/2,wheelZ:spec.wheelbase/2,dimensions:normalized.dimensions};
}
export async function loadHDCarSet(specs){
  const out=[];
  for(let i=0;i<specs.length;i++){
    const entry=HD_CAR_MANIFEST[i];try{out.push(await loadHDCar(entry,specs[i]));}
    catch(error){console.warn('[HD CAR FALLBACK]',entry?.id,error);out.push(null);}
  }
  return out;
}
