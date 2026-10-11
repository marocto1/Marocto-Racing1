'use strict';
const http = require('node:http');
const crypto = require('node:crypto');
const { WebSocketServer, WebSocket } = require('ws');

// Unity's host simulates gameplay; the relay forwards protocol-13 JSON.
const PORT = Number(process.env.PORT || 3000);
const MAX_ROOMS = 150, MAX_FRAME = 240000, MAX_RATE = 100;
const rooms = new Map();
const connections = new WeakMap();

const safe = (x, max) => typeof x === 'string' ? x.slice(0, max) : '';
const send = (ws, message) => {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
};
const fail = (ws, reason) => send(ws, { kind: 'error', error: reason });
const listed = r => ({ id: r.id, name: r.name, players: 1 + r.peers.size,
  max: r.max, locked: !!r.password, playing: r.playing });
function newId() {
  for (let i = 0; i < 16; i++) {
    const id = crypto.randomBytes(4).toString('hex').toUpperCase();
    if (!rooms.has(id)) return id;
  }
  throw new Error('Could not allocate room');
}
function leave(ws) {
  const peer = connections.get(ws);
  if (!peer || !peer.room) return;
  const room = rooms.get(peer.room);
  peer.room = null;
  if (!room) return;
  if (peer.host) {
    rooms.delete(room.id);
    for (const guest of room.peers.values()) {
      const gs = connections.get(guest);
      if (gs) gs.room = null;
      send(guest, { kind: 'closed' });
      try { guest.close(1000, 'Host left'); } catch {}
    }
    room.peers.clear();
  } else if (room.peers.delete(peer.id)) {
    send(room.host, { kind: 'leave', from: peer.id });
  }
}
function handle(ws, data) {
  const peer = connections.get(ws);
  if (!peer || !data || typeof data !== 'object' || Array.isArray(data)) return;
  const kind = safe(data.kind, 32);
  if (kind === 'list') {
    const publicRooms = [...rooms.values()].filter(r => r.visible).slice(0, 100).map(listed);
    send(ws, { kind: 'rooms', rooms: publicRooms });
    return;
  }
  if (kind === 'create') {
    if (peer.room) return fail(ws, 'already_in_room');
    if (rooms.size >= MAX_ROOMS) return fail(ws, 'server_full');
    if (data.password != null && typeof data.password !== 'string') return fail(ws, 'invalid_password');
    const password = safe(data.password, 33);
    if (password.length > 32) return fail(ws, 'invalid_password');
    const max = Number(data.max);
    if (!Number.isInteger(max) || max < 2 || max > 30) return fail(ws, 'invalid_capacity');
    const id = newId();
    rooms.set(id, {
      id, name: safe(data.name, 32).trim() || 'Last Stand', password, max,
      visible: data.visible !== false, playing: false, host: ws, peers: new Map()
    });
    peer.room = id;
    peer.host = true;
    send(ws, { kind: 'created', id });
    return;
  }
  if (kind === 'join') {
    if (peer.room) return fail(ws, 'already_in_room');
    const room = rooms.get(safe(data.id, 48).toUpperCase());
    if (!room) return fail(ws, 'room_not_found');
    if (room.password !== safe(data.password, 33)) return fail(ws, 'wrong_password');
    if (room.playing) return fail(ws, 'game_started');
    if (room.peers.size >= room.max - 1) return fail(ws, 'room_full');
    room.peers.set(peer.id, ws);
    peer.room = room.id;
    peer.host = false;
    send(room.host, { kind: 'peer', from: peer.id });
    send(ws, { kind: 'joined', id: room.id });
    return;
  }
  if (!peer.room) return fail(ws, 'not_in_room');
  const room = rooms.get(peer.room);
  if (!room) return fail(ws, 'room_closed');
  if (kind === 'state' && peer.host) {
    room.playing = data.playing === true;
    return;
  }
  if (kind === 'data') {
    if (typeof data.body !== 'string' || data.body.length < 1 || data.body.length > 180000)
      return fail(ws, 'invalid_data');
    if (peer.host) {
      const to = safe(data.to, 48), except = safe(data.except, 48);
      if (to === '*') {
        for (const [id, guest] of room.peers) {
          if (id !== except) send(guest, { kind: 'data', body: data.body });
        }
      } else if (room.peers.has(to)) {
        send(room.peers.get(to), { kind: 'data', body: data.body });
      }
    } else {
      send(room.host, { kind: 'data', from: peer.id, body: data.body });
    }
    return;
  }
  if (kind === 'leave') { leave(ws); return; }
  return fail(ws, 'unknown_kind');
}
const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ service: 'laststand-v13-relay', status: 'ok',
      rooms: rooms.size, transport: 'wss', version: 1 }));
  } else { res.writeHead(404); res.end('Not found'); }
});
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: MAX_FRAME, perMessageDeflate: false });
wss.on('connection', ws => {
  connections.set(ws, { id: crypto.randomUUID().replace(/-/g, ''), room: null,
    host: false, count: 0, windowStart: Date.now() });
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (raw, isBinary) => {
    const peer = connections.get(ws);
    if (!peer) return;
    const now = Date.now();
    if (now - peer.windowStart >= 1000) { peer.windowStart = now; peer.count = 0; }
    if (++peer.count > MAX_RATE) return ws.close(1008, 'Rate limit');
    if (isBinary || raw.length > MAX_FRAME) return fail(ws, 'invalid_frame');
    let data;
    try { data = JSON.parse(raw.toString('utf8')); }
    catch { return fail(ws, 'invalid_json'); }
    handle(ws, data);
  });
  ws.on('close', () => { leave(ws); connections.delete(ws); });
  ws.on('error', () => { /* close event cleans up */ });
});
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { ws.terminate(); continue; }
    ws.isAlive = false;
    if (ws.readyState === WebSocket.OPEN) ws.ping();
  }
}, 30000);
heartbeat.unref();
server.listen(PORT, '0.0.0.0', () => console.log('LastStand v13 relay listening on ' + PORT));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
