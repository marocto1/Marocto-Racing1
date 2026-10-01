import {_electron as electron} from '@playwright/test';import assert from 'node:assert/strict';import {mkdirSync} from 'node:fs';import path from 'node:path';
const packaged=process.env.RACING_PACKAGED_EXE;
const app=await electron.launch({...(packaged?{executablePath:path.resolve(packaged),args:[]}:{args:['desktop/main.cjs']}),env:{...process.env,RACING_CI:'1'},timeout:60000});
try{
 const page=await app.firstWindow(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.locator('#start').waitFor({state:'visible'});await page.waitForFunction(()=>window.MR&&document.querySelector('#start').disabled===false,null,{timeout:30000});
 assert.equal(await page.evaluate(()=>document.body.dataset.platform),'pc');assert.equal(await page.evaluate(()=>typeof require),'undefined');
 assert.equal(await page.evaluate(()=>Boolean(window.racingDesktop)),true);assert.equal(await page.evaluate(()=>MR.getDiagnostics().layout),'vertical');
 await page.locator('#start').click();await page.locator('#racebtn').click();await page.evaluate(()=>MR.debug.skipCountdown());
 await page.keyboard.down('KeyW');await page.keyboard.down('ArrowUp');await page.waitForTimeout(450);await page.keyboard.down('KeyA');await page.keyboard.down('ArrowRight');await page.waitForTimeout(200);
 const d=await page.evaluate(()=>MR.getDiagnostics());assert.ok(d.vehicles[0].steer>0&&d.vehicles[1].steer<0,'Real PC left/right steering');assert.ok(d.vehicles.every(v=>Math.hypot(v.vx,v.vz)>1));
 for(const k of ['KeyW','ArrowUp','KeyA','ArrowRight'])await page.keyboard.up(k);
 await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>MR.getDiagnostics().running),false);await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>MR.getDiagnostics().running),true);
 await page.keyboard.press('F11');assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isFullScreen()),true);await page.keyboard.press('F11');
 mkdirSync('test-results/desktop',{recursive:true});await page.screenshot({path:'test-results/desktop/pc-race.png'});assert.deepEqual(errors,[]);
 console.log('Desktop smoke passed: '+(packaged?'packaged Windows EXE':'Electron app')+' — actual WebGL2 race, both keyboards, steering, pause and fullscreen.');
}catch(error){console.error(error);process.exitCode=1;}finally{await app.close();}
