import * as THREE from "three";

const canvas = document.getElementById("gameCanvas");
const startButton = document.getElementById("startButton");
const resetButton = document.getElementById("resetButton");
const statusText = document.getElementById("status");
const distanceText = document.getElementById("distance");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020617);
scene.fog = new THREE.Fog(0x020617, 18, 85);

const camera = new THREE.PerspectiveCamera(
  62,
  window.innerWidth / window.innerHeight,
  0.1,
  220
);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true
});

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
scene.add(ambientLight);

const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(5, 10, 8);
scene.add(sun);

const ballRadius = 0.5;
const trackWidth = 10;
const chunkLength = 12;
const chunksAhead = 9;
const chunksBehind = 4;

const safeStartChunks = 2;
const holeRadiusMin = 0.55;
const holeRadiusMax = 1.15;

const game = {
  started: false,
  falling: false,

  rawBeta: 0,
  rawGamma: 0,

  neutralBeta: 0,
  neutralGamma: 0,

  calibrating: false,
  calibrationSamples: [],

  tiltX: 0,
  tiltZ: 0,

  velocityX: 0,
  velocityZ: 2.8,

  positionX: 0,
  positionZ: 0,

  distance: 0,
  lastTime: performance.now()
};

const chunks = new Map();
const holes = [];

const floorMaterialA = new THREE.MeshStandardMaterial({
  color: 0x1e293b,
  roughness: 0.9,
  metalness: 0.05
});

const floorMaterialB = new THREE.MeshStandardMaterial({
  color: 0x263449,
  roughness: 0.9,
  metalness: 0.05
});

const sideMaterial = new THREE.MeshStandardMaterial({
  color: 0x0f172a,
  roughness: 0.95
});

const holeMaterial = new THREE.MeshBasicMaterial({
  color: 0x000000
});

const holeRimMaterial = new THREE.MeshBasicMaterial({
  color: 0xef4444,
  transparent: true,
  opacity: 0.72
});

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

function makeStarfield() {
  const starGeometry = new THREE.BufferGeometry();
  const starCount = 900;
  const positions = [];

  for (let i = 0; i < starCount; i++) {
    positions.push(
      THREE.MathUtils.randFloatSpread(140),
      THREE.MathUtils.randFloat(18, 70),
      THREE.MathUtils.randFloatSpread(180)
    );
  }

  starGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );

  const starMaterial = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.08,
    transparent: true,
    opacity: 0.65
  });

  const stars = new THREE.Points(starGeometry, starMaterial);
  scene.add(stars);
}

makeStarfield();

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function seededRandom(seed) {
  const value = Math.sin(seed * 9999.123) * 10000;
  return value - Math.floor(value);
}

function randomBetween(seed, min, max) {
  return min + seededRandom(seed) * (max - min);
}

function createHole(chunkIndex, localIndex, zStart, group) {
  const seedBase = chunkIndex * 100 + localIndex * 17;

  const radius = randomBetween(seedBase + 1, holeRadiusMin, holeRadiusMax);
  const x = randomBetween(
    seedBase + 2,
    -trackWidth / 2 + radius + 0.8,
    trackWidth / 2 - radius - 0.8
  );

  const z = zStart + randomBetween(
    seedBase + 3,
    2.2,
    chunkLength - 2.2
  );

  const circleSegments = 22;

  const holeMesh = new THREE.Mesh(
    new THREE.CircleGeometry(radius, circleSegments),
    holeMaterial
  );

  holeMesh.rotation.x = -Math.PI / 2;
  holeMesh.position.set(x, 0.035, z);
  group.add(holeMesh);

  const rimMesh = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.98, radius * 1.12, circleSegments),
    holeRimMaterial
  );

  rimMesh.rotation.x = -Math.PI / 2;
  rimMesh.position.set(x, 0.04, z);
  group.add(rimMesh);

  holes.push({
    chunkIndex,
    x,
    z,
    radius
  });
}

