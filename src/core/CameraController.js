import * as THREE from 'three';

/** Lightweight orbit controller written for touch first; no external control plugin. */
export class CameraController {
  constructor(camera, domElement) {
    this.camera = camera; this.domElement = domElement;
    this.target = new THREE.Vector3(0, 0, 0); this.desiredTarget = new THREE.Vector3(0, 0, 0);
    // Lower, closer camera makes the environment feel like a 3D game world rather than a board.
    this.azimuth = .72; this.desiredAzimuth = .72;
    this.polar = 1.01; this.desiredPolar = 1.01;
    this.radius = 40; this.desiredRadius = 40;
    this.pointers = new Map(); this.lastPinchDistance = 0;
    this.isInteracting = false;
    this.bind(); this.update(1);
  }

  bind() {
    this.domElement.addEventListener('pointerdown', (event) => { this.domElement.setPointerCapture(event.pointerId); this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); this.lastPinchDistance = this.pinchDistance(); this.isInteracting = true; });
    this.domElement.addEventListener('pointermove', (event) => {
      const previous = this.pointers.get(event.pointerId); if (!previous) return;
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.pointers.size === 1) {
        this.desiredAzimuth -= (event.clientX - previous.x) * .008;
        this.desiredPolar = THREE.MathUtils.clamp(this.desiredPolar + (event.clientY - previous.y) * .006, .55, 1.3);
      } else if (this.pointers.size === 2) {
        const distance = this.pinchDistance(); if (this.lastPinchDistance) this.desiredRadius = THREE.MathUtils.clamp(this.desiredRadius * (this.lastPinchDistance / distance), 30, 78); this.lastPinchDistance = distance;
      }
    });
    const release = (event) => { this.pointers.delete(event.pointerId); this.lastPinchDistance = this.pinchDistance(); if (!this.pointers.size) this.isInteracting = false; };
    this.domElement.addEventListener('pointerup', release); this.domElement.addEventListener('pointercancel', release);
    this.domElement.addEventListener('wheel', (event) => { event.preventDefault(); this.desiredRadius = THREE.MathUtils.clamp(this.desiredRadius + event.deltaY * .045, 48, 118); }, { passive: false });
  }

  pinchDistance() { const points = [...this.pointers.values()]; return points.length < 2 ? 0 : Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y); }

  focus(x, z) { this.desiredTarget.set(x, 0, z); }

  follow(position) { if (!this.isInteracting) this.desiredTarget.set(position.x, 0, position.z); }

  reset() { this.desiredAzimuth = .72; this.desiredPolar = 1.01; this.desiredRadius = 40; }

  update(delta) {
    const smoothing = 1 - Math.exp(-delta * 9);
    this.target.lerp(this.desiredTarget, smoothing);
    this.azimuth = THREE.MathUtils.lerp(this.azimuth, this.desiredAzimuth, smoothing);
    this.polar = THREE.MathUtils.lerp(this.polar, this.desiredPolar, smoothing);
    this.radius = THREE.MathUtils.lerp(this.radius, this.desiredRadius, smoothing);
    const sin = Math.sin(this.polar);
    this.camera.position.set(this.target.x + this.radius * sin * Math.sin(this.azimuth), this.target.y + this.radius * Math.cos(this.polar), this.target.z + this.radius * sin * Math.cos(this.azimuth));
    this.camera.lookAt(this.target.x, this.target.y, this.target.z);
  }
}
