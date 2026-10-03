const upper=v=>String(v||'').toUpperCase();
const has=(s,...words)=>words.some(w=>s.includes(w));
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const round=v=>Math.round(v*1000)/1000;

export function classifySamplerRole(texture={}){
  const n=upper(texture.samplerName);
  const type=Number(texture.samplerType||0),sampler=Number(texture.sampler||0);
  if(has(n,'SHADOW'))return 'shadow';
  if(type===14||has(n,'CUBE','ENV','REFLECT','REFL','CHROME'))return 'environment';
  if(has(n,'NORMAL','NORM','BUMP'))return 'normal';
  if(has(n,'EMISS','GLOW','HEADLIGHT','TAILLIGHT','BRAKELIGHT','LAMP','LIGHTMAP'))return 'emissive';
  if(has(n,'SPECULAR','SPEC'))return 'specular';
  if(has(n,'MASK','ALPHA','OPACITY'))return 'mask';
  if(has(n,'TIRE','TYRE','RUBBER'))return 'rubber';
  if(has(n,'BADGE','EMBLEM','LOGO','DECAL','VINYL','DETAIL','OVERLAY'))return 'detail';
  if(has(n,'DIFFUSE','ALBEDO','BASE','COLOR','COLOUR','TEXTURE','MAP'))return 'albedo';
  return sampler===0?'albedo':'detail';
}

export function textureStatistics(rgba){
  if(!rgba||!rgba.length||rgba.length%4)return {alphaMean:1,alphaCoverage:0,lumaMean:.5,lumaVariance:0};
  const pixels=rgba.length/4;let alpha=0,coverage=0,luma=0,luma2=0;
  for(let i=0;i<rgba.length;i+=4){
    const a=rgba[i+3]/255,lum=(rgba[i]*.2126+rgba[i+1]*.7152+rgba[i+2]*.0722)/255;
    alpha+=a;if(a<.98)coverage++;luma+=lum;luma2+=lum*lum;
  }
  const am=alpha/pixels,lm=luma/pixels;
  return {alphaMean:round(am),alphaCoverage:round(coverage/pixels),lumaMean:round(lm),lumaVariance:round(Math.max(0,luma2/pixels-lm*lm))};
}

function names(textures){return upper(textures.map(t=>t.samplerName||'').join(' '));}
export function inferMaterialSurface(textures=[],meshRole='body'){
  const n=names(textures),roles=new Set(textures.map(t=>t.role||classifySamplerRole(t)));
  if(has(n,'GLASS','WINDOW','WINDSHIELD','WINDSCREEN'))return 'glass';
  if(has(n,'HEADLIGHT','TAILLIGHT','BRAKELIGHT','LAMP')||roles.has('emissive'))return 'light';
  if(has(n,'TIRE','TYRE','RUBBER')||roles.has('rubber'))return 'rubber';
  if(has(n,'BADGE','EMBLEM','LOGO','DECAL','VINYL'))return 'detail';
  if(has(n,'CHROME','METAL','RIM','WHEEL'))return 'metal';
  const albedo=textures.find(t=>(t.role||classifySamplerRole(t))==='albedo');
  if(albedo?.stats&&Number(albedo.stats.alphaCoverage)>.45&&Number(albedo.stats.alphaMean)<.72)return 'glass';
  if(meshRole==='wheel')return 'wheel';
  if(roles.has('environment')||roles.has('specular'))return 'paint';
  return meshRole==='body'?'paint':'detail';
}

export function materialParameters(surface,textures=[]){
  const roles=new Set(textures.map(t=>t.role||classifySamplerRole(t))),hasEnv=roles.has('environment'),hasNormal=roles.has('normal'),hasEmissive=roles.has('emissive');
  const presets={
    paint:{roughness:.34,reflectivity:hasEnv ? .46 : .30,opacity:1,emissive:0,normalStrength:hasNormal ? .72 : 0,detailStrength:.28},
    glass:{roughness:.10,reflectivity:.68,opacity:.38,emissive:0,normalStrength:0,detailStrength:.08},
    light:{roughness:.18,reflectivity:.34,opacity:1,emissive:hasEmissive ? 1.6 : .75,normalStrength:hasNormal ? .35 : 0,detailStrength:.18},
    rubber:{roughness:.92,reflectivity:.035,opacity:1,emissive:0,normalStrength:hasNormal ? .75 : .18,detailStrength:.18},
    metal:{roughness:.24,reflectivity:.72,opacity:1,emissive:0,normalStrength:hasNormal ? .5 : 0,detailStrength:.16},
    wheel:{roughness:.48,reflectivity:.34,opacity:1,emissive:0,normalStrength:hasNormal ? .45 : .12,detailStrength:.14},
    detail:{roughness:.55,reflectivity:.14,opacity:1,emissive:hasEmissive ? .6 : 0,normalStrength:hasNormal ? .45 : 0,detailStrength:.38}
  };
  const p={...(presets[surface]||presets.detail)};
  const albedo=textures.find(t=>(t.role||classifySamplerRole(t))==='albedo');
  if(surface==='glass'&&albedo?.stats?.alphaMean!=null)p.opacity=round(clamp(Number(albedo.stats.alphaMean),.18,.68));
  return p;
}

export function buildMaterialMaps(textures=[]){
  const maps={};
  const priority={albedo:0,detail:1,normal:2,emissive:3,specular:4,environment:5,mask:6,rubber:7,shadow:8};
  for(const t of [...textures].sort((a,b)=>(priority[a.role]??99)-(priority[b.role]??99)||Number(a.sampler||0)-Number(b.sampler||0))){
    const role=t.role||classifySamplerRole(t);if(t.texture&&!maps[role])maps[role]=t.texture;
  }
  return maps;
}