function createChunk(chunkIndex) {
  if (chunks.has(chunkIndex)) {
    return;
  }

  const group = new THREE.Group();

  const zStart = chunkIndex * chunkLength;
  const zCenter = zStart + chunkLength / 2;

  const floorGeometry = new THREE.PlaneGeometry(trackWidth, chunkLength, 4, 4);
  const floor = new THREE.Mesh(
    floorGeometry,
    chunkIndex % 2 === 0 ? floorMaterialA : floorMaterialB
  );

  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, zCenter);
  group.add(floor);

  const lineGeometry = new THREE.PlaneGeometry(0.06, chunkLength);
  const lineMaterial = new THREE.MeshBasicMaterial({
    color: 0x64748b,
    transparent: true,
    opacity: 0.35
  });

  const centerLine = new THREE.Mesh(lineGeometry, lineMaterial);
  centerLine.rotation.x = -Math.PI / 2;
  centerLine.position.set(0, 0.025, zCenter);
  group.add(centerLine);

  const sideGeometry = new THREE.BoxGeometry(0.22, 0.45, chunkLength);

  const leftSide = new THREE.Mesh(sideGeometry, sideMaterial);
  leftSide.position.set(-trackWidth / 2 - 0.11, 0.225, zCenter);
  group.add(leftSide);

  const rightSide = new THREE.Mesh(sideGeometry, sideMaterial);
  rightSide.position.set(trackWidth / 2 + 0.11, 0.225, zCenter);
  group.add(rightSide);

  const holesThisChunk =
    chunkIndex < safeStartChunks
      ? 0
      : Math.floor(randomBetween(chunkIndex + 11, 1, 4));

  for (let i = 0; i < holesThisChunk; i++) {
    createHole(chunkIndex, i, zStart, group);
  }

  scene.add(group);
  chunks.set(chunkIndex, group);
}

function removeChunk(chunkIndex) {
  const group = chunks.get(chunkIndex);

  if (!group) {
    return;
  }

  group.traverse((object) => {
    if (object.geometry) {
      object.geometry.dispose();
    }
  });

  scene.remove(group);
  chunks.delete(chunkIndex);

  for (let i = holes.length - 1; i >= 0; i--) {
    if (holes[i].chunkIndex === chunkIndex) {
      holes.splice(i, 1);
    }
  }
}

function updateChunks() {
  const currentChunk = Math.floor(game.positionZ / chunkLength);
  const minChunk = currentChunk - chunksBehind;
  const maxChunk = currentChunk + chunksAhead;

  for (let i = minChunk; i <= maxChunk; i++) {
    createChunk(i);
  }

  for (const chunkIndex of Array.from(chunks.keys())) {
    if (chunkIndex < minChunk || chunkIndex > maxChunk) {
      removeChunk(chunkIndex);
    }
  }
}

function resetGame() {
  game.falling = false;
  game.velocityX = 0;
  game.velocityZ = 2.8;
  game.positionX = 0;
  game.positionZ = 0;
  game.distance = 0;
  game.tiltX = 0;
  game.tiltZ = 0;

  ball.position.set(0, ballRadius, 0);
  ball.rotation.set(0, 0, 0);
  ball.scale.set(1, 1, 1);

  for (const chunkIndex of Array.from(chunks.keys())) {
    removeChunk(chunkIndex);
  }

  holes.length = 0;

  for (let i = -1; i <= chunksAhead; i++) {
    createChunk(i);
  }

  updateChunks();

  distanceText.textContent = "Distance: 0";

  statusText.textContent = game.started
    ? "Running. Tilt gently to steer."
    : "Waiting to start.";
}

function handleOrientation(event) {
  /*
    DeviceOrientationEvent uses angles instead of raw acceleration.

    beta: front/back tilt
    gamma: left/right tilt

    This is better when the phone is held naturally rather than lying flat.
  */

  if (event.beta === null || event.gamma === null) {
    return;
  }

  game.rawBeta = event.beta;
  game.rawGamma = event.gamma;

  if (game.calibrating) {
    game.calibrationSamples.push({
      beta: game.rawBeta,
      gamma: game.rawGamma
    });

    if (game.calibrationSamples.length >= 12) {
      let sumBeta = 0;
      let sumGamma = 0;

      for (const sample of game.calibrationSamples) {
        sumBeta += sample.beta;
        sumGamma += sample.gamma;
      }

      game.neutralBeta = sumBeta / game.calibrationSamples.length;
      game.neutralGamma = sumGamma / game.calibrationSamples.length;

      game.calibrating = false;
      game.started = true;

      resetGame();
      statusText.textContent = "Calibrated. Tilt gently to steer.";
    }

    return;
  }

  const relativeBeta = game.rawBeta - game.neutralBeta;
  const relativeGamma = game.rawGamma - game.neutralGamma;

  /*
    Reversed and softened controls.

    If left/right still feels backward, remove the negative sign from tiltX.
    If forward/back still feels backward, remove the negative sign from tiltZ.
  */

  const tiltSensitivity = 24;

  game.tiltX = clamp(-relativeGamma / tiltSensitivity, -1, 1);
  game.tiltZ = clamp(-relativeBeta / tiltSensitivity, -1, 1);
}

