// เซิร์ฟเวอร์หมากฮอสออนไลน์ (ไม่ต้องติดตั้งแพ็กเกจเพิ่ม) — รัน: node server.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const R = require('./rules.js');

const PORT = process.env.PORT || 3000;
const rooms = {}; // code -> room

function getRoom(code) {
  if (!rooms[code]) rooms[code] = { code, game: R.newGame(), players: { w: null, b: null }, score: { w: 0, b: 0 }, chat: [], clients: [], touched: Date.now() };
  rooms[code].touched = Date.now();
  return rooms[code];
}

const online = (room, token) => room.clients.some(c => c.token === token);
const colorOf = (room, token) => ['w', 'b'].find(k => room.players[k] && room.players[k].token === token);

function send(room, payload) {
  room.clients.forEach(c => c.res.write(`data: ${JSON.stringify(payload(c))}\n\n`));
}

function broadcast(room) {
  const players = {};
  for (const k of ['w', 'b']) {
    const p = room.players[k];
    players[k] = p && { name: p.name, online: online(room, p.token) };
  }
  const base = { type: 'state', code: room.code, game: room.game, players, score: room.score, chat: room.chat.slice(-60), spectators: room.clients.filter(c => !colorOf(room, c.token)).length };
  send(room, c => ({ ...base, you: colorOf(room, c.token) || 'spectator' }));
}

function body(req) {
  return new Promise(ok => {
    let d = '';
    req.on('data', c => { d += c; if (d.length > 1e5) req.destroy(); });
    req.on('end', () => { try { ok(JSON.parse(d || '{}')); } catch { ok({}); } });
  });
}

const clean = (s, n) => String(s || '').replace(/[<>]/g, '').trim().slice(0, n);

const routes = {
  async '/join'(q) {
    const room = getRoom(q.room);
    const name = clean(q.name, 20) || 'ผู้เล่น';
    let color = colorOf(room, q.token);
    if (!color) color = !room.players.w ? 'w' : !room.players.b ? 'b' : null;
    if (color) room.players[color] = { token: q.token, name };
    return { color: color || 'spectator' };
  },
  async '/move'(q, room) {
    const color = colorOf(room, q.token);
    if (!color || color !== room.game.turn || !R.applyMove(room.game, q.from, q.to)) return { error: 'illegal' };
    if (room.game.winner) room.score[room.game.winner]++;
  },
  async '/chat'(q, room) {
    const text = clean(q.text, 200);
    if (!text) return;
    const color = colorOf(room, q.token);
    room.chat.push({ name: clean(q.name, 20) || 'ผู้ชม', color: color || 's', text, t: Date.now() });
    if (room.chat.length > 200) room.chat.shift();
  },
  async '/react'(q, room) {
    const emoji = ['😂', '👍', '😮', '😡', '🔥', '🙏', '😭', '🤝'].includes(q.emoji) ? q.emoji : null;
    if (emoji) send(room, () => ({ type: 'react', emoji, color: colorOf(room, q.token) || 's' }));
    return { skip: true };
  },
  async '/resign'(q, room) {
    const color = colorOf(room, q.token);
    if (!color || room.game.winner) return;
    room.game.winner = R.other(color);
    room.game.resigned = color;
    room.score[room.game.winner]++;
  },
  async '/rematch'(q, room) {
    if (!colorOf(room, q.token) || !room.game.winner) return;
    // สลับฝ่ายให้ยุติธรรม (ขาวเดินก่อน)
    room.players = { w: room.players.b, b: room.players.w };
    room.score = { w: room.score.b, b: room.score.w };
    room.game = R.newGame();
  },
};

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;

  if (p === '/events') {
    const room = getRoom(url.searchParams.get('room'));
    const token = url.searchParams.get('token');
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    const client = { res, token };
    room.clients.push(client);
    broadcast(room);
    const ping = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => { clearInterval(ping); room.clients = room.clients.filter(c => c !== client); broadcast(room); });
    return;
  }

  if (p === '/rooms') {
    const list = Object.values(rooms)
      .filter(r => r.clients.length && (!r.players.w || !r.players.b || !online(r, r.players.w.token) || !online(r, r.players.b.token)))
      .sort((a, b) => b.touched - a.touched).slice(0, 12)
      .map(r => ({ code: r.code, host: (r.players.w || r.players.b || {}).name, count: r.clients.length }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(list));
  }

  if (routes[p] && req.method === 'POST') {
    const q = await body(req);
    q.room = clean(q.room, 24).toUpperCase();
    if (!q.room || !q.token) { res.statusCode = 400; return res.end('{}'); }
    const room = getRoom(q.room);
    const out = (await routes[p](q, room)) || {};
    if (out.error) res.statusCode = 403;
    if (!out.skip) broadcast(room);
    res.writeHead(res.statusCode, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(out));
  }

  const file = p === '/rules.js' ? 'rules.js' : 'index.html';
  fs.readFile(path.join(__dirname, file), (err, data) => {
    res.writeHead(200, { 'Content-Type': (file.endsWith('.js') ? 'text/javascript' : 'text/html') + '; charset=utf-8' });
    res.end(data);
  });
}).listen(PORT, () => console.log(`หมากฮอสออนไลน์: http://localhost:${PORT}`));

// ลบห้องที่ไม่มีใครอยู่นานเกิน 6 ชั่วโมง
setInterval(() => {
  for (const k in rooms) if (!rooms[k].clients.length && Date.now() - rooms[k].touched > 6 * 3600e3) delete rooms[k];
}, 600e3);
