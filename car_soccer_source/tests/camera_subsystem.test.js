import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CameraController,
  CAMERA_INPUT_SIZE,
  CAMERA_POS_OFFSET,
  CAMERA_DIR_OFFSET,
  CAMERA_UP_OFFSET,
  CAMERA_FOV_OFFSET,
  TOTAL_VIEW_BUFFER_SIZE,
  CAMERA_FLAG_ON_GROUND,
  CAMERA_FLAG_GROUND_NORMAL,
  CAMERA_FLAG_VELOCITY,
  CAMERA_FLAG_SUPERSONIC,
  CAMERA_INPUT_INDICES,
  SimpleVector3,
  SimplePerspectiveCamera,
  setCameraThreeContext,
  cw,
  Aw,
  Sc,
  wc,
  Mc,
  lw
} from '../src/camera/CameraController.js';

test('1. Camera buffer constants match RocketSim C++ specifications', () => {
  assert.equal(CAMERA_INPUT_SIZE, 32);
  assert.equal(CAMERA_POS_OFFSET, 32);
  assert.equal(CAMERA_DIR_OFFSET, 35);
  assert.equal(CAMERA_UP_OFFSET, 38);
  assert.equal(CAMERA_FOV_OFFSET, 41);
  assert.equal(TOTAL_VIEW_BUFFER_SIZE, 42);

  // Bitmask flags
  assert.equal(CAMERA_FLAG_ON_GROUND, 1);
  assert.equal(CAMERA_FLAG_GROUND_NORMAL, 2);
  assert.equal(CAMERA_FLAG_VELOCITY, 4);
  assert.equal(CAMERA_FLAG_SUPERSONIC, 8);

  // Buffer input indices
  assert.equal(CAMERA_INPUT_INDICES.DT, 0);
  assert.equal(CAMERA_INPUT_INDICES.BALL_CAM, 1);
  assert.equal(CAMERA_INPUT_INDICES.CAR_POS_X, 2);
  assert.equal(CAMERA_INPUT_INDICES.CAR_QUAT_X, 5);
  assert.equal(CAMERA_INPUT_INDICES.BALL_POS_X, 9);
  assert.equal(CAMERA_INPUT_INDICES.FLAGS, 12);
  assert.equal(CAMERA_INPUT_INDICES.ON_GROUND, 13);
  assert.equal(CAMERA_INPUT_INDICES.GROUND_NORMAL_X, 14);
  assert.equal(CAMERA_INPUT_INDICES.VELOCITY_X, 17);
  assert.equal(CAMERA_INPUT_INDICES.SUPERSONIC, 20);
  assert.equal(CAMERA_INPUT_INDICES.FOV, 21);
  assert.equal(CAMERA_INPUT_INDICES.DISTANCE, 22);
  assert.equal(CAMERA_INPUT_INDICES.HEIGHT, 23);
  assert.equal(CAMERA_INPUT_INDICES.ANGLE_DEG, 24);
  assert.equal(CAMERA_INPUT_INDICES.STIFFNESS, 25);
  assert.equal(CAMERA_INPUT_INDICES.TRANSITION_SPEED, 26);
  assert.equal(CAMERA_INPUT_INDICES.ASPECT, 27);
  assert.equal(CAMERA_INPUT_INDICES.LOOK_X, 28);
  assert.equal(CAMERA_INPUT_INDICES.LOOK_Y, 29);
  assert.equal(CAMERA_INPUT_INDICES.SWIVEL_SPEED, 30);
  assert.equal(CAMERA_INPUT_INDICES.INVERT_SWIVEL, 31);
});

test('2. CameraController initialization and ballCam toggling', () => {
  let resetCalled = false;
  const mockKernel = {
    resetView() {
      resetCalled = true;
    },
    stepView(input) {
      const out = new Float64Array(42);
      out.set(input);
      return out;
    }
  };

  const controller = new CameraController(16 / 9, mockKernel);
  assert.equal(resetCalled, true, 'Kernel resetView should be called on construction');
  assert.equal(controller.ballCam, true, 'Ball Cam should be enabled by default');

  controller.ballCam = false;
  assert.equal(controller.ballCam, false);

  const toggled = controller.toggleBallCam();
  assert.equal(toggled, true);
  assert.equal(controller.ballCam, true);

  assert.equal(controller.input.length, 32);
  assert.ok(controller.direction instanceof SimpleVector3);
  assert.ok(controller.target instanceof SimpleVector3);
  assert.ok(controller.camera instanceof SimplePerspectiveCamera);
});

