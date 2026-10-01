import {readdirSync,readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
for(const name of readdirSync('www').filter(n=>n.endsWith('.js'))){const r=spawnSync(process.execPath,['--check',`www/${name}`],{stdio:'inherit'});if(r.status)process.exit(r.status);const source=readFileSync(`www/${name}`,'utf8');for(const match of source.matchAll(/from\s*['"](.+?)['"]/g))if(match[1].startsWith('.'))readFileSync(new URL(match[1],new URL(`../www/${name}`,import.meta.url)));}
console.log('All web modules: syntax and local imports OK');
