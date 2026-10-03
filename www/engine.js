// Existing native WebGL2 renderer, extended with colored procedural meshes,
// imported textured meshes, reusable matrices, fog and chase cameras.
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
precision mediump float;in vec3 N;in vec2 UV;in vec3 W;uniform vec3 eye;uniform vec3 baseColor;uniform sampler2D albedo;uniform float useTexture;out vec4 o;
void main(){float l=.42+.58*max(dot(normalize(N),normalize(vec3(-.35,.8,.25))),0.);vec4 tex=texture(albedo,UV);vec3 src=mix(baseColor,tex.rgb,clamp(useTexture,0.,1.));float alpha=mix(1.,tex.a,clamp(useTexture,0.,1.));float fog=smoothstep(110.,370.,distance(W,eye));o=vec4(mix(src*l,vec3(.52,.66,.76),fog),alpha);}`);
    this.u={mvp:g.getUniformLocation(this.prog,'mvp'),model:g.getUniformLocation(this.prog,'model'),eye:g.getUniformLocation(this.prog,'eye')};
    this.tu={mvp:g.getUniformLocation(this.texProg,'mvp'),model:g.getUniformLocation(this.texProg,'model'),eye:g.getUniformLocation(this.texProg,'eye'),baseColor:g.getUniformLocation(this.texProg,'baseColor'),albedo:g.getUniformLocation(this.texProg,'albedo'),useTexture:g.getUniformLocation(this.texProg,'useTexture')};
    this.model=new Float32Array(16);this.mvp=new Float32Array(16);this.unit=identity(new Float32Array(16));this.textureCache=new Map();
    this.quality=1;this.frameEMA=16;this.qualityTimer=0;this.drawCalls=0;this.triangles=0;this.eyeX=0;this.eyeZ=0;
    g.enable(g.DEPTH_TEST);
  }
  shader(type,source){const g=this.gl,s=g.createShader(type);g.shaderSource(s,source);g.compileShader(s);if(!g.getShaderParameter(s,g.COMPILE_STATUS))throw Error(g.getShaderInfoLog(s));return s;}
  program(v,f){const g=this.gl,p=g.createProgram(),vs=this.shader(g.VERTEX_SHADER,v),fs=this.shader(g.FRAGMENT_SHADER,f);g.attachShader(p,vs);g.attachShader(p,fs);g.linkProgram(p);if(!g.getProgramParameter(p,g.LINK_STATUS))throw Error(g.getProgramInfoLog(p));g.deleteShader(vs);g.deleteShader(fs);return p;}
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
    return {vao,count:section.positions.length/3,type:'textured',color:section.color||[.72,.74,.78],texture:null,textureURL:section.textureURL||null};
  }
  async texture(url){
    if(!url)return null;if(this.textureCache.has(url))return this.textureCache.get(url);
    const promise=(async()=>{const r=await fetch(url);if(!r.ok)throw Error(`Texture ${r.status}: ${url}`);const image=await createImageBitmap(await r.blob()),g=this.gl,t=g.createTexture();g.bindTexture(g.TEXTURE_2D,t);g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL,false);g.texImage2D(g.TEXTURE_2D,0,g.RGBA,g.RGBA,g.UNSIGNED_BYTE,image);g.generateMipmap(g.TEXTURE_2D);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.LINEAR_MIPMAP_LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,g.LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,g.REPEAT);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,g.REPEAT);image.close?.();return t;})().catch(error=>{console.warn(error);return null;});
    this.textureCache.set(url,promise);return promise;
  }
  async prepareImportedMesh(section){const mesh=this.importedMesh(section);if(mesh.textureURL)mesh.texture=await this.texture(mesh.textureURL);return mesh;}
  resize(){const d=Math.min(window.devicePixelRatio||1,1.5)*this.quality;const w=Math.max(1,Math.round(this.c.clientWidth*d)),h=Math.max(2,Math.round(this.c.clientHeight*d));if(this.c.width!==w||this.c.height!==h){this.c.width=w;this.c.height=h;}}
  adapt(frameMs,dt){this.frameEMA+=(Math.min(frameMs,100)-this.frameEMA)*.025;this.qualityTimer+=dt;if(this.qualityTimer<3)return;this.qualityTimer=0;if(this.frameEMA>24)this.quality=Math.max(.55,this.quality-.1);else if(this.frameEMA<17.5)this.quality=Math.min(1,this.quality+.05);}
  clear(preview=false){const g=this.gl;this.resize();g.disable(g.SCISSOR_TEST);if(preview)g.clearColor(.12,.18,.25,1);else g.clearColor(.52,.66,.76,1);g.clear(g.COLOR_BUFFER_BIT|g.DEPTH_BUFFER_BIT);this.drawCalls=0;this.triangles=0;}
  viewport(x,y,w,h,ex,ez){const g=this.gl;this.eyeX=ex;this.eyeZ=ez;g.viewport(x,y,w,h);g.scissor(x,y,w,h);g.enable(g.SCISSOR_TEST);}
  draw(mesh,vp,model=this.unit){const g=this.gl;g.useProgram(this.prog);multiply(this.mvp,vp,model);g.uniformMatrix4fv(this.u.mvp,false,this.mvp);g.uniformMatrix4fv(this.u.model,false,model);g.uniform3f(this.u.eye,this.eyeX,4.5,this.eyeZ);g.bindVertexArray(mesh.vao);g.drawArrays(g.TRIANGLES,0,mesh.count);this.drawCalls++;this.triangles+=mesh.count/3;}
  drawImported(mesh,vp,model=this.unit){const g=this.gl;g.useProgram(this.texProg);multiply(this.mvp,vp,model);g.uniformMatrix4fv(this.tu.mvp,false,this.mvp);g.uniformMatrix4fv(this.tu.model,false,model);g.uniform3f(this.tu.eye,this.eyeX,4.5,this.eyeZ);g.uniform3fv(this.tu.baseColor,mesh.color);g.activeTexture(g.TEXTURE0);g.bindTexture(g.TEXTURE_2D,mesh.texture);g.uniform1i(this.tu.albedo,0);g.uniform1f(this.tu.useTexture,mesh.texture?1:0);g.bindVertexArray(mesh.vao);g.drawArrays(g.TRIANGLES,0,mesh.count);this.drawCalls++;this.triangles+=mesh.count/3;}
}
