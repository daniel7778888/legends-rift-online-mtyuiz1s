import { BASES, GROVES, HALF_MAP } from '../world/mapLayout.js';

/** Minimal game UI plus a small code-based lobby panel. */
export class MapHUD {
  constructor(root, actions) {
    this.root = root; this.actions = actions;
    root.innerHTML = `
      <canvas id="scene" aria-label="Интерактивная 3D карта"></canvas>
      <div id="hud">
        <section id="hero-select" aria-label="Выбор героя"><b>ГЕРОЙ</b><div><button class="hero-choice active" data-hero="hero1"><span>Ⅰ</span><small>ГЕРОЙ 1</small></button><button class="hero-choice" data-hero="hero2"><span>Ⅱ</span><small>ГЕРОЙ 2</small></button></div></section>
        <section id="online-panel" aria-label="Онлайн лобби">
          <b class="online-heading">ЛОББИ ПО КОДУ</b>
          <input id="nickname" maxlength="18" placeholder="Твой ник" autocomplete="off" />
          <div class="lobby-row"><input id="lobby-code" maxlength="8" placeholder="КОД" autocomplete="off" /><button id="join-lobby">ВОЙТИ</button></div>
          <small class="online-help">Введи код друга или оставь пустым, чтобы создать лобби</small>
          <div id="online-status">Офлайн</div>
          <div id="room-code" class="room-hidden">КОД КОМНАТЫ: <strong id="room-code-value"></strong></div>
          <div id="online-players"></div>
        </section>
        <section id="minimap-shell" aria-label="Мини-карта"><canvas id="minimap" width="384" height="384"></canvas><b>КАРТА ДОЛИНЫ</b></section>
      </div>
    `;
    this.map = root.querySelector('#minimap'); this.ctx = this.map.getContext('2d');
    this.map.addEventListener('pointerdown', (event) => { event.stopPropagation(); const rect = this.map.getBoundingClientRect(); const x = (event.clientX - rect.left) / rect.width * HALF_MAP * 2 - HALF_MAP; const z = (event.clientY - rect.top) / rect.height * HALF_MAP * 2 - HALF_MAP; actions.focus?.(x, z); });
    root.querySelectorAll('.hero-choice').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); root.querySelectorAll('.hero-choice').forEach((item) => item.classList.toggle('active', item === button)); actions.chooseHero?.(button.dataset.hero); }));
    root.querySelector('#join-lobby').addEventListener('click', () => { actions.connect?.(root.querySelector('#nickname').value, root.querySelector('.hero-choice.active').dataset.hero, root.querySelector('#lobby-code').value); });
    root.querySelector('#lobby-code').addEventListener('keydown', (event) => { if (event.key === 'Enter') root.querySelector('#join-lobby').click(); });
    root.querySelector('#nickname').addEventListener('keydown', (event) => { if (event.key === 'Enter') root.querySelector('#join-lobby').click(); });
    this.draw();
  }

  setOnlineStatus(text, good = false) { const item = this.root.querySelector('#online-status'); item.textContent = text; item.classList.toggle('online-good', good); }
  setRoom(code) { this.root.querySelector('#room-code').classList.remove('room-hidden'); this.root.querySelector('#room-code-value').textContent = code; this.root.querySelector('#lobby-code').value = code; }
  setPlayers(players) { this.root.querySelector('#online-players').innerHTML = players.map((player) => `<span>${this.escape(player.nick)} · ${player.hero === 'hero2' ? 'Ⅱ' : 'Ⅰ'}</span>`).join(''); }
  escape(text) { return String(text).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character])); }

  draw(cameraTarget = { x: 0, z: 0 }) {
    const ctx = this.ctx; const size = this.map.width; const unit = (x, z) => [((x + HALF_MAP) / (HALF_MAP * 2)) * size, ((z + HALF_MAP) / (HALF_MAP * 2)) * size]; ctx.clearRect(0, 0, size, size);
    const background = ctx.createLinearGradient(0, 0, size, size); background.addColorStop(0, '#7d9b73'); background.addColorStop(1, '#596e5b'); ctx.fillStyle = background; ctx.fillRect(0, 0, size, size);
    GROVES.forEach((grove) => { const [x, y] = unit(grove.x, grove.z); ctx.beginPath(); ctx.fillStyle = grove.kind === 'dark' ? '#40574a' : '#4e7650'; ctx.ellipse(x, y, grove.radiusX / (HALF_MAP * 2) * size, grove.radiusZ / (HALF_MAP * 2) * size, 0, 0, Math.PI * 2); ctx.fill(); });
    [BASES.light, BASES.dark].forEach((base, index) => { const [x, y] = unit(base.x, base.z); ctx.beginPath(); ctx.fillStyle = index ? '#c9746c' : '#79c4c8'; ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#f6e8a9'; ctx.lineWidth = 3; ctx.stroke(); });
    const [px, py] = unit(cameraTarget.x, cameraTarget.z); ctx.beginPath(); ctx.fillStyle = '#fff3a8'; ctx.arc(px, py, 7, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#314b46'; ctx.lineWidth = 2; ctx.stroke(); ctx.strokeStyle = '#dfcb84'; ctx.lineWidth = 4; ctx.strokeRect(2, 2, size - 4, size - 4);
  }
}
