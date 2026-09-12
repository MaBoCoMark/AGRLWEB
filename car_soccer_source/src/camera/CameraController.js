/**
 * CameraController.js
 * Flexible 3rd-person follow camera and Ball-Cam for Rocket League style vehicle gameplay.
 */

import * as THREE from 'three';

export class CameraController {
  constructor(aspect = window.innerWidth / window.innerHeight) {
    this.fov = 110;
    this.distance = 270;
    this.height = 90;
    this.pitchDeg = -4;
    this.stiffness = 1.0;
    this.swivelSpeed = 10;
    this.transitionSpeed = 1.9;

    this.ballCam = true; // Ball Cam enabled by default
    this.camera = new THREE.PerspectiveCamera(this.fov, aspect, 1, 60000);

    // Coordinate positions
    this.currentPosition = new THREE.Vector3(0, 90, -270);
    this.targetPosition = new THREE.Vector3();
    this.lookAtTarget = new THREE.Vector3();
    this.currentLookAt = new THREE.Vector3();

    // Damping buffers
    this.tempV1 = new THREE.Vector3();
    this.tempV2 = new THREE.Vector3();
  }

  toggleBallCam() {
    this.ballCam = !this.ballCam;
    return this.ballCam;
  }

  update(carObject, ballObject, dt = 1 / 60, lookOffset = { x: 0, y: 0 }) {
    if (!carObject) return;

    const carPos = carObject.position;
    const carQuat = carObject.quaternion;

    if (this.ballCam && ballObject) {
      // Ball Cam: Place camera behind car relative to the ball vector
      const toBall = this.tempV1.subVectors(ballObject.position, carPos);
      const distToBall = toBall.length();
      toBall.y = 0; // Flatten direction on ground
      if (toBall.lengthSq() > 0.001) toBall.normalize();

      // Position camera opposite to ball direction
      this.targetPosition.copy(carPos)
        .addScaledVector(toBall, -this.distance)
        .add(new THREE.Vector3(0, this.height, 0));

      // Look slightly above ball
      this.lookAtTarget.copy(ballObject.position);
      this.lookAtTarget.y = Math.max(this.lookAtTarget.y, 40);
    } else {
      // Follow Cam: Place camera directly behind the car's heading
      const forward = this.tempV1.set(0, 0, 1).applyQuaternion(carQuat);
      forward.y = 0;
      if (forward.lengthSq() > 0.001) forward.normalize();

      this.targetPosition.copy(carPos)
        .addScaledVector(forward, -this.distance)
        .add(new THREE.Vector3(0, this.height, 0));

      this.lookAtTarget.copy(carPos)
        .addScaledVector(forward, 200)
        .add(new THREE.Vector3(0, 30, 0));
    }

    // Swivel / manual look offset
    if (lookOffset.x !== 0 || lookOffset.y !== 0) {
      this.targetPosition.x += lookOffset.x * 12 * this.swivelSpeed;
      this.targetPosition.y += lookOffset.y * 6 * this.swivelSpeed;
    }

    // Smooth camera motion
    const lerpFactor = 1 - Math.exp(-15 * dt * this.stiffness * (this.transitionSpeed / 1.5));
    this.currentPosition.lerp(this.targetPosition, Math.min(lerpFactor, 0.99));
    this.currentLookAt.lerp(this.lookAtTarget, Math.min(lerpFactor, 0.99));

    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(this.currentLookAt);
  }

  resize(width, height) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}