async function startOrCalibrate() {
  try {
    if (
      typeof DeviceOrientationEvent !== "undefined" &&
      typeof DeviceOrientationEvent.requestPermission === "function"
    ) {
      const permission = await DeviceOrientationEvent.requestPermission();

      if (permission !== "granted") {
        statusText.textContent = "Motion/orientation permission was denied.";
        return;
      }
    }

    window.removeEventListener("deviceorientation", handleOrientation, true);
    window.addEventListener("deviceorientation", handleOrientation, true);

    game.calibrating = true;
    game.calibrationSamples = [];
    game.started = false;
    game.falling = false;

    statusText.textContent = "Calibrating. Hold the phone naturally and still.";
  } catch (error) {
    console.error(error);
    statusText.textContent =
      "Could not enable orientation controls. Use HTTPS and test on iPhone Safari.";
  }
}

function beginFall() {
  if (game.falling) {
    return;
  }

  game.falling = true;
  game.started = false;
  game.velocityX = 0;
  game.velocityZ = 0;

  statusText.textContent = "You fell. Tap Start / Calibrate to try again.";
}

function checkHazards() {
  const edgeLimit = trackWidth / 2 - ballRadius * 0.6;

  if (game.positionX < -edgeLimit || game.positionX > edgeLimit) {
    beginFall();
    return;
  }

  for (const hole of holes) {
    const dx = game.positionX - hole.x;
    const dz = game.positionZ - hole.z;
    const distance = Math.sqrt(dx * dx + dz * dz);

    if (distance < hole.radius + ballRadius * 0.35) {
      beginFall();
      return;
    }
  }
}

function updatePhysics(deltaSeconds) {
  if (game.falling) {
    ball.position.y -= 7 * deltaSeconds;
    ball.rotation.x += 4 * deltaSeconds;
    ball.rotation.z += 2 * deltaSeconds;
    ball.scale.multiplyScalar(0.992);
    return;
  }

  if (!game.started) {
    return;
  }

  const sideAcceleration = 9;
  const forwardAcceleration = 2.5;
  const baseForwardPush = 1.55;
  const friction = 0.982;
  const maxSideSpeed = 5.5;
  const minForwardSpeed = 2.1;
  const maxForwardSpeed = 7.25;

  game.velocityX += game.tiltX * sideAcceleration * deltaSeconds;

  game.velocityZ +=
    (baseForwardPush + game.tiltZ * forwardAcceleration) * deltaSeconds;

  game.velocityX *= friction;
  game.velocityZ *= 0.993;

  game.velocityX = clamp(game.velocityX, -maxSideSpeed, maxSideSpeed);
  game.velocityZ = clamp(game.velocityZ, minForwardSpeed, maxForwardSpeed);

  game.positionX += game.velocityX * deltaSeconds;
  game.positionZ += game.velocityZ * deltaSeconds;

  ball.position.x = game.positionX;
  ball.position.y = ballRadius;
  ball.position.z = game.positionZ;

  const rollX = game.velocityZ * deltaSeconds / ballRadius;
  const rollZ = -game.velocityX * deltaSeconds / ballRadius;

  ball.rotation.x += rollX;
  ball.rotation.z += rollZ;

  game.distance = Math.max(game.distance, game.positionZ);
  distanceText.textContent = `Distance: ${Math.floor(game.distance)}`;

  updateChunks();
  checkHazards();
}

function updateCamera(deltaSeconds) {
  const targetCameraPosition = new THREE.Vector3(
    game.positionX * 0.45,
    6.8,
    game.positionZ - 8
  );

  camera.position.lerp(targetCameraPosition, 1 - Math.pow(0.001, deltaSeconds));

  const lookTarget = new THREE.Vector3(
    game.positionX * 0.4,
    0.8,
    game.positionZ + 4
  );

  camera.lookAt(lookTarget);
}

function animate(currentTime) {
  requestAnimationFrame(animate);

  const deltaSeconds = Math.min(
    (currentTime - game.lastTime) / 1000,
    1 / 30
  );

  game.lastTime = currentTime;

  updatePhysics(deltaSeconds);
  updateCamera(deltaSeconds);

  renderer.render(scene, camera);
}

function handleResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
}

startButton.addEventListener("click", startOrCalibrate);
resetButton.addEventListener("click", resetGame);
window.addEventListener("resize", handleResize);

resetGame();
animate(performance.now());
