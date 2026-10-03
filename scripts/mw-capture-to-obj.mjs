import fs from 'node:fs/promises';
import path from 'node:path';
import {parseNativeCapture} from '../www/mw-native-capture.js';

const [input,output]=process.argv.slice(2);if(!input||!output){console.error('Usage: node scripts/mw-capture-to-obj.mjs <capture.json> <output-folder>');process.exit(2);}
const capture=parseNativeCapture(await fs.readFile(input,'utf8'));await fs.mkdir(output,{recursive:true});
const safe=s=>String(s||'default').replace(/[^a-zA-Z0-9_.-]/g,'_');
function objFor(sections,mtlName){let text=`mtllib ${mtlName}\n`,base=1;for(const section of sections){const name=safe(section.material);text+=`o ${name}\nusemtl ${name}\n`;for(let i=0;i<section.positions.length;i+=3)text+=`v ${section.positions[i]} ${section.positions[i+1]} ${section.positions[i+2]}\n`;for(let i=0;i<section.uvs.length;i+=2)text+=`vt ${section.uvs[i]} ${1-section.uvs[i+1]}\n`;for(let i=0;i<section.normals.length;i+=3)text+=`vn ${section.normals[i]} ${section.normals[i+1]} ${section.normals[i+2]}\n`;const count=section.positions.length/3;for(let i=0;i<count;i+=3){const a=base+i,b=a+1,c=a+2;text+=`f ${a}/${a}/${a} ${b}/${b}/${b} ${c}/${c}/${c}\n`;}base+=count;}return text;}
function mtlFor(sections){const seen=new Set();let text='';for(const section of sections){const name=safe(section.material);if(seen.has(name))continue;seen.add(name);const c=section.color||[.72,.74,.78];text+=`newmtl ${name}\nKd ${c[0]} ${c[1]} ${c[2]}\n`;if(section.texture)text+=`map_Kd ${section.texture}\n`;text+='\n';}return text;}
await fs.writeFile(path.join(output,'body.obj'),objFor(capture.body,'body.mtl'));await fs.writeFile(path.join(output,'body.mtl'),mtlFor(capture.body));if(capture.wheel?.length){await fs.writeFile(path.join(output,'wheel.obj'),objFor(capture.wheel,'wheel.mtl'));await fs.writeFile(path.join(output,'wheel.mtl'),mtlFor(capture.wheel));}
console.log(`Converted ${input} -> ${output}`);
console.log(`Body triangles: ${capture.body.reduce((n,s)=>n+s.positions.length/9,0)}`);if(capture.wheel)console.log(`Wheel triangles: ${capture.wheel.reduce((n,s)=>n+s.positions.length/9,0)}`);
