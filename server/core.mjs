import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const RACE_MODES = Object.freeze([
  'CIRCUIT','SPRINT','DRAG','LAP_KNOCKOUT','SPEEDTRAP','TOLLBOOTH'
]);

export function key(value){return String(value??'').trim().toLocaleLowerCase('en-US');}
export function cleanText(value,max=32){return String(value??'').trim().replace(/\s+/g,' ').slice(0,max);}
export function validNick(value){
  const v=cleanText(value,18);
  return v.length>=3 && /^[\p{L}\p{N}_-]+$/u.test(v);
}
export function validRoomName(value){
  const v=cleanText(value,32);
  return v.length>=3 && /^[\p{L}\p{N} _.'-]+$/u.test(v);
}
export function validPassword(value){const v=String(value??'');return v.length>=6&&v.length<=72;}

function hashSecret(secret,salt=crypto.randomBytes(16).toString('hex')){
  const hash=crypto.scryptSync(String(secret),salt,32).toString('hex');
  return {salt,hash};
}
function verifySecret(secret,record){
  try{
    const got=crypto.scryptSync(String(secret),record.salt,32);
    const want=Buffer.from(record.hash,'hex');
    return got.length===want.length&&crypto.timingSafeEqual(got,want);
  }catch{return false;}
}

export class FileUserStore{
  constructor(file){
    this.file=file;this.users=new Map();
    this.load();
  }
  load(){
    try{
      const data=JSON.parse(fs.readFileSync(this.file,'utf8'));
      for(const u of data.users||[])this.users.set(key(u.username),u);
    }catch{}
  }
  save(){
    fs.mkdirSync(path.dirname(this.file),{recursive:true});
    const temp=this.file+'.tmp';
    fs.writeFileSync(temp,JSON.stringify({version:1,users:[...this.users.values()]},null,2));
    fs.renameSync(temp,this.file);
  }
  has(username){return this.users.has(key(username));}
  register(username,password){
    username=cleanText(username,18);
    if(!validNick(username))throw Error('USERNAME_INVALID');
    if(!validPassword(password))throw Error('PASSWORD_INVALID');
    const k=key(username);
    if(this.users.has(k))throw Error('USERNAME_EXISTS');
    const secret=hashSecret(password);
    const user={id:crypto.randomUUID(),username,...secret,createdAt:Date.now()};
    this.users.set(k,user);this.save();
    return {id:user.id,username:user.username,registered:true};
  }
  login(username,password){
    const user=this.users.get(key(username));
    if(!user||!verifySecret(password,user))throw Error('LOGIN_INVALID');
    return {id:user.id,username:user.username,registered:true};
  }
}

function roomSecret(password){
  const value=String(password??'');
  return value?hashSecret(value):null;
}
export class RoomRegistry{
  constructor(){this.rooms=new Map();}
  list(){
    return [...this.rooms.values()].map(r=>this.public(r));
  }
  public(r){
    return {
      id:r.id,name:r.name,locked:Boolean(r.secret),maxPlayers:r.maxPlayers,
      mode:r.mode,track:r.track,laps:r.laps,hostId:r.hostId,
      hostNickname:r.players.find(p=>p.id===r.hostId)?.nickname||'',
      started:r.started,players:r.players.map(p=>({...p})),
      playerCount:r.players.length,createdAt:r.createdAt
    };
  }
  findByName(name){const k=key(name);return [...this.rooms.values()].find(r=>key(r.name)===k)||null;}
  create(owner,settings={}){
    const name=cleanText(settings.name,32);
    if(!validRoomName(name))throw Error('ROOM_NAME_INVALID');
    if(this.findByName(name))throw Error('ROOM_NAME_EXISTS');
    const maxPlayers=Math.max(2,Math.min(8,Number(settings.maxPlayers)||2));
    const mode=RACE_MODES.includes(settings.mode)?settings.mode:'CIRCUIT';
    const track=cleanText(settings.track||'ROCKPORT_CIRCUIT',40)||'ROCKPORT_CIRCUIT';
    const laps=mode==='CIRCUIT'||mode==='LAP_KNOCKOUT'?Math.max(1,Math.min(10,Number(settings.laps)||3)):1;
    const room={
      id:crypto.randomUUID(),name,maxPlayers,mode,track,laps,
      secret:roomSecret(settings.password),hostId:owner.id,started:false,createdAt:Date.now(),
      players:[{id:owner.id,nickname:owner.nickname,registered:owner.registered,ready:false,joinedAt:Date.now()}]
    };
    this.rooms.set(room.id,room);return this.public(room);
  }
  get(id){return this.rooms.get(String(id))||null;}
  join(id,profile,password=''){
    const r=this.get(id);if(!r)throw Error('ROOM_NOT_FOUND');
    if(r.started)throw Error('ROOM_STARTED');
    if(r.players.length>=r.maxPlayers)throw Error('ROOM_FULL');
    if(r.players.some(p=>p.id===profile.id))return this.public(r);
    if(r.secret&&!verifySecret(password,r.secret))throw Error('ROOM_PASSWORD');
    r.players.push({id:profile.id,nickname:profile.nickname,registered:profile.registered,ready:false,joinedAt:Date.now()});
    return this.public(r);
  }
  leave(id,playerId){
    const r=this.get(id);if(!r)return null;
    r.players=r.players.filter(p=>p.id!==playerId);
    if(!r.players.length){this.rooms.delete(r.id);return null;}
    if(r.hostId===playerId)r.hostId=r.players[0].id;
    return this.public(r);
  }
  setReady(id,playerId,ready){
    const r=this.get(id);if(!r)throw Error('ROOM_NOT_FOUND');
    const p=r.players.find(x=>x.id===playerId);if(!p)throw Error('NOT_IN_ROOM');
    p.ready=Boolean(ready);return this.public(r);
  }
  update(id,playerId,patch={}){
    const r=this.get(id);if(!r)throw Error('ROOM_NOT_FOUND');
    if(r.hostId!==playerId)throw Error('HOST_ONLY');
    if(r.started)throw Error('ROOM_STARTED');
    if(patch.maxPlayers!=null){
      const n=Math.max(2,Math.min(8,Number(patch.maxPlayers)||r.maxPlayers));
      if(n<r.players.length)throw Error('ROOM_TOO_SMALL');
      r.maxPlayers=n;
    }
    if(RACE_MODES.includes(patch.mode))r.mode=patch.mode;
    if(patch.track)r.track=cleanText(patch.track,40);
    if(patch.laps!=null)r.laps=Math.max(1,Math.min(10,Number(patch.laps)||r.laps));
    return this.public(r);
  }
  start(id,playerId){
    const r=this.get(id);if(!r)throw Error('ROOM_NOT_FOUND');
    if(r.hostId!==playerId)throw Error('HOST_ONLY');
    if(r.players.length<2)throw Error('NEED_TWO_PLAYERS');
    if(r.players.some(p=>p.id!==r.hostId&&!p.ready))throw Error('PLAYERS_NOT_READY');
    r.started=true;return this.public(r);
  }
}
