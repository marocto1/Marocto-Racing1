function defaultEndpoint(){
  try{return window.racingDesktop?.onlineServer||localStorage.getItem('mr-online-server')||'wss://marocto-racing-playable.onrender.com/ws';}
  catch{return 'wss://marocto-racing-playable.onrender.com/ws';}
}
function healthEndpoint(endpoint){
  try{const u=new URL(endpoint);u.protocol=u.protocol==='wss:'?'https:':'http:';u.pathname='/health';u.search='';u.hash='';return u.href;}catch{return null;}
}
async function wakeServer(endpoint,emit){
  const health=healthEndpoint(endpoint);if(!health)return;
  emit?.('connection.state',{state:'waking'});
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),65000);
  try{const r=await fetch(health,{cache:'no-store',signal:controller.signal});if(!r.ok)throw Error('SERVER_HEALTH_'+r.status);}
  catch(e){if(e?.name==='AbortError')throw Error('SERVER_WAKE_TIMEOUT');throw e;}
  finally{clearTimeout(timer);}
}
export class OnlineClient{
  constructor(endpoint=defaultEndpoint()){this.endpoint=endpoint;this.ws=null;this.profile=null;this.room=null;this.rooms=[];this.latency=null;this.listeners=new Map();this.pingTimer=null;this.pendingPing=new Map();}
  on(type,fn){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(fn);return()=>this.listeners.get(type)?.delete(fn);}
  emit(type,data){for(const fn of this.listeners.get(type)||[])try{fn(data);}catch(error){console.error(error);}}
  setEndpoint(value){this.endpoint=String(value||'').trim()||defaultEndpoint();try{localStorage.setItem('mr-online-server',this.endpoint);}catch{}}
  async connect(){
    if(this.ws?.readyState===WebSocket.OPEN)return;
    await wakeServer(this.endpoint,(...args)=>this.emit(...args));
    for(let attempt=0;attempt<2;attempt++){
      try{
        await new Promise((resolve,reject)=>{
          let settled=false;const ws=this.ws=new WebSocket(this.endpoint);
          const timer=setTimeout(()=>{if(!settled){settled=true;try{ws.close();}catch{}reject(Error('CONNECTION_TIMEOUT'));}},15000);
          ws.addEventListener('open',()=>{if(settled)return;settled=true;clearTimeout(timer);this.startPing();this.emit('open',{});resolve();});
          ws.addEventListener('close',()=>{clearTimeout(timer);this.stopPing();if(this.ws===ws)this.ws=null;this.emit('close',{});if(!settled){settled=true;reject(Error('CONNECTION_CLOSED'));}});
          ws.addEventListener('error',()=>this.emit('network.error',{}));
          ws.addEventListener('message',event=>{let msg;try{msg=JSON.parse(event.data);}catch{return;}if(msg.type==='auth.ok')this.profile=msg.profile;if(msg.type==='auth.loggedOut')this.profile=null;if(msg.type==='room.list')this.rooms=msg.rooms||[];if(msg.type==='room.state')this.room=msg.room;if(msg.type==='room.left')this.room=null;if(msg.type==='race.start')this.room=msg.room;if(msg.type==='pong'&&this.pendingPing.has(msg.nonce)){this.latency=Math.max(0,Date.now()-this.pendingPing.get(msg.nonce));this.pendingPing.delete(msg.nonce);this.emit('latency',{ms:this.latency});}this.emit(msg.type,msg);});
        });return;
      }catch(e){if(attempt)throw e;this.emit('connection.state',{state:'retrying'});await new Promise(r=>setTimeout(r,1200));}
    }
  }
  close(){this.stopPing();try{this.ws?.close();}catch{}}
  startPing(){this.stopPing();this.pingTimer=setInterval(()=>{if(this.ws?.readyState!==WebSocket.OPEN)return;const nonce=(globalThis.crypto?.randomUUID?.()||String(Date.now()+Math.random()));this.pendingPing.set(nonce,Date.now());this.send('ping',{nonce});},5000);}
  stopPing(){if(this.pingTimer)clearInterval(this.pingTimer);this.pingTimer=null;this.pendingPing.clear();}
  send(type,data={}){if(this.ws?.readyState!==WebSocket.OPEN)throw Error('NOT_CONNECTED');this.ws.send(JSON.stringify({type,...data}));}
  guest(nickname){this.send('auth.guest',{nickname});}
  register(username,password){this.send('auth.register',{username,password});}
  login(username,password){this.send('auth.login',{username,password});}
  logout(){this.send('auth.logout');}
  refreshRooms(){this.send('room.list');}
  createRoom(settings){this.send('room.create',settings);}
  joinRoom(roomId,password=''){this.send('room.join',{roomId,password});}
  leaveRoom(){this.send('room.leave');}
  ready(ready){this.send('room.ready',{ready});}
  updateRoom(patch){this.send('room.update',patch);}
  startRace(){this.send('room.start');}
  sendRaceState(state){this.send('race.state',{state});}
}
export const onlineClient=new OnlineClient();
