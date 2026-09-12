import * as THREE from 'three';
import { addAtmosphere, createFireflies } from './Environment.js';
import { BASES, FORD, GROVES, HALF_MAP, LANES, MAP_SIZE, RIVER, TOWERS, distanceToPath } from './mapLayout.js';

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const solid = (color, roughness = .8, metalness = .04) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const toon = (color) => new THREE.MeshToonMaterial({ color });

function fadingToon(color, revealPosition) {
  const material = new THREE.MeshToonMaterial({ color, transparent: true, opacity: 1, depthWrite: false, alphaTest: .025 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.revealPosition = revealPosition;
    shader.vertexShader = `varying vec3 vRevealWorld;\n${shader.vertexShader}`;
    // Explicitly include instanceMatrix: the forest is InstancedMesh, so this is the real location of every tree.
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec4 revealWorldPosition = vec4( transformed, 1.0 );
      #ifdef USE_INSTANCING
        revealWorldPosition = instanceMatrix * revealWorldPosition;
      #endif
      vRevealWorld = ( modelMatrix * revealWorldPosition ).xyz;`);
    shader.fragmentShader = `uniform vec3 revealPosition; varying vec3 vRevealWorld;\n${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', `
      float revealDistance = distance(vRevealWorld.xz, revealPosition.xz);
      float revealAlpha = smoothstep(1.5, 4.4, revealDistance);
      gl_FragColor.a *= mix(.16, 1.0, revealAlpha);
      #include <dithering_fragment>`);
  };
  material.customProgramCacheKey = () => 'foliage-reveal-v1';
  return material;
}

function mesh(geometry, material, x = 0, y = 0, z = 0) {
  const item = new THREE.Mesh(geometry, material); item.position.set(x, y, z); item.castShadow = true; item.receiveShadow = true; return item;
}

function handPaintedTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256; const c = canvas.getContext('2d');
  const gradient = c.createLinearGradient(0, 0, 256, 256); gradient.addColorStop(0, '#91a779'); gradient.addColorStop(.48, '#718f68'); gradient.addColorStop(1, '#536f5b'); c.fillStyle = gradient; c.fillRect(0, 0, 256, 256);
  for (let y = 5; y < 256; y += 12) for (let x = 4; x < 256; x += 14) { const shift = Math.sin(x * 2.7 + y) * 2; c.fillStyle = `hsla(${75 + (x + y) % 20}, 46%, ${32 + (x * 3 + y) % 19}%, .2)`; c.beginPath(); c.ellipse(x + shift, y, 7, 3, .3, 0, Math.PI * 2); c.fill(); }
  const texture = new THREE.CanvasTexture(canvas); texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(10, 10); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 2; return texture;
}

function roadTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256; const c = canvas.getContext('2d'); c.fillStyle = '#a28d66'; c.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 31) for (let x = -28; x < 256; x += 48) { const offset = (y / 31 & 1) * 24; c.fillStyle = (x + y) % 3 ? '#c0aa78' : '#ad956a'; c.fillRect(x + offset + 2, y + 2, 43, 26); c.strokeStyle = '#715f49'; c.lineWidth = 2; c.strokeRect(x + offset + 2, y + 2, 43, 26); }
  const texture = new THREE.CanvasTexture(canvas); texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(1.6, 12); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 2; return texture;
}

/** A complete replacement for the prior map: planned, compact, bright and bridge-free. */
export class MapWorld {
  constructor(scene) {
    this.scene = scene; this.dynamic = []; this.colliders = []; this.treeMeshes = []; this.selectedTree = null; this.revealPosition = { value: new THREE.Vector3(999, 0, 999) }; this.particleGeometry = new THREE.SphereGeometry(.075, 6, 4); this.mapData = { river: RIVER, lanes: LANES, sanctums: [BASES.light, BASES.dark] }; 
    this.atmosphere = addAtmosphere(scene);
    this.createSafetyGround();
    this.createTerrain();
    this.createClouds();
    this.createBases();
    this.createGroves();
    this.createRockGardens();
    this.createFlowers();
    this.createGroundDecorations();
    this.createPerimeterForest();
    this.createBoundary();
    this.createTreeSelection();
    this.fireflies = createFireflies(scene);
  }

