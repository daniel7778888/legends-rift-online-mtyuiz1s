import * as THREE from 'three';

export function addAtmosphere(scene) {
  // A single soft background colour avoids visible gradient banding/stripes on mobile displays.
  scene.background = new THREE.Color(0xaec7c3);
  const hemi = new THREE.HemisphereLight(0xdfe9e1, 0x62745c, 1.55); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffeed0, 1.55); sun.position.set(-28, 48, 18); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.left = -48; sun.shadow.camera.right = 48; sun.shadow.camera.top = 48; sun.shadow.camera.bottom = -48; sun.shadow.bias = -.00025; scene.add(sun);
  const fill = new THREE.DirectionalLight(0xa6c8cf, .4); fill.position.set(35, 20, -28); scene.add(fill);
  return { sun };
}

export function createFireflies(scene) {
  const count = 52; const positions = new Float32Array(count * 3); const colors = new Float32Array(count * 3); const color = new THREE.Color();
  for (let i = 0; i < count; i++) { const a = i * 2.4; const r = 4 + (i % 16) * 1.7; positions.set([Math.cos(a) * r, .7 + (i % 5) * .15, Math.sin(a * 1.13) * r], i * 3); color.setHSL(i % 3 ? .14 : .42, .48, .72); colors.set([color.r, color.g, color.b], i * 3); }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3)); geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3)); const particles = new THREE.Points(geometry, new THREE.PointsMaterial({ size: .12, vertexColors: true, transparent: true, opacity: .58, depthWrite: false, sizeAttenuation: true })); scene.add(particles); return particles;
}
