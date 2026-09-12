import * as THREE from 'three';
import { VoiceLines } from './VoiceLines.js';
import { CameraController } from './CameraController.js';
import { MapWorld } from '../world/MapWorld.js';
import { PlayerCharacter } from '../world/PlayerCharacter.js';
import { OnlineClient } from '../online/OnlineClient.js';
import { RemotePlayer } from '../online/RemotePlayer.js';
import { MapHUD } from '../ui/MapHUD.js';

export class MapApplication {
  constructor(root) {
    this.root = root; this.clock = new THREE.Clock(); this.minimapTimer = 0; this.raycaster = new THREE.Raycaster(); this.pointer = new THREE.Vector2(); this.fullscreenRequested = false;
    this.hud = new MapHUD(root, { reset: () => this.camera?.reset(), focus: (x, z) => this.camera?.focus(x, z), chooseHero: (heroId) => { this.player?.setHero(heroId); this.voice?.setHero(heroId); this.online?.setHero(heroId); }, connect: (nick, hero, lobby) => this.connectOnline(nick, hero, lobby) });
    this.canvas = root.querySelector('#scene');
    // Android accepts fullscreen only from a real user gesture, so request it on the first tap.
    this.root.addEventListener('pointerdown', () => this.enterFullscreen(), { once: true, capture: true });
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = .98; this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene(); this.scene.fog = null;
    this.camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, .1, 280);
    this.world = new MapWorld(this.scene);
    this.voice = new VoiceLines();
    const playerGround = (x, z) => {
      const baseDistance = Math.hypot(x + 32, z + 29);
      const platformHeight = baseDistance < 4.7 ? .76 : Math.max(0, 1.2 - baseDistance * .1);
      return this.world.surfaceHeight(x, z) + platformHeight;
    };
    // Spawn on the bright sanctuary platform, just clear of the central crystal.
    this.player = new PlayerCharacter(this.scene, playerGround, -34.7, -27.3, (position, dx, dz, radius) => this.world.resolveCharacterMove(position, dx, dz, radius), (x, z) => this.world.createFootstepSplash(x, z));
    this.remotePlayers = new Map();
    this.online = new OnlineClient({
      position: () => this.player.position,
      status: (message) => this.hud.setOnlineStatus(message, /подключён/i.test(message)),
      lobby: (code) => this.hud.setRoom(code),
      players: (players) => this.syncPlayers(players),
      playerJoined: (player) => this.upsertRemote(player),
      playerLeft: (id) => this.removeRemote(id),
      playerMove: (message) => this.remotePlayers.get(message.id)?.move(message.x, message.z, message.rotation),
      playerHero: (message) => this.remotePlayers.get(message.id)?.setHero(message.hero),
      voice: (message) => this.voice.playRemote(message.hero, message.index),
    });
    this.voice = new VoiceLines({ onPlay: (line) => this.online.sendVoice(line.hero, line.index) });
    this.camera = new CameraController(this.camera, this.canvas);
    this.resize();
    this.bindPlayerInput();
    this.bindGroundCommands();
    window.addEventListener('resize', () => this.resize());
    this.frame();
  }

  connectOnline(nick, hero, lobby) { this.online.connect(nick, hero, lobby); }

  syncPlayers(players) {
    const visible = new Set(); players.forEach((player) => { if (player.id === this.online.id) return; visible.add(player.id); this.upsertRemote(player); });
    for (const id of this.remotePlayers.keys()) if (!visible.has(id)) this.removeRemote(id);
    this.hud.setPlayers(players);
  }

  upsertRemote(data) { if (data.id === this.online.id) return; let remote = this.remotePlayers.get(data.id); if (!remote) { remote = new RemotePlayer(this.scene, data); this.remotePlayers.set(data.id, remote); } else { remote.move(data.x, data.z, data.rotation); remote.setHero(data.hero); } }
  removeRemote(id) { const remote = this.remotePlayers.get(id); if (remote) { remote.destroy(); this.remotePlayers.delete(id); } }

  async enterFullscreen() {
    if (this.fullscreenRequested) return; this.fullscreenRequested = true;
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      if (screen.orientation?.lock) await screen.orientation.lock('landscape').catch(() => {});
    } catch (error) { console.info('Полный экран недоступен в этом браузере:', error); }
  }

  resize() { this.camera.camera.aspect = window.innerWidth / window.innerHeight; this.camera.camera.updateProjectionMatrix(); this.renderer.setSize(window.innerWidth, window.innerHeight, false); }

  bindPlayerInput() {
    this.keys = new Set();
    const updateKeys = () => {
      const left = this.keys.has('KeyA') || this.keys.has('ArrowLeft'); const right = this.keys.has('KeyD') || this.keys.has('ArrowRight');
      const forward = this.keys.has('KeyW') || this.keys.has('ArrowUp'); const backward = this.keys.has('KeyS') || this.keys.has('ArrowDown');
      this.setPlayerInput((right ? 1 : 0) - (left ? 1 : 0), (forward ? 1 : 0) - (backward ? 1 : 0));
    };
    window.addEventListener('keydown', (event) => { if (!['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) return; event.preventDefault(); this.keys.add(event.code); updateKeys(); });
    window.addEventListener('keyup', (event) => { this.keys.delete(event.code); updateKeys(); });
    window.addEventListener('blur', () => { this.keys.clear(); updateKeys(); });
  }

  setPlayerInput(horizontal, forward) {
    const offset = this.camera.camera.position.clone().sub(this.player.position); offset.y = 0; offset.normalize();
    const cameraForward = offset.multiplyScalar(-1); const cameraRight = new THREE.Vector3(cameraForward.z, 0, -cameraForward.x);
    const direction = cameraRight.multiplyScalar(horizontal).addScaledVector(cameraForward, forward);
    this.player.setInput(direction.x, direction.z);
  }

  bindGroundCommands() {
    let press = null;
    this.canvas.addEventListener('pointerdown', (event) => { this.voice.unlock(this.clock.elapsedTime); press = { x: event.clientX, y: event.clientY, time: performance.now() }; });
    this.canvas.addEventListener('pointerup', (event) => {
      if (!press || performance.now() - press.time > 450 || Math.hypot(event.clientX - press.x, event.clientY - press.y) > 12) return;
      const rect = this.canvas.getBoundingClientRect(); this.pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1); this.raycaster.setFromCamera(this.pointer, this.camera.camera);
      const now = this.clock.elapsedTime; this.voice.unlock(now);
      const treeHit = this.raycaster.intersectObjects(this.world.treeMeshes, false)[0]; const tree = this.world.treeFromHit(treeHit);
      if (tree) {
        if (this.world.selectedTree === tree) { if (this.world.chopTree(tree)) this.voice.play(now, true); }
        else { this.world.selectTree(tree); this.voice.play(now, true); }
      } else {
        const hit = this.raycaster.intersectObject(this.world.terrain, false)[0]; if (hit) { this.player.moveTo(hit.point); this.voice.play(now, true); }
      }
      press = null;
    });
  }

  frame() {
    requestAnimationFrame(() => this.frame());
    const delta = Math.min(.05, this.clock.getDelta()); const elapsed = this.clock.elapsedTime;
    this.player.update(delta, elapsed); this.world.setFoliageReveal(this.player.position); this.camera.follow(this.player.position); this.camera.update(delta); this.world.update(elapsed, delta); this.voice.update(elapsed); this.online.update(elapsed, this.player); this.remotePlayers.forEach((remote) => remote.update(delta, elapsed));
    this.minimapTimer += delta;
    if (this.minimapTimer > .12) { this.hud.draw(this.camera.target); this.minimapTimer = 0; }
    this.renderer.render(this.scene, this.camera.camera);
  }
}
