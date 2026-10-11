'use strict';
const assert = require('node:assert/strict');
const EventEmitter = require('node:events');
const Module = require('node:module');
class Socket extends EventEmitter {
  constructor() { super(); this.sent = []; this.readyState = 1; }
  send(s) { this.sent.push(JSON.parse(s)); }
  close() { this.readyState = 3; this.emit('close'); }
  ping() { this.emit('pong'); }
  transmit(msg) { this.emit('message', Buffer.from(JSON.stringify(msg)), false); }
  pop(kind) { const i = this.sent.findIndex(x => x.kind === kind); assert(i >= 0, 'Expected ' + kind); return this.sent.splice(i,1)[0]; }
}
let service;
class FakeServer extends EventEmitter { constructor() { super(); this.clients = new Set(); service = this; } }
const originalLoad = Module._load;
Module._load = function (name, parent, main) {
  if (name === 'ws') return { WebSocketServer: FakeServer, WebSocket: { OPEN: 1 } };
  return originalLoad.apply(this, arguments);
};
process.env.PORT = '0';
require('./server.js');
Module._load = originalLoad;
function joinSocket() { const sock = new Socket(); service.clients.add(sock); service.emit('connection',sock); return sock; }
const host = joinSocket(), guest = joinSocket(), other = joinSocket();
host.transmit({kind:'create',name:'Last Stand QA',password:'secret',max:2,visible:true});
const created = host.pop('created'); assert.match(created.id,/^[A-F0-9]{8}$/);
other.transmit({kind:'list'}); const list = other.pop('rooms');
assert.equal(list.rooms[0].name,'Last Stand QA');assert.equal(list.rooms[0].locked,true);
guest.transmit({kind:'join',id:created.id,password:'invalid'});
assert.equal(guest.pop('error').error,'wrong_password');
guest.transmit({kind:'join',id:created.id,password:'secret'});
assert.equal(guest.pop('joined').id,created.id);const peer = host.pop('peer');
assert.match(peer.from,/^[a-f0-9]{32}$/);
guest.transmit({kind:'data',body:'hello-from-guest'});
assert.deepEqual(host.pop('data'),{kind:'data',from:peer.from,body:'hello-from-guest'});
host.transmit({kind:'data',to:peer.from,body:'hello-to-guest'});
assert.deepEqual(guest.pop('data'),{kind:'data',body:'hello-to-guest'});
host.transmit({kind:'data',to:'*',body:'broadcast'});
assert.equal(guest.pop('data').body,'broadcast');
other.transmit({kind:'join',id:created.id,password:'secret'});
assert.equal(other.pop('error').error,'room_full');
host.transmit({kind:'state',playing:true});
other.transmit({kind:'list'});assert.equal(other.pop('rooms').rooms[0].playing,true);
guest.close();assert.equal(host.pop('leave').from,peer.from);
host.close();other.transmit({kind:'list'});assert.equal(other.pop('rooms').rooms.length,0);
console.log('PASS: create, list, password, join, peer, direct data, broadcast, capacity, playing, leave, room close');
process.emit('SIGTERM');
