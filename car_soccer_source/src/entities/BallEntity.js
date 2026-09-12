/**
 * BallEntity.js
 * Visual representation of the soccer ball with procedural geometry,
 * ground projection indicator ring, and speed trails.
 */

import * as THREE from 'three';
import { BALL } from '../constants/GameConstants.js';

export class BallEntity {
  constructor(radius = BALL.RADIUS) {
    this.radius = radius;
    this.group = new THREE.Group();
    this.group.name = 'BallGroup';

    // 1. Ball Mesh (Procedural soccer ball with segments)
    this.mesh = this.createProceduralBallMesh();
    this.group.add(this.mesh);

    // 2. Ground Indicator Ring (Shows where the ball is on the pitch)
    const ringGeo = new THREE.RingGeometry(this.radius * 0.9, this.radius * 1.05, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.groundRing = new THREE.Mesh(ringGeo, ringMat);
    this.groundRing.position.y = 2; // Hover slightly above turf

    // 3. Height indicator ring (scales with height)
    const heightRingGeo = new THREE.RingGeometry(this.radius * 0.4, this.radius * 0.5, 32);
    heightRingGeo.rotateX(-Math.PI / 2);
    const heightRingMat = new THREE.MeshBasicMaterial({
      color: 0xffaa00,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.heightRing = new THREE.Mesh(heightRingGeo, heightRingMat);
    this.heightRing.position.y = 2.5;

    // Temporary vectors
    this.targetPos = new THREE.Vector3();
    this.currentPos = new THREE.Vector3();
  }

  createProceduralBallMesh() {
    const geo = new THREE.SphereGeometry(this.radius, 32, 24);
    
    // Canvas texture for classic soccer pentagon pattern
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, 512, 256);

    // Draw dark hexagonal patches
    ctx.fillStyle = '#1c1c22';
    const drawHex = (x, y, r) => {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i * 60 * Math.PI) / 180;
        const px = x + r * Math.cos(a);
        const py = y + r * Math.sin(a);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    };

    for (let x = 40; x < 512; x += 100) {
      for (let y = 30; y < 256; y += 80) {
        drawHex(x, y, 22);
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;

    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.35,
      metalness: 0.15,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  update(physX, physY, physZ, dt = 1 / 60) {
    // Coordinate conversion: RL (X right, Y forward, Z up) -> Three.js (X right, Y up, Z forward)
    this.targetPos.set(physX, physZ, physY);
    this.group.position.copy(this.targetPos);

    // Update ground indicator ring position
    this.groundRing.position.x = this.targetPos.x;
    this.groundRing.position.z = this.targetPos.z;

    this.heightRing.position.x = this.targetPos.x;
    this.heightRing.position.z = this.targetPos.z;
    const height = Math.max(0, this.targetPos.y - this.radius);
    const scale = Math.max(0.2, 1.0 - Math.min(height / 1800, 0.8));
    this.heightRing.scale.set(scale, scale, scale);

    // Simple ball roll based on displacement
    const dx = this.targetPos.x - this.currentPos.x;
    const dz = this.targetPos.z - this.currentPos.z;
    if (Math.abs(dx) > 0.1 || Math.abs(dz) > 0.1) {
      this.mesh.rotation.z -= dx / this.radius;
      this.mesh.rotation.x += dz / this.radius;
    }
    this.currentPos.copy(this.targetPos);
  }

  addToScene(scene) {
    scene.add(this.group);
    scene.add(this.groundRing);
    scene.add(this.heightRing);
  }
}
