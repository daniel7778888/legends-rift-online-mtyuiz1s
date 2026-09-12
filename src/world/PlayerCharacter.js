import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
// Models are embedded as data URLs: index.html works directly without fetch/CORS issues.
import playerAsset from '../assets/player.glb';
import playerTwoAsset from '../assets/player-two.glb';

const HERO_ASSETS = { hero1: playerAsset, hero2: playerTwoAsset };

const clamp = THREE.MathUtils.clamp;

function dampAngle(current, target, amount) {
  let delta = (target - current + Math.PI) % (Math.PI * 2) - Math.PI;
  return current + delta * amount;
}

/** User GLB + direct input. The supplied file has no rig, so its motion is stylised procedurally. */
export class PlayerCharacter {
  constructor(scene, terrainHeight, x, z, resolveMove = null, onStep = null) {
    this.scene = scene; this.terrainHeight = terrainHeight; this.resolveMove = resolveMove; this.onStep = onStep;
    this.speed = 8.1; this.input = new THREE.Vector2(); this.velocity = new THREE.Vector2(); this.destination = null; this.facing = -Math.PI / 4; this.moving = false; this.lastStep = -1; this.heroId = 'hero1'; this.loadToken = 0;
    this.root = new THREE.Group(); this.root.name = 'Player character'; this.root.position.set(x, terrainHeight(x, z), z); scene.add(this.root);
    this.model = null; this.mixer = null; this.modelBasePosition = new THREE.Vector3(); this.baseScale = 1; this.orderTime = 0;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.22, .065, 8, 36), new THREE.MeshBasicMaterial({ color: 0xffdc72, transparent: true, opacity: .9, depthWrite: false }));
    ring.rotation.x = Math.PI / 2; ring.position.y = .06; this.root.add(ring); this.ring = ring;
    // Big high-contrast command decal: it stays visible on grass, road and water banks.
    this.orderMarker = new THREE.Group(); this.orderMarker.visible = false;
    const decal = new THREE.Mesh(new THREE.CircleGeometry(1.08, 28), new THREE.MeshBasicMaterial({ color: 0xff9d36, transparent: true, opacity: .28, depthWrite: false })); decal.rotation.x = -Math.PI / 2; this.orderMarker.add(decal);
    const orderRing = new THREE.Mesh(new THREE.TorusGeometry(1.02, .075, 8, 28), new THREE.MeshBasicMaterial({ color: 0xffffad, transparent: true, opacity: 1, depthWrite: false })); orderRing.rotation.x = Math.PI / 2; this.orderMarker.add(orderRing); this.orderRing = orderRing;
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; const arrow = new THREE.Mesh(new THREE.ConeGeometry(.12, .34, 3), new THREE.MeshBasicMaterial({ color: 0xffffcf, transparent: true, opacity: 1, depthWrite: false })); arrow.position.set(Math.cos(a) * 1.45, .07, Math.sin(a) * 1.45); arrow.rotation.set(Math.PI / 2, 0, -a); this.orderMarker.add(arrow); }
    scene.add(this.orderMarker);
    const light = new THREE.PointLight(0xffdd83, 1.35, 5.5, 2); light.position.y = 2.1; this.root.add(light);
    this.load(this.heroId);
  }

  setHero(heroId) {
    if (!HERO_ASSETS[heroId] || heroId === this.heroId) return;
    this.heroId = heroId; this.load(heroId);
  }

  load(heroId) {
    const token = ++this.loadToken;
    if (this.mixer) { this.mixer.stopAllAction(); this.mixer = null; }
    if (this.model) { this.root.remove(this.model); this.model.traverse((node) => { if (node.isMesh) { node.geometry?.dispose(); node.material?.dispose(); } }); this.model = null; }
    new GLTFLoader().load(HERO_ASSETS[heroId], (gltf) => {
      if (token !== this.loadToken) return;
      const model = gltf.scene; const bounds = new THREE.Box3().setFromObject(model); const size = bounds.getSize(new THREE.Vector3()); const center = bounds.getCenter(new THREE.Vector3());
      this.baseScale = 3.35 / Math.max(size.y, .01);
      model.scale.setScalar(this.baseScale);
      model.position.set(-center.x * this.baseScale, -bounds.min.y * this.baseScale, -center.z * this.baseScale);
      // GLB's forward axis already points along the movement direction.
      model.rotation.y = 0;
      this.modelBasePosition.copy(model.position);
      model.traverse((node) => {
        if (!node.isMesh) return;
        const source = Array.isArray(node.material) ? node.material[0] : node.material;
        node.material = new THREE.MeshToonMaterial({ map: source?.map ?? null, color: source?.color ?? 0xffffff, transparent: Boolean(source?.transparent), alphaTest: source?.alphaTest ?? 0, side: source?.side ?? THREE.FrontSide });
        node.castShadow = true; node.receiveShadow = true;
      });
      this.root.add(model); this.model = model;
      if (gltf.animations.length) { this.mixer = new THREE.AnimationMixer(model); this.mixer.clipAction(gltf.animations[0]).play(); }
    }, undefined, (error) => console.warn('Не удалось загрузить GLB персонажа:', error));
  }

  setInput(x, z) { this.input.set(x, z); if (this.input.lengthSq() > 1) this.input.normalize(); if (this.input.lengthSq() > .002) { this.destination = null; this.orderMarker.visible = false; } }

  moveTo(point) {
    this.destination = new THREE.Vector3(point.x, 0, point.z);
    this.orderMarker.position.set(point.x, this.terrainHeight(point.x, point.z) + .12, point.z);
    this.orderMarker.visible = true; this.orderTime = 0;
  }

  update(delta, elapsed) {
    const desired = this.input.clone();
    if (desired.lengthSq() < .002 && this.destination) {
      desired.set(this.destination.x - this.root.position.x, this.destination.z - this.root.position.z);
      if (desired.length() < .28) { desired.set(0, 0); this.destination = null; this.orderMarker.visible = false; } else desired.normalize();
    }
    const inputLength = desired.length();
    const targetVelocity = desired.multiplyScalar(this.speed);
    this.velocity.lerp(targetVelocity, 1 - Math.exp(-delta * (inputLength ? 12 : 16)));
    const wantsToMove = this.velocity.lengthSq() > .18;
    if (wantsToMove) {
      const oldX = this.root.position.x; const oldZ = this.root.position.z;
      const resolved = this.resolveMove ? this.resolveMove(this.root.position, this.velocity.x * delta, this.velocity.y * delta, .58) : { x: clamp(oldX + this.velocity.x * delta, -56, 56), z: clamp(oldZ + this.velocity.y * delta, -56, 56) };
      this.root.position.x = resolved.x; this.root.position.z = resolved.z;
      this.moving = Math.hypot(resolved.x - oldX, resolved.z - oldZ) > .002;
      if (this.moving) this.facing = dampAngle(this.facing, Math.atan2(this.velocity.x, this.velocity.y), 1 - Math.exp(-delta * 13));
      else this.velocity.multiplyScalar(.55);
    } else this.moving = false;
    if (this.moving) { const stepId = Math.floor(elapsed * 3.25); if (stepId !== this.lastStep) { this.lastStep = stepId; this.onStep?.(this.root.position.x, this.root.position.z); } }
    this.root.position.y = this.terrainHeight(this.root.position.x, this.root.position.z) + (this.moving ? Math.sin(elapsed * 11) * .025 : Math.sin(elapsed * 2.1) * .04);
    this.root.rotation.y = this.facing;
    const step = this.moving ? Math.sin(elapsed * 10) : Math.sin(elapsed * 2.1);
    this.ring.material.opacity = this.moving ? .92 : .62 + (step + 1) * .14;
    this.ring.scale.setScalar(this.moving ? .94 + Math.abs(step) * .08 : 1);
    if (this.orderMarker.visible) { this.orderTime += delta; const pulse = 1 + Math.sin(this.orderTime * 7) * .13; this.orderRing.rotation.z += delta * 2.8; this.orderMarker.scale.setScalar(pulse); this.orderMarker.children.forEach((part) => { if (part.material) part.material.opacity = this.orderTime < .5 ? 1 : .78 + Math.sin(elapsed * 5) * .2; }); }
    if (this.mixer) this.mixer.update(delta);
    if (this.model) {
      // Procedural idle/run animation for this particular GLB, which contains no skeleton or clips.
      const bob = this.moving ? Math.abs(step) * .13 : Math.sin(elapsed * 2.2) * .035;
      this.model.rotation.z = this.moving ? step * .065 : Math.sin(elapsed * 2.1) * .02;
      this.model.rotation.x = this.moving ? -.055 + Math.cos(elapsed * 10) * .025 : Math.sin(elapsed * 1.5) * .012;
      this.model.position.set(this.modelBasePosition.x, this.modelBasePosition.y + bob, this.modelBasePosition.z);
      this.model.scale.set(this.baseScale * (this.moving ? 1 - Math.abs(step) * .035 : 1), this.baseScale * (1 + (this.moving ? Math.abs(step) * .065 : Math.sin(elapsed * 2.1) * .018)), this.baseScale * (this.moving ? 1 - Math.abs(step) * .035 : 1));
    }
  }

  get position() { return this.root.position; }
}
