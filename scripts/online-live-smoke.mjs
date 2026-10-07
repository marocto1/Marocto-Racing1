import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.PORT='8799';
process.env.HOST='127.0.0.1';
process.env.MR_DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'marocto-online-smoke-'));

const {start}=await import('../server/index.mjs');
const server=start();

function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
class Client{
  constructor(){this.messages=[];this.waiters=[];}
  async open(){
    this.ws=new WebSocket('ws://127.0.0.1:8799/ws');
    await new Promise((resolve,reject)=>{this.ws.onopen=resolve;this.ws.onerror=reject;});
    this.ws.onmessage=e=>{const m=JSON.parse(e.data);this.messages.push(m);for(const w of [...this.waiters])if(w.type===m.type){this.waiters.splice(this.waiters.indexOf(w),1);w.resolve(m);}};
    await sleep(20);
  }
  send(type,data={}){this.ws.send(JSON.stringify({type,...data}));}
  wait(type,timeout=3000){
    const cached=this.messages.find(m=>m.type===type);if(cached)return Promise.resolve(cached);
    return new Promise((resolve,reject)=>{const w={type,resolve};this.waiters.push(w);setTimeout(()=>{const i=this.waiters.indexOf(w);if(i>=0)this.waiters.splice(i,1);reject(Error('timeout '+type));},timeout);});
  }
  close(){try{this.ws.close();}catch{}}
}

const a=new Client(),b=new Client();
try{
  await a.open();await b.open();
  a.send('auth.guest',{nickname:'SmokeHost'});const authA=await a.wait('auth.ok');
  b.send('auth.guest',{nickname:'SmokeGuest'});const authB=await b.wait('auth.ok');
  assert.notEqual(authA.profile.id,authB.profile.id);

  a.send('room.create',{name:'Smoke Room',maxPlayers:2,mode:'CIRCUIT',laps:2});
  const created=await a.wait('room.state'),roomId=created.room.id;
  b.send('room.join',{roomId});
  await b.wait('room.state');
  a.send('room.car',{carIndex:3});
  const carState=await a.wait('room.state');
  assert.equal(carState.room.players.find(p=>p.id===authA.profile.id).carIndex,3);
  b.send('room.ready',{ready:true});
  await a.wait('room.state');
  a.send('room.start');
  const startA=await a.wait('race.start'),startB=await b.wait('race.start');
  assert.equal(startA.room.id,roomId);assert.equal(startB.room.id,roomId);

  a.send('race.state',{state:{seq:1,x:12.5,z:-8,a:.4,vx:20,vz:2,steerAngle:.15,wheelSpin:4,carIndex:2,lap:0,next:1}});
  const state=await b.wait('race.state');
  assert.equal(state.playerId,authA.profile.id);
  assert.equal(state.state.x,12.5);assert.equal(state.state.carIndex,2);
  console.log('ONLINE_LIVE_SMOKE_PASS');
}finally{
  a.close();b.close();
  await sleep(30);
  await new Promise(r=>server.close(r));
}
