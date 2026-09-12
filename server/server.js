import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 3000);
const clients = new Map();
const lobbies = new Map();
let nextId = 1;

const safeText = (value, fallback, max = 18) => String(value || fallback).replace(/[^\p{L}\p{N}_ .-]/gu, '').trim().slice(0, max) || fallback;
const safeLobby = (value) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
const createLobbyId = () => { let id; do id = Math.random().toString(36).slice(2, 8).toUpperCase(); while (lobbies.has(id)); return id; };
const lobbyPlayers = (lobbyId) => [...(lobbies.get(lobbyId) || [])].map((client) => ({ id: client.id, nick: client.nick, hero: client.hero, x: client.x, z: client.z, rotation: client.rotation }));

function send(client, payload) { if (client.ws.readyState === 1) client.ws.send(JSON.stringify(payload)); }
function broadcast(lobbyId, payload, except = null) { for (const client of lobbies.get(lobbyId) || []) if (client !== except) send(client, payload); }
function state(client) { send(client, { type: 'state', lobby: client.lobby, players: lobbyPlayers(client.lobby) }); }

function removeClient(client) {
  if (!client) return;
  const members = lobbies.get(client.lobby); if (members) { members.delete(client); if (!members.size) lobbies.delete(client.lobby); else broadcast(client.lobby, { type: 'player_left', id: client.id }); }
  clients.delete(client.id);
}

function joinLobby(client, message) {
  const requested = safeLobby(message.lobby);
  const lobby = requested || createLobbyId();
  if (!lobbies.has(lobby)) lobbies.set(lobby, new Set());
  if (client.lobby) removeClient(client);
  client.lobby = lobby; client.nick = safeText(message.nick, `Игрок${client.id}`); client.hero = message.hero === 'hero2' ? 'hero2' : 'hero1';
  client.x = Number.isFinite(Number(message.x)) ? Math.max(-40, Math.min(40, Number(message.x))) : -34.7;
  client.z = Number.isFinite(Number(message.z)) ? Math.max(-40, Math.min(40, Number(message.z))) : -27.3;
  client.rotation = 0; lobbies.get(lobby).add(client);
  send(client, { type: 'welcome', id: client.id, lobby, nick: client.nick }); state(client); broadcast(lobby, { type: 'player_joined', player: { id: client.id, nick: client.nick, hero: client.hero, x: client.x, z: client.z, rotation: client.rotation } }, client);
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (url.pathname === '/health') { response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' }); response.end(JSON.stringify({ ok: true, service: 'rift-online', players: clients.size, lobbies: lobbies.size })); return; }
  let pathname = decodeURIComponent(url.pathname); if (pathname === '/') pathname = '/index.html';
  const file = path.resolve(root, `.${pathname}`);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { response.writeHead(404); response.end('Not found'); return; }
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.wav': 'audio/wav', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };
  response.writeHead(200, { 'content-type': types[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': pathname.includes('app.') ? 'no-cache' : 'public, max-age=3600' }); fs.createReadStream(file).pipe(response);
});

const wss = new WebSocketServer({ server });
wss.on('connection', (ws) => {
  const client = { ws, id: String(nextId++), nick: '', hero: 'hero1', lobby: '', x: -34.7, z: -27.3, rotation: 0, lastMove: 0 };
  clients.set(client.id, client);
  send(client, { type: 'connected', id: client.id });
  ws.on('message', (raw) => {
    let message; try { message = JSON.parse(raw.toString()); } catch { return; }
    if (message.type === 'join') return joinLobby(client, message);
    if (!client.lobby) return;
    if (message.type === 'hero') { client.hero = message.hero === 'hero2' ? 'hero2' : 'hero1'; broadcast(client.lobby, { type: 'player_hero', id: client.id, hero: client.hero }); return; }
    if (message.type === 'voice') {
      const hero = message.hero === 'hero2' ? 'hero2' : 'hero1'; const index = Number(message.index);
      if (Number.isInteger(index) && index >= 0 && index < (hero === 'hero2' ? 5 : 4)) broadcast(client.lobby, { type: 'voice', id: client.id, hero, index }, client);
      return;
    }
    if (message.type === 'move') {
      const now = Date.now(); if (now - client.lastMove < 45) return; client.lastMove = now;
      const x = Number(message.x); const z = Number(message.z); if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      client.x = Math.max(-40, Math.min(40, x)); client.z = Math.max(-40, Math.min(40, z)); client.rotation = Number(message.rotation) || 0;
      broadcast(client.lobby, { type: 'player_move', id: client.id, x: client.x, z: client.z, rotation: client.rotation }, client);
    }
  });
  ws.on('close', () => removeClient(client)); ws.on('error', () => removeClient(client));
});

server.listen(port, '0.0.0.0', () => console.log(`Rift Online listening on ${port}`));
