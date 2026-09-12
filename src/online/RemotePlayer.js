import * as THREE from 'three';

const palette = { hero1: { body: 0x4d8f91, accent: 0xffda74 }, hero2: { body: 0x8a5b92, accent: 0x9fe9dc } };

function nameTexture(name) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 70; const c = canvas.getContext('2d');
  c.fillStyle = 'rgba(11,25,25,.82)'; c.roundRect(5, 5, 502, 60, 18); c.fill(); c.strokeStyle = '#e6cd78'; c.lineWidth = 3; c.stroke(); c.fillStyle = '#fff1bd'; c.font = 'bold 28px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(name, 256, 35);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}

export class RemotePlayer {
  constructor(scene, data) {
    this.scene = scene; this.id = data.id; this.group = new THREE.Group(); this.group.name = `Friend ${data.nick}`; scene.add(this.group);
    this.target = new THREE.Vector3(data.x, .35, data.z); this.targetRotation = data.rotation || 0; this.hero = data.hero; this.build(data.nick, data.hero);
  }

  build(nick, hero) {
    const colors = palette[hero] || palette.hero1; const body = new THREE.Mesh(new THREE.CapsuleGeometry(.46, .92, 5, 8), new THREE.MeshToonMaterial({ color: colors.body })); body.position.y = 1.05; this.group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(.34, 10, 8), new THREE.MeshToonMaterial({ color: 0xd29a70 })); head.position.y = 1.9; this.group.add(head);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(.48, .5, 6), new THREE.MeshToonMaterial({ color: colors.accent })); crown.position.y = 2.27; this.group.add(crown);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.74, .045, 6, 20), new THREE.MeshBasicMaterial({ color: colors.accent, transparent: true, opacity: .82, depthWrite: false })); ring.rotation.x = Math.PI / 2; ring.position.y = .04; this.group.add(ring); this.ring = ring;
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTexture(nick), depthWrite: false, transparent: true })); label.position.y = 2.9; label.scale.set(2.2, .34, 1); this.group.add(label);
    this.group.position.copy(this.target);
  }

  setHero(hero) { if (hero === this.hero) return; this.hero = hero; this.group.children.forEach((child) => child.material?.color && child.material.color.setHex(palette[hero]?.body || palette.hero1.body)); }
  move(x, z, rotation) { this.target.set(x, .35, z); this.targetRotation = rotation || 0; }
  update(delta, elapsed) { this.group.position.lerp(this.target, 1 - Math.exp(-delta * 12)); this.group.rotation.y = THREE.MathUtils.lerp(this.group.rotation.y, this.targetRotation, 1 - Math.exp(-delta * 12)); this.group.position.y = this.target.y + Math.sin(elapsed * 3.5 + Number(this.id)) * .025; this.ring.material.opacity = .65 + Math.sin(elapsed * 3 + Number(this.id)) * .15; }
  destroy() { this.scene.remove(this.group); }
}
