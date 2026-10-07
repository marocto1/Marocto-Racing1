function defaultEndpoint(){
  try{return window.racingDesktop?.onlineServer||localStorage.getItem('mr-online-server')||'ws://127.0.0.1:8787/ws';}
  catch{return 'ws://127.0.0.1:8787/ws';}
}
export class OnlineClient{
  constructor(endpoint=defaultEndpoint()){this.endpoint=endpoint;this.ws=null;this.profile=null;this.room=null;this.rooms=[];this.latency=null;this.listeners=new Map();this.pingTimer=null;this.pendingPing=new Map();}
  on(type,fn){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(fn);return()=>this.listeners.get(type)?.delete(fn);}
  emit(type,data){for(const fn of this.listeners.get(type)||[])try{fn(data);}catch(error){console.error(error);}}
  setEndpoint(value){this.endpoint=String(value||'').trim()||defaultEndpoint();try{localStorage.setItem('mr-online-server',this.endpoint);}catch{}}
  connect(){
    if(this.ws?.readyState===WebSocket.OPEN)return Promise.resolve();
    return new Promise((resolve,reject)=>{
      let settled=false;const ws=this.ws=new WebSocket(this.endpoint);
      const timer=setTimeout(()=>{if(!settled){settled=true;try{ws.close();}catch{}reject(Error('CONNECTION_TIMEOUT'));}},6000);
      ws.addEventListener('open',()=>{if(settled)return;settled=true;clearTimeout(timer);this.startPing();this.emit('open',{});resolve();});
      ws.addEventListener('close',()=>{clearTimeout(timer);this.stopPing();this.profile=null;this.room=null;this.emit('close',{});if(!settled){settled=true;reject(Error('CONNECTION_CLOSED'));}});
      ws.addEventListener('error',()=>this.emit('network.error',{}));
      ws.addEventListener('message',event=>{let msg;try{msg=JSON.parse(event.data);}catch{return;}if(msg.type==='auth.ok')this.profile=msg.profile;if(msg.type==='auth.loggedOut')this.profile=null;if(msg.type==='room.list')this.rooms=msg.rooms||[];if(msg.type==='room.state')this.room=msg.room;if(msg.type==='room.left')this.room=null;if(msg.type==='race.start')this.room=msg.room;if(msg.type==='pong'&&this.pendingPing.has(msg.nonce)){this.latency=Math.max(0,Date.now()-this.pendingPing.get(msg.nonce));this.pendingPing.delete(msg.nonce);this.emit('latency',{ms:this.latency});}this.emit(msg.type,msg);});
    });
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
}
export const onlineClient=new OnlineClient();
