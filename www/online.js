function defaultEndpoint(){
  try{return window.racingDesktop?.onlineServer||localStorage.getItem('mr-online-server')||'wss://marocto-racing-online.onrender.com/ws';}
  catch{return 'wss://marocto-racing-online.onrender.com/ws';}
}
function healthEndpoint(endpoint){
  try{
    const url=new URL(endpoint);
    if(url.protocol==='wss:')url.protocol='https:';
    else if(url.protocol==='ws:')url.protocol='http:';
    url.pathname='/health';url.search='';url.hash='';
    return url.href;
  }catch{return null;}
}
async function wakeServer(endpoint,onState){
  const health=healthEndpoint(endpoint);if(!health)return;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),65000);
  try{
    onState?.('waking');
    const response=await fetch(health,{cache:'no-store',signal:controller.signal});
    if(!response.ok)throw Error('SERVER_HEALTH_'+response.status);
    onState?.('awake');
  }catch(error){
    if(error?.name==='AbortError')throw Error('SERVER_WAKE_TIMEOUT');
    throw error;
  }finally{clearTimeout(timer);}
}
export class OnlineClient{
  constructor(endpoint=defaultEndpoint()){this.endpoint=endpoint;this.ws=null;this.profile=null;this.room=null;this.rooms=[];this.latency=null;this.listeners=new Map();this.pingTimer=null;this.pendingPing=new Map();}
  on(type,fn){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(fn);return()=>this.listeners.get(type)?.delete(fn);}
  emit(type,data){for(const fn of this.listeners.get(type)||[])try{fn(data);}catch(error){console.error(error);}}
  setEndpoint(value){this.endpoint=String(value||'').trim()||defaultEndpoint();try{localStorage.setItem('mr-online-server',this.endpoint);}catch{}}
  async connect(){
    if(this.ws?.readyState===WebSocket.OPEN)return;
    await wakeServer(this.endpoint,state=>this.emit('connection.state',{state}));
    for(let attempt=1;attempt<=2;attempt++){
      try{
        await new Promise((resolve,reject)=>{
          let settled=false;const ws=this.ws=new WebSocket(this.endpoint);
          const timer=setTimeout(()=>{if(!settled){settled=true;try{ws.close();}catch{}reject(Error('CONNECTION_TIMEOUT'));}},15000);
          ws.addEventListener('open',()=>{if(settled)return;settled=true;clearTimeout(timer);this.startPing();this.emit('open',{});resolve();});
          ws.addEventListener('close',()=>{clearTimeout(timer);this.stopPing();if(this.ws===ws)this.ws=null;this.emit('close',{});if(!settled){settled=true;reject(Error('CONNECTION_CLOSED'));}});
          ws.addEventListener('error',()=>this.emit('network.error',{}));
          ws.addEventListener('message',event=>{let msg;try{msg=JSON.parse(event.data);}catch{return;}if(msg.type==='auth.ok')this.profile=msg.profile;if(msg.type==='auth.loggedOut')this.profile=null;if(msg.type==='room.list')this.rooms=msg.rooms||[];if(msg.type==='room.state')this.room=msg.room;if(msg.type==='room.left')this.room=null;if(msg.type==='race.start')this.room=msg.room;if(msg.type==='pong'&&this.pendingPing.has(msg.nonce)){this.latency=Math.max(0,Date.now()-this.pendingPing.get(msg.nonce));this.pendingPing.delete(msg.nonce);this.emit('latency',{ms:this.latency});}this.emit(msg.type,msg);});
        });
        return;
      }catch(error){
        if(attempt===2)throw error;
        this.emit('connection.state',{state:'retrying'});
        await new Promise(r=>setTimeout(r,1200));
      }
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
}
export const onlineClient=new OnlineClient();
