/**
 * ArenaEntity.js
 * Visual representation of the Soccar Stadium, featuring the striped pitch,
 * field markings, goal posts, translucent boundary walls, and interactive Boost Pads.
 */

import THREE from '../vendor/three.js';
import { ARENA, BOOST_PADS } from '../constants/GameConstants.js';

export class ArenaEntity {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'ArenaGroup';
    this.padMeshes = [];

    this.buildPitch();
    this.buildWalls();
    this.buildGoals();
    this.buildBoostPads();
  }

  buildPitch() {
    // Pitch dimensions: ARENA.WIDTH x ARENA.LENGTH
    const pitchGeo = new THREE.PlaneGeometry(ARENA.WIDTH, ARENA.LENGTH);
    pitchGeo.rotateX(-Math.PI / 2);

    // Canvas procedural striped turf texture with white field lines
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');

    // Alternating green grass stripes
    const numStripes = 16;
    const stripeH = 1024 / numStripes;
    for (let i = 0; i < numStripes; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#1b4d24' : '#225d2c';
      ctx.fillRect(0, i * stripeH, 1024, stripeH);
    }

    // White field boundary line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 14;
    ctx.strokeRect(30, 30, 964, 964);

    // Center line
    ctx.beginPath();
    ctx.moveTo(30, 512);
    ctx.lineTo(994, 512);
    ctx.stroke();

    // Center circle
    ctx.beginPath();
    ctx.arc(512, 512, 100, 0, Math.PI * 2);
    ctx.stroke();

    // Penalty boxes
    ctx.strokeRect(312, 30, 400, 180);
    ctx.strokeRect(312, 814, 400, 180);

    const turfTexture = new THREE.CanvasTexture(canvas);
    const turfMat = new THREE.MeshStandardMaterial({
      map: turfTexture,
      roughness: 0.85,
      metalness: 0.1,
    });

    const pitchMesh = new THREE.Mesh(pitchGeo, turfMat);
    pitchMesh.receiveShadow = true;
    this.group.add(pitchMesh);
  }

  buildWalls() {
    const halfW = ARENA.WIDTH / 2;
    const halfL = ARENA.LENGTH / 2;
    const h = ARENA.HEIGHT;

    const wallMat = new THREE.MeshBasicMaterial({
      color: 0x224488,
      transparent: true,
      opacity: 0.15,
      side: THREE.DoubleSide,
      wireframe: true,
    });

    // Side walls (+X and -X)
    const sideGeo = new THREE.PlaneGeometry(ARENA.LENGTH, h);
    const wallLeft = new THREE.Mesh(sideGeo, wallMat);
    wallLeft.position.set(-halfW, h / 2, 0);
    wallLeft.rotation.y = Math.PI / 2;

    const wallRight = new THREE.Mesh(sideGeo, wallMat);
    wallRight.position.set(halfW, h / 2, 0);
    wallRight.rotation.y = -Math.PI / 2;

    // End walls (+Z and -Z)
    const endGeo = new THREE.PlaneGeometry(ARENA.WIDTH, h);
    const wallOrange = new THREE.Mesh(endGeo, wallMat);
    wallOrange.position.set(0, h / 2, halfL);

    const wallBlue = new THREE.Mesh(endGeo, wallMat);
    wallBlue.position.set(0, h / 2, -halfL);

    // Ceiling (+Y)
    const ceilGeo = new THREE.PlaneGeometry(ARENA.WIDTH, ARENA.LENGTH);
    ceilGeo.rotateX(Math.PI / 2);
    const ceiling = new THREE.Mesh(ceilGeo, wallMat);
    ceiling.position.y = h;

    this.group.add(wallLeft, wallRight, wallOrange, wallBlue, ceiling);
  }

  buildGoals() {
    const gw = ARENA.GOAL_WIDTH;
    const gh = ARENA.GOAL_HEIGHT;
    const gd = ARENA.GOAL_DEPTH;
    const halfL = ARENA.LENGTH / 2;

    const createGoalNet = (color, zPos, zRot) => {
      const g = new THREE.Group();
      
      // Goal frame posts (Cylinders)
      const postMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, metalness: 0.8, roughness: 0.2 });
      const postGeo = new THREE.CylinderGeometry(14, 14, gh, 16);
      
      const leftPost = new THREE.Mesh(postGeo, postMat);
      leftPost.position.set(-gw / 2, gh / 2, 0);
      const rightPost = new THREE.Mesh(postGeo, postMat);
      rightPost.position.set(gw / 2, gh / 2, 0);

      // Crossbar
      const barGeo = new THREE.CylinderGeometry(14, 14, gw, 16);
      barGeo.rotateZ(Math.PI / 2);
      const crossbar = new THREE.Mesh(barGeo, postMat);
      crossbar.position.set(0, gh, 0);

      // Net interior box
      const netMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.35,
        wireframe: true,
      });
      const netGeo = new THREE.BoxGeometry(gw, gh, gd);
      const netMesh = new THREE.Mesh(netGeo, netMat);
      netMesh.position.set(0, gh / 2, gd / 2);

      g.add(leftPost, rightPost, crossbar, netMesh);
      g.position.set(0, 0, zPos);
      g.rotation.y = zRot;
      return g;
    };

    const blueGoal = createGoalNet(0x0077ff, -halfL, 0);
    const orangeGoal = createGoalNet(0xff6600, halfL, Math.PI);
    this.group.add(blueGoal, orangeGoal);
  }

  buildBoostPads() {
    const bigPadGeo = new THREE.CylinderGeometry(80, 90, 8, 24);
    const bigMat = new THREE.MeshStandardMaterial({
      color: 0xffaa00,
      emissive: 0xff6600,
      emissiveIntensity: 0.6,
      metalness: 0.7,
      roughness: 0.3,
    });

    const smallPadGeo = new THREE.CylinderGeometry(35, 40, 6, 16);
    const smallMat = new THREE.MeshStandardMaterial({
      color: 0xffcc00,
      emissive: 0x886600,
      emissiveIntensity: 0.4,
      metalness: 0.7,
      roughness: 0.3,
    });

    BOOST_PADS.forEach((pad, idx) => {
      // RL coordinates: (X right, Y forward, Z up) -> Three.js (X, Z, Y)
      const mesh = new THREE.Mesh(pad.isBig ? bigPadGeo : smallPadGeo, pad.isBig ? bigMat : smallMat);
      mesh.position.set(pad.pos[0], 4, pad.pos[1]);
      mesh.receiveShadow = true;

      // Add hovering glowing pill / orb above big pads
      if (pad.isBig) {
        const orbGeo = new THREE.SphereGeometry(25, 16, 16);
        const orbMat = new THREE.MeshBasicMaterial({ color: 0xffdd00, wireframe: true });
        const orb = new THREE.Mesh(orbGeo, orbMat);
        orb.position.y = 40;
        mesh.add(orb);
      }

      this.group.add(mesh);
      this.padMeshes.push({ mesh, isBig: pad.isBig, index: idx });
    });
  }

  updatePads(padsData) {
    if (!padsData || !padsData.length) return;
    padsData.forEach((pad, idx) => {
      const pm = this.padMeshes[idx];
      if (pm) {
        pm.mesh.visible = pad.isActive;
      }
    });
  }

  addToScene(scene) {
    scene.add(this.group);
  }
}
