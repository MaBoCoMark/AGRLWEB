/**
 * CarEntity.js
 * Vehicle entity supporting both external GLTF/GLB models and a sleek built-in
 * procedural Octane-style chassis, suspension wheels, boost fire, and animations.
 */

import THREE from '../vendor/three.js';
import { OCTANE, TEAMS, TEAM_COLORS } from '../constants/GameConstants.js';

export class CarEntity {
  constructor(id = 0, team = TEAMS.BLUE) {
    this.id = id;
    this.team = team;
    this.group = new THREE.Group();
    this.group.name = `Car_${id}_Team_${team}`;

    this.color = team === TEAMS.BLUE ? TEAM_COLORS.BLUE : TEAM_COLORS.ORANGE;
    
    // Procedural chassis and wheels
    this.bodyMesh = null;
    this.wheels = [];
    this.boostFlame = null;

    this.createProceduralCar();
  }

  createProceduralCar() {
    const carMat = new THREE.MeshStandardMaterial({
      color: this.color,
      metalness: 0.6,
      roughness: 0.25,
    });

    const blackTrimMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      metalness: 0.8,
      roughness: 0.4,
    });

    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x111e2e,
      roughness: 0.1,
      metalness: 0.9,
    });

    const bodyGroup = new THREE.Group();

    // 1. Main Lower Chassis (Octane-proportioned wedge)
    const baseGeo = new THREE.BoxGeometry(OCTANE.WIDTH * 0.9, OCTANE.HEIGHT * 0.5, OCTANE.LENGTH * 0.9);
    const baseMesh = new THREE.Mesh(baseGeo, carMat);
    baseMesh.position.y = OCTANE.HEIGHT * 0.25;
    baseMesh.castShadow = true;
    bodyGroup.add(baseMesh);

    // 2. Cabin / Windshield
    const cabinGeo = new THREE.BoxGeometry(OCTANE.WIDTH * 0.65, OCTANE.HEIGHT * 0.45, OCTANE.LENGTH * 0.4);
    const cabinMesh = new THREE.Mesh(cabinGeo, glassMat);
    cabinMesh.position.set(0, OCTANE.HEIGHT * 0.6, -OCTANE.LENGTH * 0.05);
    cabinMesh.castShadow = true;
    bodyGroup.add(cabinMesh);

    // 3. Rear Engine / Intake scoop
    const scoopGeo = new THREE.BoxGeometry(OCTANE.WIDTH * 0.4, OCTANE.HEIGHT * 0.25, OCTANE.LENGTH * 0.25);
    const scoopMesh = new THREE.Mesh(scoopGeo, blackTrimMat);
    scoopMesh.position.set(0, OCTANE.HEIGHT * 0.5, -OCTANE.LENGTH * 0.35);
    bodyGroup.add(scoopMesh);

    // 4. Rear Wing / Spoiler
    const wingGeo = new THREE.BoxGeometry(OCTANE.WIDTH * 0.95, 4, 18);
    const wingMesh = new THREE.Mesh(wingGeo, carMat);
    wingMesh.position.set(0, OCTANE.HEIGHT * 0.85, -OCTANE.LENGTH * 0.42);
    bodyGroup.add(wingMesh);

    // 5. Twin Rocket Exhaust Thrusters
    const thrusterGeo = new THREE.CylinderGeometry(8, 11, 20, 16);
    thrusterGeo.rotateX(Math.PI / 2);
    const thrusterLeft = new THREE.Mesh(thrusterGeo, blackTrimMat);
    thrusterLeft.position.set(-18, OCTANE.HEIGHT * 0.3, -OCTANE.LENGTH * 0.45);
    const thrusterRight = thrusterLeft.clone();
    thrusterRight.position.x = 18;
    bodyGroup.add(thrusterLeft, thrusterRight);

    // 6. Boost Jet Flame (Cone with emissive glowing orange/yellow)
    const flameGeo = new THREE.ConeGeometry(12, 60, 16);
    flameGeo.rotateX(-Math.PI / 2);
    const flameMat = new THREE.MeshBasicMaterial({
      color: 0xffaa00,
      transparent: true,
      opacity: 0.85,
    });
    this.boostFlame = new THREE.Mesh(flameGeo, flameMat);
    this.boostFlame.position.set(0, OCTANE.HEIGHT * 0.3, -OCTANE.LENGTH * 0.48 - 30);
    this.boostFlame.visible = false;
    bodyGroup.add(this.boostFlame);

    // 7. 4 Wheels
    const wheelGeo = new THREE.CylinderGeometry(OCTANE.WHEEL_RADIUS, OCTANE.WHEEL_RADIUS, 18, 20);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.85 });

    const wheelOffsets = [
      [-OCTANE.WIDTH * 0.5, OCTANE.WHEEL_RADIUS * 0.8, OCTANE.LENGTH * 0.3],   // Front-Left
      [OCTANE.WIDTH * 0.5, OCTANE.WHEEL_RADIUS * 0.8, OCTANE.LENGTH * 0.3],    // Front-Right
      [-OCTANE.WIDTH * 0.52, OCTANE.WHEEL_RADIUS * 0.8, -OCTANE.LENGTH * 0.3], // Rear-Left
      [OCTANE.WIDTH * 0.52, OCTANE.WHEEL_RADIUS * 0.8, -OCTANE.LENGTH * 0.3],  // Rear-Right
    ];

    wheelOffsets.forEach((pos) => {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.position.set(pos[0], pos[1], pos[2]);
      wheel.castShadow = true;
      bodyGroup.add(wheel);
      this.wheels.push(wheel);
    });

    this.bodyMesh = bodyGroup;
    this.group.add(bodyGroup);
  }

  update(physX, physY, physZ, forwardVec, rightVec, upVec, isBoosting = false) {
    // Coordinate conversion: RL (X right, Y forward, Z up) -> Three.js (X right, Y up, Z forward)
    this.group.position.set(physX, physZ, physY);

    if (forwardVec && rightVec && upVec) {
      // RL Forward=(fx, fy, fz) -> Three.js (fx, fz, fy)
      const fwd = new THREE.Vector3(forwardVec[0], forwardVec[2], forwardVec[1]);
      const right = new THREE.Vector3(rightVec[0], rightVec[2], rightVec[1]);
      const up = new THREE.Vector3(upVec[0], upVec[2], upVec[1]);

      const rotMatrix = new THREE.Matrix4().makeBasis(right, up, fwd);
      this.group.quaternion.setFromRotationMatrix(rotMatrix);
    }

    // Toggle boost flames and jitter size
    if (this.boostFlame) {
      this.boostFlame.visible = isBoosting;
      if (isBoosting) {
        const jitter = 0.85 + Math.random() * 0.3;
        this.boostFlame.scale.set(jitter, jitter, jitter * 1.3);
      }
    }
  }

  addToScene(scene) {
    scene.add(this.group);
  }
}
