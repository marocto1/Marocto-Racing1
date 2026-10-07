import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {FileUserStore,RoomRegistry,cleanText,key,validNick} from './core.mjs';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const PORT=Number(process.env.PORT||8787);
const HOST=process.env.HOST||'0.0.0.0';
const DATA_DIR=process.env.MR_DATA_DIR||path.join(__dirname,'data');
const users=new FileUserStore(path.join(DATA_DIR,'users.json'));
const rooms=new RoomRegistry();
const clients=new Map();
const activeNames=new Map();

function frame(opcode,payload=Buffer.alloc(0)){
  payload=Buffer.isBuffer(payload)?payload:Buffer.from(payload);
  const n=payload.length;let head;
  if(n<126){head=Buffer.from([0x80|opcode,n]);}
  else if(n<65536){head=Buffer.alloc(4);head[0]=0x80|opcode;head[1]=126;head.writeUInt16BE(n,2);}
  else{head=Buffer.alloc(10);head[0]=0x80|opcode;head[1]=127;head.writeBigUInt64BE(BigInt(n),2);}
  return Buffer.concat([head,payload]);
}
function send(client,type,data={}){if(!client.socket.destroyed)client.socket.write(frame(1,JSON.stringify({type,...data})));}
function fail(client,code,message=code){send(client,'error',{code,message});}
function broadcastRoomList(){const list=rooms.list();for(const c of clients.values())if(c.profile)send(c,'room.list',{rooms:list});}
function broadcastRoom(roomId){
  const room=rooms.get(roomId);if(!room)return;
  const state=rooms.public(room);
  for(const p of room.players){const c=[...clients.values()].find(x=>x.profile?.id===p.id);if(c)send(c,'room.state',{room:state});}
}
function releaseIdentity(client){
  if(client.profile)activeNames.delete(key(client.profile.nickname));
  client.profile=null;
}
function leaveRoom(client){
  if(!client.roomId)return;
  const id=client.roomId;client.roomId=null;rooms.leave(id,client.profile?.id);
  broadcastRoom(id);broadcastRoomList();
}
function claimProfile(client,profile){
  const nickname=cleanText(profile.username||profile.nickname,18);
  const k=key(nickname);
  const existing=activeNames.get(k);
  if(existing&&existing!==client.id)throw Error('NICK_IN_USE');
  leaveRoom(client);releaseIdentity(client);
  client.profile={id:profile.id||crypto.randomUUID(),nickname,registered:Boolean(profile.registered)};
  activeNames.set(k,client.id);
  send(client,'auth.ok',{profile:client.profile});
  send(client,'room.list',{rooms:rooms.list()});
}
function requireAuth(client){if(!client.profile)throw Error('AUTH_REQUIRED');}
function finite(v,d=0){v=Number(v);return Number.isFinite(v)?v:d;}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function sanitizeRaceState(input={}){
  return {
    seq:Math.max(0,Math.trunc(finite(input.seq))),
    x:clamp(finite(input.x),-5000,5000),z:clamp(finite(input.z),-5000,5000),
    a:clamp(finite(input.a),-Math.PI*8,Math.PI*8),
    vx:clamp(finite(input.vx),-140,140),vz:clamp(finite(input.vz),-140,140),
    steerAngle:clamp(finite(input.steerAngle),-1.2,1.2),wheelSpin:clamp(finite(input.wheelSpin),-2500,2500),
    roll:clamp(finite(input.roll),-.9,.9),pitch:clamp(finite(input.pitch),-.9,.9),
    boost:Boolean(input.boost),carIndex:clamp(Math.trunc(finite(input.carIndex)),0,5),
    lap:clamp(Math.trunc(finite(input.lap)),0,99),next:clamp(Math.trunc(finite(input.next)),0,999)
  };
}
function racePeers(room,playerId){
  const ids=new Set(room.players.filter(p=>p.id!==playerId).map(p=>p.id));
  return [...clients.values()].filter(c=>c.profile&&ids.has(c.profile.id));
}
function handle(client,msg){
  if(!msg||typeof msg!=='object')return;
  try{
    switch(msg.type){
      case 'ping': send(client,'pong',{nonce:msg.nonce,serverTime:Date.now()});break;
      case 'auth.guest':{
        const nickname=cleanText(msg.nickname,18);
        if(!validNick(nickname))throw Error('USERNAME_INVALID');
        claimProfile(client,{id:crypto.randomUUID(),nickname,registered:false});break;
      }
      case 'auth.register': claimProfile(client,users.register(msg.username,msg.password));break;
      case 'auth.login': claimProfile(client,users.login(msg.username,msg.password));break;
      case 'auth.logout': leaveRoom(client);releaseIdentity(client);send(client,'auth.loggedOut');broadcastRoomList();break;
      case 'room.list': requireAuth(client);send(client,'room.list',{rooms:rooms.list()});break;
      case 'room.create':{
        requireAuth(client);if(client.roomId)leaveRoom(client);
        const room=rooms.create(client.profile,msg);client.roomId=room.id;
        send(client,'room.state',{room});broadcastRoomList();break;
      }
      case 'room.join':{
        requireAuth(client);if(client.roomId)leaveRoom(client);
        const room=rooms.join(msg.roomId,client.profile,msg.password||'');client.roomId=room.id;
        broadcastRoom(room.id);broadcastRoomList();break;
      }
      case 'room.leave': requireAuth(client);leaveRoom(client);send(client,'room.left');break;
      case 'room.ready':{
        requireAuth(client);if(!client.roomId)throw Error('NOT_IN_ROOM');
        const room=rooms.setReady(client.roomId,client.profile.id,msg.ready);
        broadcastRoom(room.id);break;
      }
      case 'room.update':{
        requireAuth(client);if(!client.roomId)throw Error('NOT_IN_ROOM');
        const room=rooms.update(client.roomId,client.profile.id,msg);
        broadcastRoom(room.id);broadcastRoomList();break;
      }
      case 'room.start':{
        requireAuth(client);if(!client.roomId)throw Error('NOT_IN_ROOM');
        const room=rooms.start(client.roomId,client.profile.id),startAt=Date.now()+3500;
        for(const p of room.players){
          const c=[...clients.values()].find(x=>x.profile?.id===p.id);
          if(c){c.lastRaceAt=0;c.lastRaceSeq=-1;c.lastRaceState=null;send(c,'race.start',{room,startAt});}
        }
        broadcastRoomList();break;
      }
      case 'race.state':{
        requireAuth(client);if(!client.roomId)throw Error('NOT_IN_ROOM');
        const room=rooms.get(client.roomId);if(!room||!room.started)throw Error('RACE_NOT_STARTED');
        const now=Date.now();if(client.lastRaceAt&&now-client.lastRaceAt<25)break;
        const state=sanitizeRaceState(msg.state||{});
        if(state.seq<=client.lastRaceSeq)break;
        if(client.lastRaceState&&client.lastRaceAt){
          const dt=Math.max(.025,(now-client.lastRaceAt)/1000);
          const dist=Math.hypot(state.x-client.lastRaceState.x,state.z-client.lastRaceState.z);
          const speed=Math.max(Math.hypot(state.vx,state.vz),Math.hypot(client.lastRaceState.vx,client.lastRaceState.vz));
          if(dist>12+Math.min(160,speed+25)*dt*2.5)throw Error('RACE_STATE_REJECTED');
        }
        client.lastRaceAt=now;client.lastRaceSeq=state.seq;client.lastRaceState=state;
        for(const peer of racePeers(room,client.profile.id))send(peer,'race.state',{playerId:client.profile.id,nickname:client.profile.nickname,state,serverTime:now});
        break;
      }
      default: fail(client,'UNKNOWN_MESSAGE');break;
    }
  }catch(error){fail(client,error.message||'SERVER_ERROR');}
}
function attachFrames(client){
  let buffer=Buffer.alloc(0);
  client.socket.on('data',chunk=>{
    buffer=Buffer.concat([buffer,chunk]);
    while(buffer.length>=2){
      const b0=buffer[0],b1=buffer[1],fin=Boolean(b0&0x80),opcode=b0&0x0f,masked=Boolean(b1&0x80);
      let len=b1&0x7f,off=2;
      if(!fin){client.socket.destroy();return;}
      if(len===126){if(buffer.length<4)return;len=buffer.readUInt16BE(2);off=4;}
      else if(len===127){if(buffer.length<10)return;const big=buffer.readBigUInt64BE(2);if(big>65536n){client.socket.destroy();return;}len=Number(big);off=10;}
      if(!masked){client.socket.destroy();return;}
      if(buffer.length<off+4+len)return;
      const mask=buffer.subarray(off,off+4);off+=4;
      const payload=Buffer.from(buffer.subarray(off,off+len));buffer=buffer.subarray(off+len);
      for(let i=0;i<payload.length;i++)payload[i]^=mask[i&3];
      if(opcode===8){client.socket.end(frame(8));return;}
      if(opcode===9){client.socket.write(frame(10,payload));continue;}
      if(opcode!==1)continue;
      try{handle(client,JSON.parse(payload.toString('utf8')));}catch{fail(client,'BAD_JSON');}
    }
  });
}
const server=http.createServer((req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*');
  if(req.url==='/health'){
    res.writeHead(200,{'content-type':'application/json'});
    res.end(JSON.stringify({ok:true,service:'marocto-racing-online',players:[...clients.values()].filter(c=>c.profile).length,rooms:rooms.list().length}));
    return;
  }
  res.writeHead(200,{'content-type':'application/json'});
  res.end(JSON.stringify({service:'Marocto Racing Online',ws:'/ws',version:1}));
});
server.on('upgrade',(req,socket)=>{
  if(req.url!=='/ws'||String(req.headers.upgrade).toLowerCase()!=='websocket'){socket.destroy();return;}
  const keyHeader=req.headers['sec-websocket-key'];if(!keyHeader){socket.destroy();return;}
  const accept=crypto.createHash('sha1').update(keyHeader+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n');
  const client={id:crypto.randomUUID(),socket,profile:null,roomId:null,lastRaceAt:0,lastRaceSeq:-1,lastRaceState:null};
  clients.set(client.id,client);attachFrames(client);send(client,'server.hello',{version:1});
  socket.on('close',()=>{leaveRoom(client);releaseIdentity(client);clients.delete(client.id);broadcastRoomList();});
  socket.on('error',()=>{});
});
export function start(){return server.listen(PORT,HOST,()=>console.log('Marocto Racing Online listening on '+HOST+':'+PORT));}
export {server,rooms,users};
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)start();
