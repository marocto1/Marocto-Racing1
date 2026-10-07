import fs from 'node:fs';
import path from 'node:path';
import {parseGLB,normalizeGLBSections,HD_CAR_MANIFEST} from '../www/glb-car-models.js';
import {CAR_SPECS} from '../www/cars.js';

let totalTriangles=0;
for(let i=0;i<HD_CAR_MANIFEST.length;i++){
  const entry=HD_CAR_MANIFEST[i],file=path.join('www',entry.file);
  if(!fs.existsSync(file))throw Error('Missing HD model: '+file);
  const b=fs.readFileSync(file),ab=b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
  const parsed=parseGLB(ab,{label:entry.id,baseUrl:'https://example.invalid/'+entry.id+'.glb'});
  const normalized=normalizeGLBSections(parsed.sections,CAR_SPECS[i],entry);
  const vertices=normalized.sections.reduce((n,s)=>n+s.positions.length/3,0),triangles=vertices/3;
  if(triangles<8000)throw Error(`HD model ${entry.id} is too simple: ${triangles} triangles`);
  if(!Number.isFinite(normalized.dimensions.length)||normalized.dimensions.length<3)throw Error('Bad normalized dimensions: '+entry.id);
  console.log(`${entry.id}: ${Math.round(triangles)} triangles, ${parsed.sections.length} sections, ${b.length} bytes`);
  totalTriangles+=triangles;
}
if(totalTriangles<100000)throw Error('HD fleet triangle budget unexpectedly low: '+totalTriangles);
console.log('HD_CARS_VERIFY_PASS total triangles',Math.round(totalTriangles));