test('3. CameraController packs 32-float input and steps RocketSim kernel', () => {
  let capturedInput = null;
  const mockOutput = new Float64Array(42);
  // Position (X=100, Y=150, Z=200)
  mockOutput[32] = 100;
  mockOutput[33] = 150;
  mockOutput[34] = 200;
  // Direction (X=0, Y=-0.2, Z=0.98)
  mockOutput[35] = 0;
  mockOutput[36] = -0.2;
  mockOutput[37] = 0.98;
  // Up (X=0, Y=1, Z=0)
  mockOutput[38] = 0;
  mockOutput[39] = 1;
  mockOutput[40] = 0;
  // Dynamic FOV
  mockOutput[41] = 115;

  const mockKernel = {
    resetView() {},
    stepView(input) {
      capturedInput = new Float64Array(input);
      return mockOutput;
    }
  };

  const controller = new CameraController(16 / 9, mockKernel);

  const car = {
    position: { x: 10, y: 20, z: 30 },
    quaternion: { x: 0.1, y: 0.2, z: 0.3, w: 0.9 }
  };
  const ball = {
    position: { x: 50, y: 60, z: 70 }
  };
  const extra = {
    onGround: true,
    groundNormal: { x: 0, y: 1, z: 0 },
    velocity: { x: 500, y: 0, z: 1200 },
    supersonic: true,
    lookX: 0.5,
    lookY: -0.25
  };

  controller.ballCam = true;
  controller.update(car, ball, 0.016, extra);

  assert.ok(capturedInput !== null, 'Kernel stepView must be invoked');
  assert.equal(capturedInput[CAMERA_INPUT_INDICES.DT], 0.016);
  assert.equal(capturedInput[CAMERA_INPUT_INDICES.BALL_CAM], 1);
  assert.equal(capturedInput[CAMERA_INPUT_INDICES.CAR_POS_X], 10);
  assert.equal(capturedInput[CAMERA_INPUT_INDICES.CAR_POS_Y], 20);
  assert.equal(capturedInput[CAMERA_INPUT_INDICES.CAR_POS_Z], 30);
  assert.equal(capturedInput[CAMERA_INPUT_INDICES.CAR_QUAT_X], 0.1);
  assert.equal(capturedInput[CAMERA_INPUT_INDICES.CAR_QUAT_Y], 0.2);
  assert.equal(capturedInput[CAMERA_INPUT_INDICES.CAR_QUAT_Z], 0.3);
  assert.equal(capturedInput[CAMERA_INPUT_INDICES.CAR_QUAT_W], 0.9);

  assert.equal(capturedInput[CAMERA_INPUT_INDICES.BALL_POS_X], 50);
  assert.equal(capturedInput[CAMERA_INPUT_INDICES.BALL_POS_Y], 60);
  assert.equal(capturedInput[CAMERA_INPUT_INDICES.BALL_POS_Z], 70);

  // Bitmask: 1 (onGround) | 2 (groundNormal) | 4 (velocity) | 8 (supersonic) = 15
  assert.equal(capturedInput[CAMERA_INPUT_INDICES.FLAGS], 15);
  assert.equal(capturedInput[CAMERA_INPUT_INDICES.ON_GROUND], 1);
  assert.equal(capturedInput[CAMERA_INPUT_INDICES.GROUND_NORMAL_Y], 1);
  assert.equal(capturedInput[CAMERA_INPUT_INDICES.VELOCITY_X], 500);
  assert.equal(capturedInput[CAMERA_INPUT_INDICES.VELOCITY_Z], 1200);
  assert.equal(capturedInput[CAMERA_INPUT_INDICES.SUPERSONIC], 1);

  assert.equal(capturedInput[CAMERA_INPUT_INDICES.LOOK_X], 0.5);
  assert.equal(capturedInput[CAMERA_INPUT_INDICES.LOOK_Y], -0.25);

  // Verify camera received output from kernel
  assert.equal(controller.camera.position.x, 100);
  assert.equal(controller.camera.position.y, 150);
  assert.equal(controller.camera.position.z, 200);
  assert.equal(controller.direction.x, 0);
  assert.equal(controller.direction.y, -0.2);
  assert.equal(controller.direction.z, 0.98);
  assert.equal(controller.camera.up.x, 0);
  assert.equal(controller.camera.up.y, 1);
  assert.equal(controller.camera.up.z, 0);
  assert.equal(controller.camera.fov, 115);
});

test('4. Fallback view computation works smoothly without kernel', () => {
  const controller = new CameraController(16 / 9, null);
  const car = {
    position: { x: 0, y: 17, z: 0 },
    quaternion: { x: 0, y: 0, z: 0, w: 1 }
  };
  const ball = {
    position: { x: 0, y: 91, z: 500 }
  };

  // 4.1 Ball Cam fallback
  controller.ballCam = true;
  controller.update(car, ball, 0.016, { onGround: true });
  assert.ok(Number.isFinite(controller.camera.position.x));
  assert.ok(Number.isFinite(controller.camera.position.y));
  assert.ok(Number.isFinite(controller.camera.position.z));
  assert.ok(controller.camera.position.z < 0, 'Camera should be placed behind car facing ball');

  // 4.2 Follow Cam fallback
  controller.ballCam = false;
  controller.update(car, ball, 0.016, { onGround: true });
  assert.ok(Number.isFinite(controller.camera.position.z));
  assert.ok(controller.camera.position.z < 0, 'Camera should be behind car heading');
});

test('5. Resize updates camera aspect ratio', () => {
  const controller = new CameraController(16 / 9, null);
  controller.resize(1920, 1080);
  assert.ok(Math.abs(controller.camera.aspect - (1920 / 1080)) < 0.001);
});

test('6. Backward-compatibility aliases match expected symbols', () => {
  assert.equal(cw, CameraController);
  assert.equal(Aw, CAMERA_INPUT_SIZE);
  assert.equal(Sc, CAMERA_POS_OFFSET);
  assert.equal(wc, CAMERA_DIR_OFFSET);
  assert.equal(Mc, CAMERA_UP_OFFSET);
  assert.equal(lw, CAMERA_FOV_OFFSET);
});
