import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {FileUserStore,RoomRegistry,RACE_MODES,validNick,validRoomName} from '../server/core.mjs';

test('online validation and MW-style modes',()=>{
  assert.equal(validNick('Marocto_1'),true);
  assert.equal(validNick('ab'),false);
  assert.equal(validRoomName('Rockport Night'),true);
  for(const mode of ['CIRCUIT','SPRINT','DRAG','LAP_KNOCKOUT','SPEEDTRAP'])assert.ok(RACE_MODES.includes(mode));
});

test('registered usernames are persistent and unique',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mr-online-'));
  const file=path.join(dir,'users.json'),store=new FileUserStore(file);
  const user=store.register('Marocto','secret77');
  assert.equal(user.registered,true);
  assert.equal(store.login('marocto','secret77').id,user.id);
  assert.throws(()=>store.register('MAROCTO','another77'),/USERNAME_EXISTS/);
  assert.throws(()=>store.login('Marocto','wrongpass'),/LOGIN_INVALID/);
});

test('rooms enforce unique names, passwords and 2-8 player limits',()=>{
  const rooms=new RoomRegistry();
  const a={id:'a',nickname:'Alpha',registered:false},b={id:'b',nickname:'Bravo',registered:false};
  const room=rooms.create(a,{name:'Blacklist Run',password:'hunter77',maxPlayers:99,mode:'SPRINT'});
  assert.equal(room.maxPlayers,8);assert.equal(room.locked,true);
  assert.throws(()=>rooms.create(b,{name:'blacklist run',maxPlayers:2}),/ROOM_NAME_EXISTS/);
  assert.throws(()=>rooms.join(room.id,b,'bad'),/ROOM_PASSWORD/);
  assert.equal(rooms.join(room.id,b,'hunter77').playerCount,2);
});

test('host starts only with at least two players and everyone ready',()=>{
  const rooms=new RoomRegistry();
  const a={id:'a',nickname:'Alpha',registered:true},b={id:'b',nickname:'Bravo',registered:false};
  const room=rooms.create(a,{name:'Sprint Lobby',maxPlayers:2,mode:'SPRINT'});
  assert.throws(()=>rooms.start(room.id,'a'),/NEED_TWO_PLAYERS/);
  rooms.join(room.id,b);
  assert.throws(()=>rooms.start(room.id,'a'),/PLAYERS_NOT_READY/);
  rooms.setReady(room.id,'b',true);
  assert.equal(rooms.start(room.id,'a').started,true);
});