  createSafetyGround() {
    // An oversized fog-coloured ground skirt remains under the playable island, so no black void appears at map edges.
    const skirt = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshToonMaterial({ color: 0x5c8952 }));
    skirt.rotation.x = -Math.PI / 2; skirt.position.y = -2.15; skirt.receiveShadow = true; this.scene.add(skirt);
  }

  addCollider(x, z, radius) { const collider = { x, z, radius, disabled: false }; this.colliders.push(collider); return collider; }

  createTreeSelection() {
    this.treeSelection = new THREE.Group(); this.treeSelection.visible = false;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(.75, 20), new THREE.MeshBasicMaterial({ color: 0xe7c959, transparent: true, opacity: .2, depthWrite: false })); disc.rotation.x = -Math.PI / 2; this.treeSelection.add(disc);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.75, .06, 6, 24), new THREE.MeshBasicMaterial({ color: 0xffe47f, transparent: true, opacity: 1, depthWrite: false })); ring.rotation.x = Math.PI / 2; this.treeSelection.add(ring); this.treeSelectionRing = ring;
    const glow = new THREE.Mesh(new THREE.ConeGeometry(.48, 3.9, 6, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe36c, transparent: true, opacity: .2, depthWrite: false, side: THREE.DoubleSide })); glow.position.y = 1.9; this.treeSelection.add(glow); this.treeSelectionGlow = glow; this.scene.add(this.treeSelection);
  }

  setFoliageReveal(position) { this.revealPosition.value.set(position.x, 0, position.z); }

  treeFromHit(hit) {
    if (!hit?.object?.userData?.treeRecords || hit.instanceId === undefined) return null;
    const tree = hit.object.userData.treeRecords[hit.instanceId]; return tree?.alive ? tree : null;
  }

  selectTree(tree) {
    if (!tree?.alive) return false;
    // Highlight is a separate marker/glow, never a mutation of InstancedMesh colours.
    this.selectedTree = tree; this.treeSelection.position.set(tree.x, this.terrainHeight(tree.x, tree.z) + .11, tree.z); this.treeSelection.visible = true; return true;
  }

  chopTree(tree) {
    if (!tree?.alive) return false;
    tree.alive = false; tree.collider.disabled = true;
    const hidden = new THREE.Object3D(); hidden.position.set(tree.x, this.terrainHeight(tree.x, tree.z), tree.z); hidden.scale.setScalar(.001); hidden.updateMatrix();
    tree.meshes.forEach((item) => { item.setMatrixAt(tree.instance, hidden.matrix); item.instanceMatrix.needsUpdate = true; });
    if (this.selectedTree === tree) { this.selectedTree = null; this.treeSelection.visible = false; }
    // Leave a cartoon stump and a fallen log as feedback; both are decoration and fully walkable.
    const y = this.terrainHeight(tree.x, tree.z); const stump = mesh(new THREE.CylinderGeometry(.32 * tree.scale, .4 * tree.scale, .42 * tree.scale, 7), new THREE.MeshLambertMaterial({ color: 0x7a5034, flatShading: true }), tree.x, y + .21 * tree.scale, tree.z); this.scene.add(stump);
    const log = mesh(new THREE.CylinderGeometry(.24 * tree.scale, .31 * tree.scale, 2.35 * tree.scale, 7), new THREE.MeshLambertMaterial({ color: 0x845439, flatShading: true }), tree.x + Math.cos(tree.spin) * .8, y + .25 * tree.scale, tree.z + Math.sin(tree.spin) * .8); log.rotation.z = Math.PI / 2; log.rotation.y = tree.spin; this.scene.add(log);
    this.createFootstepSplash(tree.x, tree.z); return true;
  }

  resolveCharacterMove(position, dx, dz, radius = .55) {
    // Circle-vs-circle resolution pushes the hero smoothly along trunks/towers instead of the old hard stop.
    const result = { x: THREE.MathUtils.clamp(position.x + dx, -HALF_MAP + 3.2, HALF_MAP - 3.2), z: THREE.MathUtils.clamp(position.z + dz, -HALF_MAP + 3.2, HALF_MAP - 3.2) };
    const fallback = new THREE.Vector2(dx || .01, dz || .01).normalize();
    for (let pass = 0; pass < 3; pass++) {
      for (const circle of this.colliders) {
        if (circle.disabled) continue;
        const limit = circle.radius + radius; let ox = result.x - circle.x; let oz = result.z - circle.z; const distance = Math.hypot(ox, oz);
        if (distance >= limit) continue;
        if (distance < .0001) { ox = fallback.x; oz = fallback.y; }
        const scale = limit / Math.max(distance, .0001); result.x = circle.x + ox * scale; result.z = circle.z + oz * scale;
      }
      // Water is intentionally walkable everywhere. It is shallow and produces splash effects;
      // only trees, towers, bases and map borders block the hero.
    }
    result.x = THREE.MathUtils.clamp(result.x, -HALF_MAP + 3.2, HALF_MAP - 3.2); result.z = THREE.MathUtils.clamp(result.z, -HALF_MAP + 3.2, HALF_MAP - 3.2);
    return result;
  }

  terrainHeight(x, z) {
    const lane = Math.min(...LANES.map((path) => distanceToPath(x, z, path)));
    const rolling = Math.sin(x * .18) * .33 + Math.cos(z * .14) * .28 + Math.sin((x - z) * .08) * .22;
    const grade = Math.exp(-(lane * lane) / 5.3);
    return THREE.MathUtils.lerp(rolling, .04, grade * .88);
  }

  surfaceHeight(x, z) { return this.terrainHeight(x, z); }

  createTerrain() {
    const grid = 104; const geometry = new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE, grid, grid); geometry.rotateX(-Math.PI / 2);
    const position = geometry.attributes.position; const colors = new Float32Array(position.count * 3); const fresh = new THREE.Color(0x71916a); const dark = new THREE.Color(0x625f69); const meadow = new THREE.Color(0xa0ab75);
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i); const z = position.getZ(i); const y = this.terrainHeight(x, z); position.setY(i, y);
      const darkSide = THREE.MathUtils.clamp(((x + z) - 5) / 75, 0, 1); const color = fresh.clone().lerp(meadow, Math.max(0, y) * .28 + ((i * 17) % 9) * .008); color.lerp(dark, darkSide * .42); colors.set([color.r, color.g, color.b], i * 3);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3)); geometry.computeVertexNormals();
    this.terrain = mesh(geometry, new THREE.MeshToonMaterial({ map: handPaintedTexture(), vertexColors: true })); this.terrain.name = 'Cartoon valley terrain'; this.scene.add(this.terrain);
  }

  createClouds() {
    const cloudMaterial = new THREE.MeshToonMaterial({ color: 0xf8f6dc, transparent: true, opacity: .9, depthWrite: false });
    [[-35, 28, 26], [18, 36, 31], [43, -8, 24], [-5, -42, 30]].forEach(([x, z, y], index) => {
      const group = new THREE.Group(); group.position.set(x, y, z); group.rotation.y = index * .65;
      for (let puff = 0; puff < 4; puff++) { const sphere = mesh(new THREE.IcosahedronGeometry(2.1 - (puff & 1) * .3, 1), cloudMaterial, (puff - 1.5) * 1.5, Math.sin(puff * 2) * .45, (puff & 1) * .35); sphere.scale.y = .55; group.add(sphere); }
      this.scene.add(group);
    });
  }

  ribbon(points, radius, material, y, segments = 96) {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => v3(p.x, 0, p.z))); const geometry = new THREE.TubeGeometry(curve, segments, radius, 8, false); const strip = mesh(geometry, material); strip.position.y = y; strip.scale.y = .045; this.scene.add(strip); return strip;
  }

  createRiverAndFord() {
    this.ribbon(RIVER, 3.2, solid(0x837b57, 1), -.19, 120);
    this.waterMaterial = new THREE.MeshToonMaterial({ color: 0x4d91a1, transparent: true, opacity: .9 }); this.ribbon(RIVER, 2.7, this.waterMaterial, -.08, 120);
    // A shallow, paved ford sits on the ground. It is deliberately not a bridge.
    const ford = new THREE.Group(); ford.position.set(FORD.x, .19, FORD.z); ford.rotation.y = FORD.angle;
    const fordStone = solid(0xc3b083, .86); for (let row = -2; row <= 2; row++) for (let column = -3; column <= 3; column++) { const tile = mesh(new THREE.CylinderGeometry(.52, .61, .15, 6), fordStone, column * .74 + (row & 1) * .13, .02, row * .7); tile.rotation.y = (column + row) * .23; ford.add(tile); }
    this.scene.add(ford);
    // Moving soft highlights make the river direction visible without expensive texture simulation.
    this.riverCurve = new THREE.CatmullRomCurve3(RIVER.map((point) => v3(point.x, .015, point.z)));
    const glintMaterial = new THREE.MeshBasicMaterial({ color: 0xd6f4e8, transparent: true, opacity: .34, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 13; i++) { const glint = mesh(new THREE.PlaneGeometry(.82, .12), glintMaterial.clone(), 0, .045, 0); glint.rotation.x = -Math.PI / 2; this.scene.add(glint); this.dynamic.push({ type: 'flow', mesh: glint, offset: i / 13, width: .62 + (i % 3) * .16 }); }
    const foam = new THREE.Mesh(new THREE.TorusGeometry(2.25, .07, 6, 26), new THREE.MeshBasicMaterial({ color: 0xe6eee0, transparent: true, opacity: .58, depthWrite: false })); foam.rotation.x = Math.PI / 2; foam.position.set(FORD.x, .13, FORD.z); this.scene.add(foam); this.dynamic.push({ type: 'foam', mesh: foam });
  }

  createFootstepSplash(x, z) {
    // Cartoon dust puff on every second step.
    const count = 4; const material = new THREE.MeshBasicMaterial({ color: 0xb8a77d, transparent: true, opacity: .42, depthWrite: false });
    for (let i = 0; i < count; i++) {
      const particle = new THREE.Mesh(this.particleGeometry, material.clone()); particle.position.set(x, this.terrainHeight(x, z) + .16, z);
      const angle = i / count * Math.PI * 2 + Math.random() * .25; const velocity = new THREE.Vector3(Math.cos(angle) * (.35 + Math.random() * .45), .25 + Math.random() * .2, Math.sin(angle) * (.35 + Math.random() * .45));
      this.scene.add(particle); this.dynamic.push({ type: 'particle', mesh: particle, velocity, life: .35, maxLife: .35 });
    }
  }

  createLanes() {
    const edge = toon(0x536a55); const paving = new THREE.MeshToonMaterial({ map: roadTexture(), color: 0xd3bd91 });
    LANES.forEach((lane) => { this.ribbon(lane, 2.34, edge, .12); this.ribbon(lane, 1.93, paving, .17); });
  }

  createBases() { this.createBase(BASES.light, 'light'); this.createBase(BASES.dark, 'dark'); }

  createBase(base, side) {
    const group = new THREE.Group(); group.position.set(base.x, this.terrainHeight(base.x, base.z), base.z); group.name = base.title; const stone = solid(side === 'light' ? 0x7f9c78 : 0x665460, .78, .12);
    group.add(mesh(new THREE.CylinderGeometry(5.6, 6.2, .65, 8), stone, 0, .33, 0));
    group.add(mesh(new THREE.CylinderGeometry(4.45, 4.75, .12, 8), new THREE.MeshToonMaterial({ color: base.color }), 0, .72, 0));
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + .38; const turret = mesh(new THREE.ConeGeometry(.42, 2.6, 5), stone, Math.cos(a) * 3.55, 1.8, Math.sin(a) * 3.55); turret.rotation.z = Math.cos(a) * .08; group.add(turret); }
    const core = mesh(new THREE.OctahedronGeometry(1.36, 1), new THREE.MeshToonMaterial({ color: base.glow, emissive: base.color, emissiveIntensity: 1.8 }), 0, 2.4, 0); group.add(core); const light = new THREE.PointLight(base.color, 5.2, 16, 2); light.position.y = 2.4; group.add(light); this.scene.add(group); this.addCollider(base.x, base.z, 1.5); this.dynamic.push({ type: 'core', mesh: core, baseY: core.position.y, phase: side === 'light' ? 0 : 2 });
  }

  createTowers() { TOWERS.forEach((tower, index) => this.createTower(tower, index)); }

  createTower({ x, z, team }, index) {
    const bright = team === 'light'; const accent = bright ? 0x6ae4f5 : 0xff7a71; const wall = toon(bright ? 0x72987e : 0x655365); const base = toon(bright ? 0x405d4c : 0x3f3544); const group = new THREE.Group(); group.position.set(x, this.terrainHeight(x, z), z);
    group.add(mesh(new THREE.CylinderGeometry(1.45, 1.75, .42, 7), base, 0, .21, 0)); group.add(mesh(new THREE.CylinderGeometry(.74, 1.03, 3.6, 7), wall, 0, 2.05, 0)); group.add(mesh(new THREE.ConeGeometry(1.18, 1.2, 7), base, 0, 4.42, 0));
    for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; group.add(mesh(new THREE.BoxGeometry(.3, .48, .3), wall, Math.cos(a) * .89, 4.38, Math.sin(a) * .89)); }
    const orb = mesh(new THREE.SphereGeometry(.26, 10, 8), new THREE.MeshToonMaterial({ color: accent, emissive: accent, emissiveIntensity: 1.5 }), 0, 4.88, 0); group.add(orb); const light = new THREE.PointLight(accent, 1.7, 6, 2); light.position.y = 4.8; group.add(light); this.scene.add(group); this.addCollider(x, z, 1.45); this.dynamic.push({ type: 'core', mesh: orb, baseY: orb.position.y, phase: index });
  }

  createGroves() {
    GROVES.forEach((grove) => {
      const sectors = new Map();
      // Smaller dense forest pocket: enough cover, but more open ground and fewer draw calls.
      for (let row = -3; row <= 3; row++) for (let column = -3; column <= 3; column++) {
        if ((row * row) / 11 + (column * column) / 13 > 1 || (row === 0 && column === 0)) continue;
        const x = grove.x + column * 2.02 + (row & 1) * .62; const z = grove.z + row * 1.9; const scale = .72 + ((row + column + 10) % 4) * .1;
        const key = `${Math.floor((row + 3) / 3)}:${Math.floor((column + 3) / 3)}`; if (!sectors.has(key)) sectors.set(key, []);
        // Collider is just the visible trunk, not the whole leafy crown.
        const tree = { x, z, scale, spin: (row * 7 + column * 11) * .16, alive: true }; tree.collider = this.addCollider(x, z, .22 * scale); sectors.get(key).push(tree);
      }
      const dark = grove.kind === 'dark';
      for (const trees of sectors.values()) {
        // Fixed materials are the most reliable path on mobile InstancedMesh rendering.
        const materials = [
          new THREE.MeshBasicMaterial({ color: dark ? 0x624938 : 0x79583b, transparent: true, opacity: 1, depthWrite: false, fog: false, toneMapped: false }),
          new THREE.MeshBasicMaterial({ color: dark ? 0x315941 : 0x397347, transparent: true, opacity: 1, depthWrite: false, fog: false, toneMapped: false }),
          new THREE.MeshBasicMaterial({ color: dark ? 0x557256 : 0x6e965d, transparent: true, opacity: 1, depthWrite: false, fog: false, toneMapped: false }),
        ];
        const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(.17, .29, 2.65, 8), materials[0], trees.length);
        const low = new THREE.InstancedMesh(new THREE.ConeGeometry(1.28, 2.35, 8), materials[1], trees.length);
        const high = new THREE.InstancedMesh(new THREE.ConeGeometry(.86, 1.92, 8), materials[2], trees.length); const dummy = new THREE.Object3D(); let centerX = 0; let centerZ = 0;
        trees.forEach((tree, index) => {
          centerX += tree.x; centerZ += tree.z; const y = this.terrainHeight(tree.x, tree.z); dummy.position.set(tree.x, y + 1.02 * tree.scale, tree.z); dummy.rotation.set(0, tree.spin, 0); dummy.scale.set(tree.scale * .8, tree.scale * 1.12, tree.scale * .8); dummy.updateMatrix(); trunk.setMatrixAt(index, dummy.matrix);
          dummy.position.set(tree.x, y + 2.45 * tree.scale, tree.z); dummy.rotation.set(0, tree.spin, 0); dummy.scale.set(tree.scale, tree.scale * .9, tree.scale); dummy.updateMatrix(); low.setMatrixAt(index, dummy.matrix);
          dummy.position.set(tree.x, y + 3.55 * tree.scale, tree.z); dummy.scale.setScalar(tree.scale * .72); dummy.updateMatrix(); high.setMatrixAt(index, dummy.matrix);
        });
        const meshes = [trunk, low, high];
        trees.forEach((tree, index) => { tree.instance = index; tree.meshes = meshes; });
        meshes.forEach((item) => { item.castShadow = true; item.receiveShadow = true; item.instanceMatrix.needsUpdate = true; item.userData.treeRecords = trees; this.treeMeshes.push(item); this.scene.add(item); });
        this.dynamic.push({ type: 'foliage', materials, x: centerX / trees.length, z: centerZ / trees.length });
      }
    });
  }

  createRockGardens() {
    const placements = [[-22, 30], [-14, 17], [-31, 13], [-24, -23], [2, 27], [14, -22], [28, -17], [33, 12], [8, 18], [-2, -33]];
    const count = placements.length * 5; const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 1), toon(0x7b806e), count); const dummy = new THREE.Object3D();
    let index = 0;
    placements.forEach(([cx, cz], garden) => {
      // Rock gardens are decorative: they must never trap or block the player.
      for (let i = 0; i < 5; i++) { const a = i * 2.51 + garden; const r = .45 + i * .3; const x = cx + Math.cos(a) * r; const z = cz + Math.sin(a) * r; const scale = .22 + (i % 3) * .16; dummy.position.set(x, this.terrainHeight(x, z) + scale * .35, z); dummy.rotation.set(i * .4, a, i * .2); dummy.scale.set(scale * 1.35, scale, scale); dummy.updateMatrix(); rocks.setMatrixAt(index++, dummy.matrix); }
    });
    rocks.castShadow = true; rocks.receiveShadow = true; rocks.instanceMatrix.needsUpdate = true; this.scene.add(rocks);
  }

  createFlowers() {
    const positions = []; const colors = []; const palette = [new THREE.Color(0xffdf75), new THREE.Color(0xff89b0), new THREE.Color(0x98e886)];
    GROVES.filter((grove) => grove.kind === 'light').forEach((grove, zone) => { for (let i = 0; i < 22; i++) { const a = i * 2.4; const r = 3 + (i % 5) * .61; const x = grove.x + Math.cos(a) * r; const z = grove.z + Math.sin(a) * r; positions.push(x, this.terrainHeight(x, z) + .11, z); const c = palette[(i + zone) % palette.length]; colors.push(c.r, c.g, c.b); } });
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); const flowers = new THREE.Points(geometry, new THREE.PointsMaterial({ size: .27, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: .9 })); this.scene.add(flowers);
  }

  createGroundDecorations() {
    // A few repeated low-poly props add life without loading any textures or separate models.
    const shrubs = []; const mushrooms = []; const grass = []; const logs = []; const crystals = []; 
    GROVES.forEach((grove, zone) => {
      for (let i = 0; i < 22; i++) {
        const angle = i * 2.399 + zone; const radius = 3.2 + (i % 5) * .62; const x = grove.x + Math.cos(angle) * radius; const z = grove.z + Math.sin(angle) * radius * .78;
        shrubs.push({ x, z, scale: .18 + (i % 4) * .07 });
      }
      for (let i = 0; i < 8; i++) { const angle = i * 2.77 + zone; const x = grove.x + Math.cos(angle) * (2.1 + i % 3); const z = grove.z + Math.sin(angle) * (2.1 + i % 3); mushrooms.push({ x, z, scale: .1 + (i % 3) * .035, dark: grove.kind === 'dark' }); }
      // Visual only props: fallen logs and small crystals add detail but have no collision.
      for (let i = 0; i < 3; i++) { const angle = zone * 1.8 + i * 2.1; logs.push({ x: grove.x + Math.cos(angle) * 4.7, z: grove.z + Math.sin(angle) * 4, angle, scale: .72 + i * .13 }); }
      for (let i = 0; i < 4; i++) { const angle = zone + i * 1.57; crystals.push({ x: grove.x + Math.cos(angle) * 5.5, z: grove.z + Math.sin(angle) * 4.5, scale: .13 + (i % 2) * .05, dark: grove.kind === 'dark' }); }
    });
    for (let i = 0; i < 260; i++) { const x = -37 + ((i * 29) % 71); const z = -36 + ((i * 47) % 69); grass.push({ x, z, scale: .55 + (i % 4) * .12 }); }
    const dummy = new THREE.Object3D();
    const shrubMesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0x5f8253, flatShading: true }), shrubs.length);
    shrubs.forEach((item, index) => { dummy.position.set(item.x, this.terrainHeight(item.x, item.z) + item.scale * .7, item.z); dummy.rotation.set(0, index * .7, 0); dummy.scale.set(item.scale * 1.45, item.scale, item.scale * 1.25); dummy.updateMatrix(); shrubMesh.setMatrixAt(index, dummy.matrix); });
    const grassMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(.16, .64, 4), new THREE.MeshLambertMaterial({ color: 0x6f925c, flatShading: true }), grass.length);
    grass.forEach((item, index) => { dummy.position.set(item.x, this.terrainHeight(item.x, item.z) + .32 * item.scale, item.z); dummy.rotation.set(0, index * 1.9, 0); dummy.scale.set(item.scale, item.scale, item.scale); dummy.updateMatrix(); grassMesh.setMatrixAt(index, dummy.matrix); });
    const stemMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(.07, .09, .32, 6), new THREE.MeshLambertMaterial({ color: 0xe7d9b0 }), mushrooms.length);
    const capMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(.18, 7, 5, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xca7070, flatShading: true }), mushrooms.length);
    const logMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(.24, .31, 2.2, 7), new THREE.MeshLambertMaterial({ color: 0x795033, flatShading: true }), logs.length);
    const crystalMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(.32, 1.15, 5), new THREE.MeshBasicMaterial({ color: 0x8fcfb9, transparent: true, opacity: .82 }), crystals.length);
    mushrooms.forEach((item, index) => { const y = this.terrainHeight(item.x, item.z); dummy.position.set(item.x, y + .16 * item.scale / .1, item.z); dummy.scale.setScalar(item.scale / .1); dummy.updateMatrix(); stemMesh.setMatrixAt(index, dummy.matrix); dummy.position.y += .18 * item.scale / .1; dummy.updateMatrix(); capMesh.setMatrixAt(index, dummy.matrix); });
    logs.forEach((item, index) => { const y = this.terrainHeight(item.x, item.z); dummy.position.set(item.x, y + .27 * item.scale, item.z); dummy.rotation.set(Math.PI / 2, item.angle, 0); dummy.scale.set(item.scale, item.scale, item.scale); dummy.updateMatrix(); logMesh.setMatrixAt(index, dummy.matrix); });
    crystals.forEach((item, index) => { const y = this.terrainHeight(item.x, item.z); dummy.position.set(item.x, y + .55 * item.scale / .13, item.z); dummy.rotation.set(0, index * .9, 0); dummy.scale.setScalar(item.scale / .13); dummy.updateMatrix(); crystalMesh.setMatrixAt(index, dummy.matrix); });
    [shrubMesh, grassMesh, stemMesh, capMesh, logMesh, crystalMesh].forEach((item) => { item.castShadow = true; item.receiveShadow = true; item.instanceMatrix.needsUpdate = true; this.scene.add(item); });
  }

  createPerimeterForest() {
    // Three staggered rows make a continuous natural wall, hiding every edge and corner of the playable valley.
    const locations = [];
    const addSide = (horizontal, sign) => {
      for (let row = 0; row < 3; row++) for (let i = -17; i <= 17; i++) {
        const along = i * 2.55 + (row % 2) * 1.16; const inset = 40.5 - row * 2.05;
        const x = horizontal ? along : sign * inset; const z = horizontal ? sign * inset : along;
        locations.push({ x, z, scale: 1.14 + ((i * 17 + row * 7 + (sign > 0 ? 1 : 4)) % 5 + 5) % 5 * .12, spin: (i * .37 + row) });
      }
    };
    addSide(true, -1); addSide(true, 1); addSide(false, -1); addSide(false, 1);
    const trunkMaterial = new THREE.MeshBasicMaterial({ color: 0x684b36, fog: false, toneMapped: false });
    const lowerMaterial = new THREE.MeshBasicMaterial({ color: 0x326246, fog: false, toneMapped: false });
    const topMaterial = new THREE.MeshBasicMaterial({ color: 0x5e875a, fog: false, toneMapped: false });
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(.22, .39, 3.25, 7), trunkMaterial, locations.length);
    const lower = new THREE.InstancedMesh(new THREE.ConeGeometry(1.62, 2.85, 8), lowerMaterial, locations.length);
    const top = new THREE.InstancedMesh(new THREE.ConeGeometry(1.12, 2.38, 8), topMaterial, locations.length); const dummy = new THREE.Object3D();
    locations.forEach((tree, index) => {
      const y = this.terrainHeight(tree.x, tree.z); dummy.position.set(tree.x, y + 1.4 * tree.scale, tree.z); dummy.rotation.set(0, tree.spin, 0); dummy.scale.set(tree.scale * .82, tree.scale * 1.18, tree.scale * .82); dummy.updateMatrix(); trunk.setMatrixAt(index, dummy.matrix);
      dummy.position.set(tree.x, y + 3.05 * tree.scale, tree.z); dummy.scale.setScalar(tree.scale); dummy.updateMatrix(); lower.setMatrixAt(index, dummy.matrix);
      dummy.position.set(tree.x, y + 4.45 * tree.scale, tree.z); dummy.scale.setScalar(tree.scale * .76); dummy.updateMatrix(); top.setMatrixAt(index, dummy.matrix);
    });
    [trunk, lower, top].forEach((item) => { item.castShadow = true; item.receiveShadow = true; item.instanceMatrix.needsUpdate = true; this.scene.add(item); });
  }

  createBoundary() {
    const material = toon(0x56634d); const count = 56; const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), material, count); const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) { const side = i % 4; const t = (i % 14) / 13; const x = side < 2 ? -42 + t * 84 : (side === 2 ? -42 : 42); const z = side < 2 ? (side === 0 ? -42 : 42) : -42 + t * 84; const scale = 1.3 + (i % 4) * .32; dummy.position.set(x, this.terrainHeight(x, z) + scale * .45, z); dummy.rotation.set(i * .4, i * .71, 0); dummy.scale.set(scale, scale * 1.4, scale); dummy.updateMatrix(); rocks.setMatrixAt(i, dummy.matrix); }
    rocks.castShadow = true; rocks.receiveShadow = true; rocks.instanceMatrix.needsUpdate = true; this.scene.add(rocks);
  }

  update(elapsed, delta = 1 / 60) {
    this.fireflies.rotation.y = elapsed * .018;
    if (this.treeSelection.visible) { this.treeSelectionRing.rotation.z += delta * 2.2; const pulse = 1 + Math.sin(elapsed * 5) * .08; this.treeSelection.scale.setScalar(pulse); }
    for (let index = this.dynamic.length - 1; index >= 0; index--) {
      const item = this.dynamic[index];
      if (item.type === 'foliage') {
        // Only the 3×3-tree sector nearest the hero fades; distant forest stays completely visible.
        const distance = Math.hypot(this.revealPosition.value.x - item.x, this.revealPosition.value.z - item.z);
        const opacity = .14 + THREE.MathUtils.smoothstep(distance, 2.1, 5.3) * .86;
        item.materials.forEach((material) => { material.opacity = opacity; });
      } else if (item.type === 'flow') {
        const t = (item.offset + elapsed * .055) % 1; const point = this.riverCurve.getPointAt(t); const tangent = this.riverCurve.getTangentAt(t); item.mesh.position.set(point.x, .045, point.z); item.mesh.rotation.set(-Math.PI / 2, -Math.atan2(tangent.z, tangent.x), 0); item.mesh.scale.x = item.width * (1 + Math.sin(elapsed * 3 + item.offset * 10) * .15);
      } else if (item.type === 'foam') {
        item.mesh.rotation.z += delta * .32; const scale = 1 + Math.sin(elapsed * 3.2) * .07; item.mesh.scale.setScalar(scale);
      } else if (item.type === 'particle') {
        item.life -= delta; item.velocity.y -= 3.8 * delta; item.mesh.position.addScaledVector(item.velocity, delta); item.mesh.scale.setScalar(Math.max(0, item.life / item.maxLife)); item.mesh.material.opacity = Math.max(0, item.life / item.maxLife) * .75;
        if (item.life <= 0) { this.scene.remove(item.mesh); item.mesh.material.dispose(); this.dynamic.splice(index, 1); }
      } else { item.mesh.rotation.y += .012; item.mesh.position.y = item.baseY + Math.sin(elapsed * 2 + item.phase) * .06; }
    }
  }
}
