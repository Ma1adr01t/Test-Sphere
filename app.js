import * as THREE from "three";

const canvas = document.getElementById("gameCanvas");
const enableMotionButton = document.getElementById("enableMotionButton");
const resetButton = document.getElementById("resetButton");
const statusText = document.getElementById("status");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111827);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);

camera.position.set(0, 7, 8);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true
});

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
directionalLight.position.set(4, 8, 5);
scene.add(directionalLight);

const floorSize = 12;

const floorGeometry = new THREE.PlaneGeometry(floorSize, floorSize, 12, 12);
const floorMaterial = new THREE.MeshStandardMaterial({
  color: 0x1f2937,
  roughness: 0.9,
  metalness: 0.05,
  side: THREE.DoubleSide
});

const floor = new THREE.Mesh(floorGeometry, floorMaterial);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const grid = new THREE.GridHelper(floorSize, 12, 0x6b7280, 0x374151);
grid.position.y = 0.01;
scene.add(grid);

const ballRadius = 0.55;

const ballGeometry = new THREE.IcosahedronGeometry(ballRadius, 2);
const ballMaterial = new THREE.MeshStandardMaterial({
  color: 0x60a5fa,
  roughness: 0.65,
  metalness: 0.1,
  flatShading: true
});

const ball = new THREE.Mesh(ballGeometry, ballMaterial);
ball.position.set(0, ballRadius, 0);
scene.add(ball);

const boundaryMaterial = new THREE.MeshStandardMaterial({
  color: 0x374151,
  roughness: 0.8
});

const wallThickness = 0.2;
const wallHeight = 0.45;

function makeWall(x, z, width, depth) {
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(width, wallHeight, depth),
    boundaryMaterial
  );

  wall.position.set(x, wallHeight / 2, z);
  scene.add(wall);
}

makeWall(0, -floorSize / 2, floorSize, wallThickness);
makeWall(0, floorSize / 2, floorSize, wallThickness);
makeWall(-floorSize / 2, 0, wallThickness, floorSize);
makeWall(floorSize / 2, 0, wallThickness, floorSize);

const state = {
  motionEnabled: false,
  tiltX: 0,
  tiltZ: 0,
  velocityX: 0,
  velocityZ: 0,
  positionX: 0,
  positionZ: 0,
  lastTime: performance.now()
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function resetBall() {
  state.velocityX = 0;
  state.velocityZ = 0;
  state.positionX = 0;
  state.positionZ = 0;
  state.tiltX = 0;
  state.tiltZ = 0;

  ball.position.set(0, ballRadius, 0);
  ball.rotation.set(0, 0, 0);
}

function handleMotion(event) {
  const acceleration = event.accelerationIncludingGravity;

  if (!acceleration) {
    return;
  }

  const rawX = acceleration.x || 0;
  const rawY = acceleration.y || 0;

  /*
    Portrait iPhone mapping:
    rawX controls left/right tilt.
    rawY controls forward/back tilt.

    The signs below are chosen to feel natural:
    tilt right rolls right, tilt top away rolls forward.
  */
  state.tiltX = clamp(rawX / 9.8, -1, 1);
  state.tiltZ = clamp(rawY / 9.8, -1, 1);
}

async function enableMotionControls() {
  try {
    if (
      typeof DeviceMotionEvent !== "undefined" &&
      typeof DeviceMotionEvent.requestPermission === "function"
    ) {
      const permission = await DeviceMotionEvent.requestPermission();

      if (permission !== "granted") {
        statusText.textContent = "Motion permission was denied.";
        return;
      }
    }

    window.addEventListener("devicemotion", handleMotion, true);

    state.motionEnabled = true;
    statusText.textContent = "Motion controls enabled. Tilt your iPhone.";
  } catch (error) {
    console.error(error);
    statusText.textContent =
      "Could not enable motion controls. Make sure this is running over HTTPS on an iPhone.";
  }
}

function updatePhysics(deltaSeconds) {
  const accelerationStrength = 14;
  const friction = 0.965;
  const maxSpeed = 7;
  const playableLimit = floorSize / 2 - ballRadius - wallThickness;

  state.velocityX += state.tiltX * accelerationStrength * deltaSeconds;
  state.velocityZ += state.tiltZ * accelerationStrength * deltaSeconds;

  state.velocityX *= friction;
  state.velocityZ *= friction;

  state.velocityX = clamp(state.velocityX, -maxSpeed, maxSpeed);
  state.velocityZ = clamp(state.velocityZ, -maxSpeed, maxSpeed);

  state.positionX += state.velocityX * deltaSeconds;
  state.positionZ += state.velocityZ * deltaSeconds;

  if (state.positionX < -playableLimit || state.positionX > playableLimit) {
    state.positionX = clamp(state.positionX, -playableLimit, playableLimit);
    state.velocityX *= -0.45;
  }

  if (state.positionZ < -playableLimit || state.positionZ > playableLimit) {
    state.positionZ = clamp(state.positionZ, -playableLimit, playableLimit);
    state.velocityZ *= -0.45;
  }

  ball.position.x = state.positionX;
  ball.position.z = state.positionZ;

  const rollAmountX = state.velocityZ * deltaSeconds / ballRadius;
  const rollAmountZ = -state.velocityX * deltaSeconds / ballRadius;

  ball.rotation.x += rollAmountX;
  ball.rotation.z += rollAmountZ;
}

function animate(currentTime) {
  requestAnimationFrame(animate);

  const deltaSeconds = Math.min(
    (currentTime - state.lastTime) / 1000,
    1 / 30
  );

  state.lastTime = currentTime;

  updatePhysics(deltaSeconds);
  renderer.render(scene, camera);
}

function handleResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
}

enableMotionButton.addEventListener("click", enableMotionControls);
resetButton.addEventListener("click", resetBall);
window.addEventListener("resize", handleResize);

animate(performance.now());
