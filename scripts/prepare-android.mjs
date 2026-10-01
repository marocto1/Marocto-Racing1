import {existsSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';import {spawnSync} from 'node:child_process';
const {version}=JSON.parse(readFileSync('package.json','utf8'));const [major,minor,patch]=version.split('.').map(Number);const versionCode=major*10000+minor*100+patch;
function cap(...args){const result=spawnSync(process.platform==='win32'?'npx.cmd':'npx',['cap',...args],{stdio:'inherit'});if(result.status)process.exit(result.status);}
// This is an intentionally public debug credential, never a production signing key.
mkdirSync('.racing-signing',{recursive:true});
if(!existsSync('.racing-signing/debug.keystore')){
  const result=spawnSync('keytool',['-genkeypair','-keystore','.racing-signing/debug.keystore','-storepass','android','-keypass','android','-alias','androiddebugkey','-keyalg','RSA','-keysize','2048','-validity','10000','-dname','CN=Android Debug,O=Android,C=US'],{stdio:'inherit'});
  if(result.status)process.exit(result.status);
}
if(!existsSync('android'))cap('add','android');cap('sync','android');
const manifest='android/app/src/main/AndroidManifest.xml';let xml=readFileSync(manifest,'utf8');xml=xml.replace(/\s*android:screenOrientation="[^"]*"/g,'');xml=xml.replace('android:name=".MainActivity"','android:name=".MainActivity" android:screenOrientation="sensorLandscape"');writeFileSync(manifest,xml);
const gradle='android/app/build.gradle';let config=readFileSync(gradle,'utf8');config=config.replace(/versionCode\s+\d+/,`versionCode ${versionCode}`).replace(/versionName\s+"[^"]+"/,`versionName "${version}"`);if(!config.includes('// Marocto persistent debug signing'))config=config.replace('    buildTypes {',`    // Marocto persistent debug signing
    signingConfigs {
        debug {
            storeFile rootProject.file('../.racing-signing/debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {`);writeFileSync(gradle,config);
console.log(`Android prepared: com.marocto.racing, v${version} (${versionCode}), sensorLandscape`);
