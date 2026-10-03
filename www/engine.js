// Existing native WebGL2 renderer, extended with colored procedural meshes,
// imported multi-map MW2005 materials, reusable matrices, fog and chase cameras.
export function identity(m){m.fill(0);m[0]=m[5]=m[10]=m[15]=1;return m;}
export function multiply(out,a,b){for(let c=0;c<4;c++)for(let r=0;r<4;r++)out[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];return out;}
export function modelMatrix(m,x,y,z,yaw=0,roll=0,pitch=0){
  const c=Math.cos(yaw),s=Math.sin(yaw),cr=Math.cos(roll),sr=Math.sin(roll),cp=Math.cos(pitch),sp=Math.sin(pitch);
  m[0]=c*cr;m[1]=sr;m[2]=-s*cr;m[3]=0;
  m[4]=-c*sr*cp+s*sp;m[5]=cr*cp;m[6]=s*sr*cp+c*sp;m[7]=0;
  m[8]=c*sr*sp+s*cp;m[9]=-cr*sp;m[10]=-s*sr*sp+c*cp;m[11]=0;
  m[12]=x;m[13]=y;m[14]=z;m[15]=1;return m;
}
function perspective(m,fov,aspect){m.fill(0);const f=1/Math.tan(fov/2),near=.15,far=430;m[0]=f/aspect;m[5]=f;m[10]=(far+near)/(near-far);m[11]=-1;m[14]=2*far*near/(near-far);}
function look(m,ex,ey,ez,tx,ty,tz){
  let zx=ex-tx,zy=ey-ty,zz=ez-tz,l=Math.hypot(zx,zy,zz)||1;zx/=l;zy/=l;zz/=l;
  let xx=zz,xz=-zx;l=Math.hypot(xx,xz)||1;xx/=l;xz/=l;
  const yx=zy*xz,yy=zz*xx-zx*xz,yz=-zy*xx;
  m[0]=xx;m[1]=yx;m[2]=zx;m[3]=0;m[4]=0;m[5]=yy;m[6]=zy;m[7]=0;m[8]=xz;m[9]=yz;m[10]=zz;m[11]=0;
  m[12]=-xx*ex-xz*ez;m[13]=-yx*ex-yy*ey-yz*ez;m[14]=-zx*ex-zy*ey-zz*ez;m[15]=1;
}
export class ChaseCamera {
  constructor(distance=8.8,lookAhead=4,height=4.3,fov=1.02){this.distance=distance;this.lookAhead=lookAhead;this.height=height;this.fov=fov;this.projection=new Float32Array(16);this.view=new Float32Array(16);this.vp=new Float32Array(16);this.initialized=false;}
  reset(car){this.x=car.x;this.z=car.z;this.dx=Math.sin(car.a);this.dz=Math.cos(car.a);this.initialized=true;}
  update(car,dt,aspect){
    if(!this.initialized)this.reset(car);
    const speed=Math.hypot(car.vx,car.vz),mix=Math.min(.35,speed/100);
    let dx=Math.sin(car.a)*(1-mix)+car.vx/(speed||1)*mix,dz=Math.cos(car.a)*(1-mix)+car.vz/(speed||1)*mix;
    const t=1-Math.exp(-dt*4.8),follow=1-Math.exp(-dt*8);
    this.dx+=(dx-this.dx)*t;this.dz+=(dz-this.dz)*t;const l=Math.hypot(this.dx,this.dz)||1;this.dx/=l;this.dz/=l;
    this.x+=(car.x-this.x)*follow;this.z+=(car.z-this.z)*follow;
    const distance=this.distance+Math.min(3.0,speed*.042),height=this.height+Math.min(.8,speed*.012);
    this.ex=this.x-this.dx*distance;this.ez=this.z-this.dz*distance;
    look(this.view,this.ex,height,this.ez,car.x+this.dx*this.lookAhead,.8,car.z+this.dz*this.lookAhead);
    perspective(this.projection,this.fov+Math.min(.1,speed*.001),aspect);multiply(this.vp,this.projection,this.view);return this.vp;
  }
}
export class Engine {
  constructor(canvas){
    this.c=canvas;const g=this.gl=canvas.getContext('webgl2',{antialias:false,alpha:false,powerPreference:'high-performance'});
    if(!g)throw Error('WebGL2 unavailable');
    this.prog=this.program(`#version 300 es
layout(location=0) in vec3 p;layout(location=1) in vec3 n;layout(location=2) in vec3 color;
uniform mat4 mvp;uniform mat4 model;out vec3 N;out vec3 C;out vec3 W;
void main(){gl_Position=mvp*vec4(p,1.);N=mat3(model)*n;C=color;W=(model*vec4(p,1.)).xyz;}`,`#version 300 es
precision mediump float;in vec3 N;in vec3 C;in vec3 W;uniform vec3 eye;out vec4 o;
void main(){float l=.42+.58*max(dot(normalize(N),normalize(vec3(-.35,.8,.25))),0.);vec3 col=C*l;float fog=smoothstep(110.,370.,distance(W,eye));o=vec4(mix(col,vec3(.52,.66,.76),fog),1.);}`);
    this.texProg=this.program(`#version 300 es
layout(location=0) in vec3 p;layout(location=1) in vec3 n;layout(location=2) in vec2 uv;
uniform mat4 mvp;uniform mat4 model;out vec3 N;out vec2 UV;out vec3 W;
void main(){gl_Position=mvp*vec4(p,1.);N=mat3(model)*n;UV=uv;W=(model*vec4(p,1.)).xyz;}`,`#version 300 es
precision highp float;
in vec3 N;in vec2 UV;in vec3 W;uniform vec3 eye;uniform vec3 baseColor;
uniform sampler2D albedo;uniform sampler2D detailMap;uniform sampler2D normalMap;uniform sampler2D emissiveMap;uniform sampler2D specularMap;uniform sampler2D environmentMap;uniform sampler2D maskMap;
uniform float useAlbedo;uniform float useDetail;uniform float useNormal;uniform float useEmissive;uniform float useSpecular;uniform float useEnvironment;uniform float useMask;
uniform float roughness;uniform float reflectivity;uniform float opacity;uniform float emissive;uniform float normalStrength;uniform float detailStrength;out vec4 o;
vec3 mappedNormal(vec3 baseN){
  if(useNormal<.5||normalStrength<=0.)return baseN;
  vec3 q1=dFdx(W),q2=dFdy(W);vec2 st1=dFdx(UV),st2=dFdy(UV);float det=st1.x*st2.y-st1.y*st2.x;
  if(abs(det)<1e-6)return baseN;vec3 T=normalize((q1*st2.y-q2*st1.y)/det);vec3 B=normalize((-q1*st2.x+q2*st1.x)/det);
  vec3 texN=texture(normalMap,UV).xyz*2.-1.;vec3 worldN=normalize(mat3(T,B,baseN)*texN);return normalize(mix(baseN,worldN,clamp(normalStrength,0.,1.)));
}
void main(){
  vec3 baseN=normalize(N),n=mappedNormal(baseN),V=normalize(eye-W),L=normalize(vec3(-.35,.8,.25));
  vec4 a=texture(albedo,UV);vec3 src=mix(baseColor,a.rgb,clamp(useAlbedo,0.,1.));
  if(useDetail>.5){vec3 d=texture(detailMap,UV).rgb;src*=mix(vec3(1.),mix(vec3(.65),d*1.35,.72),clamp(detailStrength,0.,1.));}
  float mask=useMask>.5?texture(maskMap,UV).a:1.;float alpha=opacity*mix(1.,a.a,clamp(useAlbedo,0.,1.))*mask;if(alpha<.025)discard;
  float ndl=max(dot(n,L),0.),diff=.32+.68*ndl,ndv=max(dot(n,V),0.);
  vec3 R=reflect(-V,n);float pi=3.14159265;vec2 euv=vec2(atan(R.z,R.x)/(2.*pi)+.5,asin(clamp(R.y,-1.,1.))/pi+.5);
  vec3 proceduralEnv=mix(vec3(.18,.25,.31),vec3(.72,.82,.91),clamp(R.y*.5+.5,0.,1.));vec3 env=useEnvironment>.5?texture(environmentMap,euv).rgb:proceduralEnv;
  float specMask=useSpecular>.5?texture(specularMap,UV).r:1.;float fres=pow(1.-ndv,5.);float refl=clamp(reflectivity*specMask*(.34+.66*fres)*(1.-roughness*.58),0.,.92);
  vec3 col=src*diff+env*refl;vec3 emit=useEmissive>.5?texture(emissiveMap,UV).rgb*emissive:src*emissive*.22;col+=emit;
  float fog=smoothstep(110.,370.,distance(W,eye));o=vec4(mix(col,vec3(.52,.66,.76),fog),alpha);
}`);
    this.u={mvp:g.getUniformLocation(this.prog,'mvp'),model:g.getUniformLocation(this.prog,'model'),eye:g.getUniformLocation(this.prog,'eye')};
    this.tu={mvp:g.getUniformLocation(this.texProg,'mvp'),model:g.getUniformLocation(this.texProg,'model'),eye:g.getUniformLocation(this.texProg,'eye'),baseColor:g.getUniformLocation(this.texProg,'baseColor')};
    for(const name of ['albedo','detailMap','normalMap','emissiveMap','specularMap','environmentMap','maskMap','useAlbedo','useDetail','useNormal','useEmissive','useSpecular','useEnvironment','useMask','roughness','reflectivity','opacity','emissive','normalStrength','detailStrength'])this.tu[name]=g.getUniformLocation(this.texProg,name);
    this.model=new Float32Array(16);this.mvp=new Float32Array(16);this.unit=identity(new Float32Array(16));this.textureCache=new Map();
    this.fallback={white:this.solidTexture(255,255,255,255),black:this.solidTexture(0,0,0,255),normal:this.solidTexture(128,128,255,255)};
    this.quality=1;this.frameEMA=16;this.qualityTimer=0;this.drawCalls=0;this.triangles=0;this.eyeX=0;this.eyeZ=0;
    g.enable(g.DEPTH_TEST);
  }
  shader(type,source){const g=this.gl,s=g.createShader(type);g.shaderSource(s,source);g.compileShader(s);if(!g.getShaderParameter(s,g.COMPILE_STATUS))throw Error(g.getShaderInfoLog(s));return s;}
  program(v,f){const g=this.gl,p=g.createProgram(),vs=this.shader(g.VERTEX_SHADER,v),fs=this.shader(g.FRAGMENT_SHADER,f);g.attachShader(p,vs);g.attachShader(p,fs);g.linkProgram(p);if(!g.getProgramParameter(p,g.LINK_STATUS))throw Error(g.getProgramInfoLog(p));g.deleteShader(vs);g.deleteShader(fs);return p;}
  solidTexture(r,gc,b,a){const g=this.gl,t=g.createTexture();g.bindTexture(g.TEXTURE_2D,t);g.texImage2D(g.TEXTURE_2D,0,g.RGBA,1,1,0,g.RGBA,g.UNSIGNED_BYTE,new Uint8Array([r,gc,b,a]));g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,g.LINEAR);return t;}
  mesh(geometry){
    const g=this.gl,vao=g.createVertexArray();g.bindVertexArray(vao);
    const arrays=[geometry.positions,geometry.normals,geometry.colors];
    for(let i=0;i<3;i++){const b=g.createBuffer();g.bindBuffer(g.ARRAY_BUFFER,b);g.bufferData(g.ARRAY_BUFFER,new Float32Array(arrays[i]),g.STATIC_DRAW);g.enableVertexAttribArray(i);g.vertexAttribPointer(i,3,g.FLOAT,false,0,0);}
    return {vao,count:geometry.vertexCount,type:'color'};
  }
  importedMesh(section){
    const g=this.gl,vao=g.createVertexArray();g.bindVertexArray(vao);
    const attrs=[[section.positions,3],[section.normals,3],[section.uvs,2]];
    for(let i=0;i<3;i++){const b=g.createBuffer();g.bindBuffer(g.ARRAY_BUFFER,b);g.bufferData(g.ARRAY_BUFFER,new Float32Array(attrs[i][0]),g.STATIC_DRAW);g.enableVertexAttribArray(i);g.vertexAttribPointer(i,attrs[i][1],g.FLOAT,false,0,0);}
    return {vao,count:section.positions.length/3,type:'textured',color:section.color||[.72,.74,.78],surface:section.surface||'detail',params:{roughness:.55,reflectivity:.14,opacity:1,emissive:0,normalStrength:0,detailStrength:.2,...(section.params||{})},textureURLs:{...(section.textureURLs||{})},textures:{}};
  }
  async texture(url){
    if(!url)return null;if(this.textureCache.has(url))return this.textureCache.get(url);
    const promise=(async()=>{const r=await fetch(url);if(!r.ok)throw Error(`Texture ${r.status}: ${url}`);const image=await createImageBitmap(await r.blob()),g=this.gl,t=g.createTexture();g.bindTexture(g.TEXTURE_2D,t);g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL,false);g.texImage2D(g.TEXTURE_2D,0,g.RGBA,g.RGBA,g.UNSIGNED_BYTE,image);g.generateMipmap(g.TEXTURE_2D);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.LINEAR_MIPMAP_LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,g.LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,g.REPEAT);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,g.REPEAT);image.close?.();return t;})().catch(error=>{console.warn(error);return null;});
    this.textureCache.set(url,promise);return promise;
  }
  async prepareImportedMesh(section){const mesh=this.importedMesh(section);for(const [role,url] of Object.entries(mesh.textureURLs))mesh.textures[role]=await this.texture(url);return mesh;}
  resize(){const d=Math.min(window.devicePixelRatio||1,1.5)*this.quality;const w=Math.max(1,Math.round(this.c.clientWidth*d)),h=Math.max(2,Math.round(this.c.clientHeight*d));if(this.c.width!==w||this.c.height!==h){this.c.width=w;this.c.height=h;}}
  adapt(frameMs,dt){this.frameEMA+=(Math.min(frameMs,100)-this.frameEMA)*.025;this.qualityTimer+=dt;if(this.qualityTimer<3)return;this.qualityTimer=0;if(this.frameEMA>24)this.quality=Math.max(.55,this.quality-.1);else if(this.frameEMA<17.5)this.quality=Math.min(1,this.quality+.05);}
  clear(preview=false){const g=this.gl;this.resize();g.disable(g.SCISSOR_TEST);if(preview)g.clearColor(.12,.18,.25,1);else g.clearColor(.52,.66,.76,1);g.clear(g.COLOR_BUFFER_BIT|g.DEPTH_BUFFER_BIT);this.drawCalls=0;this.triangles=0;}
  viewport(x,y,w,h,ex,ez){const g=this.gl;this.eyeX=ex;this.eyeZ=ez;g.viewport(x,y,w,h);g.scissor(x,y,w,h);g.enable(g.SCISSOR_TEST);}
  draw(mesh,vp,model=this.unit){const g=this.gl;g.disable(g.BLEND);g.depthMask(true);g.useProgram(this.prog);multiply(this.mvp,vp,model);g.uniformMatrix4fv(this.u.mvp,false,this.mvp);g.uniformMatrix4fv(this.u.model,false,model);g.uniform3f(this.u.eye,this.eyeX,4.5,this.eyeZ);g.bindVertexArray(mesh.vao);g.drawArrays(g.TRIANGLES,0,mesh.count);this.drawCalls++;this.triangles+=mesh.count/3;}
  drawImported(mesh,vp,model=this.unit){
    const g=this.gl,t=mesh.textures||{},p=mesh.params||{};g.useProgram(this.texProg);multiply(this.mvp,vp,model);g.uniformMatrix4fv(this.tu.mvp,false,this.mvp);g.uniformMatrix4fv(this.tu.model,false,model);g.uniform3f(this.tu.eye,this.eyeX,4.5,this.eyeZ);g.uniform3fv(this.tu.baseColor,mesh.color);
    const bindings=[['albedo',t.albedo,this.fallback.white],['detailMap',t.detail,this.fallback.white],['normalMap',t.normal,this.fallback.normal],['emissiveMap',t.emissive,this.fallback.black],['specularMap',t.specular,this.fallback.white],['environmentMap',t.environment,this.fallback.black],['maskMap',t.mask,this.fallback.white]];
    for(let i=0;i<bindings.length;i++){const [uniform,tex,fallback]=bindings[i];g.activeTexture(g.TEXTURE0+i);g.bindTexture(g.TEXTURE_2D,tex||fallback);g.uniform1i(this.tu[uniform],i);}
    g.uniform1f(this.tu.useAlbedo,t.albedo?1:0);g.uniform1f(this.tu.useDetail,t.detail?1:0);g.uniform1f(this.tu.useNormal,t.normal?1:0);g.uniform1f(this.tu.useEmissive,t.emissive?1:0);g.uniform1f(this.tu.useSpecular,t.specular?1:0);g.uniform1f(this.tu.useEnvironment,t.environment?1:0);g.uniform1f(this.tu.useMask,t.mask?1:0);
    g.uniform1f(this.tu.roughness,Number(p.roughness??.55));g.uniform1f(this.tu.reflectivity,Number(p.reflectivity??.14));g.uniform1f(this.tu.opacity,Number(p.opacity??1));g.uniform1f(this.tu.emissive,Number(p.emissive??0));g.uniform1f(this.tu.normalStrength,Number(p.normalStrength??0));g.uniform1f(this.tu.detailStrength,Number(p.detailStrength??.2));
    const translucent=mesh.surface==='glass'||Number(p.opacity??1)<.995;if(translucent){g.enable(g.BLEND);g.blendFunc(g.SRC_ALPHA,g.ONE_MINUS_SRC_ALPHA);g.depthMask(false);}else{g.disable(g.BLEND);g.depthMask(true);}
    g.bindVertexArray(mesh.vao);g.drawArrays(g.TRIANGLES,0,mesh.count);g.depthMask(true);this.drawCalls++;this.triangles+=mesh.count/3;
  }
}
