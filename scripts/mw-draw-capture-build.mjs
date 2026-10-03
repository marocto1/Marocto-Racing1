#!/usr/bin/env node
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {buildNativeCapture,summarizeRawDrawStream} from './mw-draw-capture-lib.mjs';

function parseArgs(argv){
  const out={};for(let i=0;i<argv.length;i++){const a=argv[i];if(a.startsWith('--')){const k=a.slice(2),v=argv[i+1]&&!argv[i+1].startsWith('--')?argv[++i]:true;out[k]=v;}else if(!out.input)out.input=a;else if(!out.output)out.output=a;}return out;
}
const a=parseArgs(process.argv.slice(2));
if(!a.input){
  console.error('Usage: node scripts/mw-draw-capture-build.mjs <raw-draws.json> [capture.json] [--frame N] [--tag text] [--shader id] [--min-triangles N] [--summary]');
  process.exit(2);
}
const input=resolve(a.input),raw=readFileSync(input,'utf8');
if(a.summary===true){console.log(JSON.stringify(summarizeRawDrawStream(raw),null,2));process.exit(0);}
const output=resolve(a.output||'capture.json');
const capture=buildNativeCapture(raw,{frame:a.frame??null,tag:a.tag??null,shader:a.shader??null,minTriangles:Number(a['min-triangles']||1)});
mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(capture,null,2)+'\n');
console.log(`MW2005 Native Capture written: ${output}`);
console.log(`draws=${capture.metadata.selectedDraws} triangles=${capture.metadata.triangles} bodySections=${capture.body.length} wheelSections=${capture.wheel?.meshes?.length||0}`);
