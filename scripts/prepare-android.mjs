import {existsSync,readFileSync,writeFileSync} from 'node:fs';import {spawnSync} from 'node:child_process';
function cap(...args){const result=spawnSync(process.platform==='win32'?'npx.cmd':'npx',['cap',...args],{stdio:'inherit'});if(result.status)process.exit(result.status);}
if(!existsSync('android'))cap('add','android');cap('sync','android');
const manifest='android/app/src/main/AndroidManifest.xml';let xml=readFileSync(manifest,'utf8');xml=xml.replace(/\s*android:screenOrientation="[^"]*"/g,'');xml=xml.replace('android:name=".MainActivity"','android:name=".MainActivity" android:screenOrientation="sensorLandscape"');writeFileSync(manifest,xml);
const gradle='android/app/build.gradle';let config=readFileSync(gradle,'utf8');config=config.replace(/versionCode\s+\d+/,'versionCode 130').replace(/versionName\s+"[^"]+"/,'versionName "1.3.0"');writeFileSync(gradle,config);
console.log('Android prepared: com.marocto.racing, v1.3.0 (130), sensorLandscape');
