// Use the npm-bundled Chromium so CI does not need a separate browser download.
// Extract without archive ownership changes (also works in managed containers).
import {createReadStream,createWriteStream,existsSync,mkdirSync,chmodSync,statSync,unlinkSync} from 'node:fs';
import {createBrotliDecompress} from 'node:zlib';import {pipeline} from 'node:stream/promises';import {spawnSync} from 'node:child_process';import {resolve,dirname} from 'node:path';import {createRequire} from 'node:module';
export async function browserPath(){
  if(process.env.RACING_BROWSER_PATH)return process.env.RACING_BROWSER_PATH;
  const require=createRequire(import.meta.url),pkg=dirname(dirname(require.resolve('@sparticuz/chromium'))),out=resolve('.cache-browser');mkdirSync(out,{recursive:true});
  const executable=resolve(out,'chromium');if(!existsSync(executable)||statSync(executable).size<1000000){if(existsSync(executable))unlinkSync(executable);await pipeline(createReadStream(resolve(pkg,'bin/chromium.br')),createBrotliDecompress(),createWriteStream(executable));chmodSync(executable,0o755);}
  for(const name of ['swiftshader','fonts']){const dest=resolve(out,name==='fonts'?'fonts':'.');mkdirSync(dest,{recursive:true});const marker=resolve(dest,name==='fonts'?'OpenSans-Regular.ttf':'libEGL.so');if(existsSync(marker))continue;const archive=resolve(out,`${name}.tar`);await pipeline(createReadStream(resolve(pkg,`bin/${name}.tar.br`)),createBrotliDecompress(),createWriteStream(archive));const r=spawnSync('tar',['--no-same-owner','-xf',archive,'-C',dest],{stdio:'inherit'});if(r.status)throw Error('Browser extraction failed');unlinkSync(archive);}
  return executable;
}
export const browserArgs=['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'];
if(process.argv[1]===new URL(import.meta.url).pathname)console.log(await browserPath());
