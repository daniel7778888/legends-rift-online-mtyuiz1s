export class OnlineClient {
  constructor(callbacks = {}) { this.callbacks = callbacks; this.socket = null; this.id = null; this.connected = false; this.joined = false; this.lastSent = 0; }

  connect(nick, hero, lobby = '') {
    if (this.socket && this.socket.readyState <= 1) this.socket.close();
    if (location.protocol === 'file:') { this.callbacks.status?.('Откройте игру через адрес Render для онлайна'); return; }
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'; const url = `${protocol}//${location.host}`;
    this.callbacks.status?.('Подключение…');
    try { this.socket = new WebSocket(url); } catch { this.callbacks.status?.('Не удалось создать соединение'); return; }
    this.socket.addEventListener('open', () => { this.connected = true; this.send({ type: 'join', nick: nick || 'Игрок', hero: hero || 'hero1', lobby, x: this.callbacks.position?.().x, z: this.callbacks.position?.().z }); this.callbacks.status?.('Онлайн подключён'); });
    this.socket.addEventListener('message', (event) => { let message; try { message = JSON.parse(event.data); } catch { return; } this.handle(message); });
    this.socket.addEventListener('close', () => { this.connected = false; this.joined = false; this.callbacks.status?.('Соединение закрыто'); });
    this.socket.addEventListener('error', () => this.callbacks.status?.('Сервер недоступен'));
  }

  handle(message) {
    if (message.type === 'connected') { this.id = message.id; return; }
    if (message.type === 'welcome') { this.id = message.id; this.joined = true; this.callbacks.lobby?.(message.lobby); return; }
    if (message.type === 'state') { this.callbacks.players?.(message.players || []); this.callbacks.lobby?.(message.lobby); return; }
    if (message.type === 'player_joined') { this.callbacks.playerJoined?.(message.player); return; }
    if (message.type === 'player_left') { this.callbacks.playerLeft?.(message.id); return; }
    if (message.type === 'player_move') { this.callbacks.playerMove?.(message); return; }
    if (message.type === 'player_hero') { this.callbacks.playerHero?.(message); return; }
    if (message.type === 'voice') { this.callbacks.voice?.(message); }
  }

  send(payload) { if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(payload)); }

  setHero(hero) { this.send({ type: 'hero', hero }); }
  sendVoice(hero, index) { this.send({ type: 'voice', hero, index }); }

  update(now, player) {
    if (!this.connected || !this.joined || now - this.lastSent < .075) return;
    this.lastSent = now; this.send({ type: 'move', x: player.position.x, z: player.position.z, rotation: player.root.rotation.y });
  }
}
