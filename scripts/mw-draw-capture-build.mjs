#!/usr/bin/env node
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve,relative,sep} from 'node:path';
import {buildNativeCapture,summarizeRawDrawStream,autoIsolateCarDraws} from './mw-draw-capture-lib.mjs';
import {encodePngRgba} from './mw-texture-png.mjs';
import {classifySamplerRole,textureStatistics} from './mw-material-classifier.mjs';

function parseArgs(argv){
  const out={};for(let i=0;i<argv.length;i++){const a=argv[i];if(a.startsWith('--')){const k=a.slice(2),v=argv[i+1]&&!argv[i+1].startsWith('--')?argv[++i]:true;out[k]=v;}else if(!out.input)out.input=a;else if(!out.output)out.output=a;}return out;
}
function inside(base,target){const r=relative(base,target);return r!==''&&!r.startsWith(`..${sep}`)&&r!=='..'&&!resolve(target).startsWith(`${resolve(base)}${sep}..${sep}`);}
function rolePriority(role){return ({albedo:0,emissive:1,detail:2,specular:3,normal:4,mask:5,environment:6,rubber:7,shadow:8})[role]??20;}
function materializeTextures(rawDoc,inputPath,outputPath){
  const textures=Array.isArray(rawDoc.textures)?rawDoc.textures:[];if(!textures.length)return {written:0,bindings:0};
  const inputDir=dirname(inputPath),outputDir=dirname(outputPath),textureDir=resolve(outputDir,'textures');mkdirSync(textureDir,{recursive:true});
  const byMaterial=new Map();let written=0;
  for(let i=0;i<textures.length;i++){
    const t=textures[i];if(!t||typeof t!=='object')continue;
    t.role=classifySamplerRole(t);
    if(t.dataFile){
      const width=Number(t.width),height=Number(t.height);if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>8192||height>8192)throw Error(`texture ${i} has invalid dimensions`);
      const source=resolve(inputDir,String(t.dataFile));if(!inside(inputDir,source))throw Error(`texture ${i} dataFile escapes capture folder`);
      const rgba=readFileSync(source),expected=width*height*4;if(rgba.length!==expected)throw Error(`texture ${i} RGBA size mismatch: ${rgba.length} != ${expected}`);
      const safe=typeof t.id==='string'&&/^[A-Za-z0-9_.-]+$/.test(t.id)?t.id:`mwtex_${i}`;
      const rel=`textures/${safe}.png`,target=resolve(outputDir,rel);writeFileSync(target,encodePngRgba(width,height,rgba));
      t.id=safe;t.texture=rel;t.stats=textureStatistics(rgba);written++;
    }
    if(typeof t.materialKey==='string'&&t.texture){
      const old=byMaterial.get(t.materialKey),candidate={role:t.role,sampler:Number(t.sampler??0),texture:t.texture};
      if(!old||rolePriority(candidate.role)<rolePriority(old.role)||(candidate.role===old.role&&candidate.sampler<old.sampler))byMaterial.set(t.materialKey,candidate);
    }
  }
  if(Array.isArray(rawDoc.draws))for(const d of rawDoc.draws){const selected=typeof d?.materialKey==='string'?byMaterial.get(d.materialKey):null;if(selected)d.texture=selected.texture;}
  rawDoc.metadata={...(rawDoc.metadata||{}),phase:'models-phase7-full-materials',samplerBindings:textures.length,pixelTextures:written};
  return {written,bindings:textures.length};
}

const a=parseArgs(process.argv.slice(2));
if(!a.input){
  console.error('Usage: node scripts/mw-draw-capture-build.mjs <raw-draws.json> [capture.json] [--auto-car] [--frame N] [--tag text] [--shader id] [--object id] [--min-triangles N] [--summary]');
  process.exit(2);
}
const input=resolve(a.input),rawDoc=JSON.parse(readFileSync(input,'utf8'));
if(a.summary===true){console.log(JSON.stringify(summarizeRawDrawStream(rawDoc),null,2));process.exit(0);}
if(a['isolation-summary']===true){const isolated=autoIsolateCarDraws(rawDoc);console.log(JSON.stringify({metadata:isolated.metadata,summary:summarizeRawDrawStream({format:'marocto-mw-draw-stream',version:1,source:isolated.source,axes:isolated.axes,textures:isolated.textures,draws:isolated.draws})},null,2));process.exit(0);}
const output=resolve(a.output||'capture.json'),textureResult=materializeTextures(rawDoc,input,output);
const capture=buildNativeCapture(rawDoc,{frame:a.frame??null,tag:a.tag??null,shader:a.shader??null,object:a.object??null,minTriangles:Number(a['min-triangles']||1),autoCar:a['auto-car']===true});
mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(capture,null,2)+'\n');
console.log(`MW2005 Native Capture written: ${output}`);
console.log(`draws=${capture.metadata.selectedDraws} triangles=${capture.metadata.triangles} bodySections=${capture.body.length} wheelSections=${capture.wheel?.meshes?.length||0} uvDraws=${capture.metadata.uvDraws||0} normalDraws=${capture.metadata.normalDraws||0} samplerBindings=${textureResult.bindings} pngTextures=${textureResult.written}`);
