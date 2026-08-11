const simulatorEffects = globalThis.glowEffects.effects;
const simulatorSampleEffect = globalThis.glowEffects.sampleEffect;
const patternWorkshop = globalThis.glowPatternWorkshop;
const mastModel = globalThis.glowMastModel;

const canvas = document.getElementById("pack-canvas");
const context = canvas.getContext("2d", { alpha: false });
const workspace = document.querySelector(".workspace");
const controlPanel = document.getElementById("simulation-controls");
const controlsToggle = document.getElementById("controls-toggle");
const controlsToggleIcon = document.getElementById("controls-toggle-icon");
const controlsToggleLabel = document.getElementById("controls-toggle-label");
const workshopReviewGate = patternWorkshop.createReviewGate();

const palettes = {
  safety: [
    [255, 71, 43],
    [255, 151, 41],
    [255, 221, 83],
  ],
  electric: [
    [44, 221, 255],
    [52, 112, 255],
    [142, 86, 255],
  ],
  neon: [
    [255, 68, 137],
    [90, 232, 255],
    [123, 255, 171],
  ],
  ice: [
    [245, 252, 255],
    [154, 222, 255],
    [99, 143, 255],
  ],
};

const viewPresets = {
  rear: {
    position: { x: 0, y: 2.4, z: -3.6 },
    target: { x: 0, y: 0.8, z: 10.5 },
    fov: 56,
  },
  pack: {
    position: { x: 8, y: 5, z: -5.2 },
    target: { x: 0, y: 0.72, z: 10.5 },
    fov: 54,
  },
  side: {
    position: { x: 13.8, y: 3.2, z: 8.2 },
    target: { x: 0, y: 0.75, z: 10.2 },
    fov: 50,
  },
  overhead: {
    position: { x: 0.4, y: 18, z: 7.5 },
    target: { x: 0, y: 0, z: 10.5 },
    fov: 48,
  },
};

const lightMast = {
  x: 0.38,
  z: -0.64,
  mountY: 0.82,
  lightBottomY: 0.88,
  lightTopY: 2.46,
  topY: 2.5,
};

const state = {
  effect: "flow",
  palette: "neon",
  customColor: "#ff4f88",
  target: "all",
  packSize: 9,
  brightness: 0.72,
  speed: 1,
  bikeVariation: 0.35,
  synchronized: true,
  hardwareMode: "noodle",
  foamColor: "white",
  foamTransmission: 0.18,
  controlsCollapsed: false,
  paused: false,
  simulationTime: 0,
  view: "rear",
};

let width = 1;
let height = 1;
let deviceScale = 1;
let lastFrameAt = performance.now();
let lastRenderAt = 0;
let activePointer = null;
let dragStart = null;
let camera = createCamera(viewPresets.rear);
let activeWorkshopPattern = null;
let activeWorkshopRenderer = null;
let workshopPreviewTimer = null;
let workshopRuntimeError = null;
let controlsCollapsedForWorkshop = false;

const stars = Array.from({ length: 86 }, (_, index) => ({
  x: pseudoRandom(index * 17 + 5),
  y: pseudoRandom(index * 29 + 11) * 0.58,
  size: 0.4 + pseudoRandom(index * 41 + 7) * 1.2,
  alpha: 0.18 + pseudoRandom(index * 53 + 3) * 0.52,
}));

function pseudoRandom(seed) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function createCamera(preset) {
  const target = { ...preset.target };
  const offset = subtract(preset.position, target);
  const distance = magnitude(offset);
  return {
    target,
    distance,
    azimuth: Math.atan2(offset.x, offset.z),
    elevation: Math.asin(offset.y / distance),
    fov: preset.fov,
  };
}

function cameraPosition() {
  const horizontal = Math.cos(camera.elevation) * camera.distance;
  return {
    x: camera.target.x + Math.sin(camera.azimuth) * horizontal,
    y: camera.target.y + Math.sin(camera.elevation) * camera.distance,
    z: camera.target.z + Math.cos(camera.azimuth) * horizontal,
  };
}

function subtract(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function magnitude(vector) {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function normalize(vector) {
  const length = magnitude(vector) || 1;
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}

function cameraBasis() {
  const position = cameraPosition();
  const forward = normalize(subtract(camera.target, position));
  const right = normalize(cross(forward, { x: 0, y: 1, z: 0 }));
  const up = cross(right, forward);
  return { position, forward, right, up };
}

function project(point, basis = cameraBasis()) {
  const relative = subtract(point, basis.position);
  const cameraX = dot(relative, basis.right);
  const cameraY = dot(relative, basis.up);
  const cameraZ = dot(relative, basis.forward);
  if (cameraZ <= 0.18) return null;

  const focal = height / (2 * Math.tan((camera.fov * Math.PI) / 360));
  return {
    x: width / 2 + (cameraX * focal) / cameraZ,
    y: height * 0.49 - (cameraY * focal) / cameraZ,
    depth: cameraZ,
    scale: focal / cameraZ,
  };
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  deviceScale = Math.min(window.devicePixelRatio || 1, 2);
  width = Math.max(1, rect.width);
  height = Math.max(1, rect.height);
  canvas.width = Math.round(width * deviceScale);
  canvas.height = Math.round(height * deviceScale);
  context.setTransform(deviceScale, 0, 0, deviceScale, 0, 0);
}

function formation(count) {
  const bikes = [];
  const followerCount = Math.max(0, count - 1);
  const followerRows = Math.ceil(followerCount / 3);
  bikes.push({
    index: 0,
    x: 0,
    z: 7.3 + followerRows * 3.15,
    row: 0,
    lead: true,
  });

  for (let index = 0; index < followerCount; index += 1) {
    const row = Math.floor(index / 3) + 1;
    const column = index % 3;
    const offsets = [-1.2, 0, 1.2];
    const z = 7.3 + (followerRows - row) * 3.15;
    bikes.push({
      index: index + 1,
      x: offsets[column] + (row % 2 === 0 ? 0.18 : -0.18),
      z,
      row,
      lead: false,
    });
  }
  return bikes;
}

function targetMatches(bike, bikes) {
  if (state.target === "all") return true;
  if (state.target === "lead") return bike.lead;
  if (state.target === "alternate") return bike.index % 2 === 0;
  const maxRow = Math.max(...bikes.map((item) => item.row));
  return bike.row === maxRow;
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  return [
    Number.parseInt(clean.slice(0, 2), 16),
    Number.parseInt(clean.slice(2, 4), 16),
    Number.parseInt(clean.slice(4, 6), 16),
  ];
}

function activePalette() {
  if (state.palette === "custom") return [hexToRgb(state.customColor)];
  return palettes[state.palette];
}

function lightSample(pixelIndex, pixelCount, bikeIndex, isTargeted) {
  if (!isTargeted || state.effect === "off")
    return { rgb: [24, 29, 38], intensity: 0.035 };

  const palette = activePalette();
  const phaseOffsetMs = state.synchronized ? 0 : bikeIndex * 310;
  const cueTimeMs =
    Math.floor(state.simulationTime * state.speed * 1000) + phaseOffsetMs;
  let sample;

  if (state.effect === "workshop" && activeWorkshopRenderer) {
    try {
      sample = activeWorkshopRenderer(
        pixelIndex,
        pixelCount,
        cueTimeMs,
        palette,
        bikeIndex,
        state.bikeVariation,
      );
    } catch (error) {
      reportWorkshopRuntimeError(error);
      sample = { rgb: [255, 72, 108], intensity: 0.18 };
    }
  } else {
    sample = simulatorSampleEffect(
      state.effect,
      pixelIndex,
      pixelCount,
      cueTimeMs,
      palette,
      bikeIndex,
    );
  }

  return {
    rgb: sample.rgb,
    intensity: sample.intensity * state.brightness,
  };
}

function fillTerrain(points, color) {
  context.fillStyle = color;
  context.beginPath();
  context.moveTo(0, height);
  for (const [x, y] of points) {
    context.lineTo(x * width, y * height);
  }
  context.lineTo(width, height);
  context.closePath();
  context.fill();
}

function drawCactus(x, groundY, scale) {
  const plantHeight = height * 0.078 * scale;
  const trunkWidth = Math.max(2, height * 0.006 * scale);

  context.save();
  context.strokeStyle = "#120d0c";
  context.lineWidth = trunkWidth;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();
  context.moveTo(x, groundY);
  context.lineTo(x, groundY - plantHeight);
  context.moveTo(x, groundY - plantHeight * 0.52);
  context.lineTo(x - plantHeight * 0.26, groundY - plantHeight * 0.52);
  context.lineTo(x - plantHeight * 0.26, groundY - plantHeight * 0.73);
  context.moveTo(x, groundY - plantHeight * 0.7);
  context.lineTo(x + plantHeight * 0.24, groundY - plantHeight * 0.7);
  context.lineTo(x + plantHeight * 0.24, groundY - plantHeight * 0.9);
  context.stroke();
  context.restore();
}

function drawBackground() {
  const sky = context.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#080914");
  sky.addColorStop(0.48, "#1d1523");
  sky.addColorStop(0.72, "#63342f");
  sky.addColorStop(1, "#1d1513");
  context.fillStyle = sky;
  context.fillRect(0, 0, width, height);

  for (const star of stars) {
    context.globalAlpha = star.alpha * 0.8;
    context.fillStyle = "#f8e8d2";
    context.beginPath();
    context.arc(star.x * width, star.y * height, star.size, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;

  const moonX = width * (width < 620 ? 0.88 : 0.79);
  const moonY = height * 0.16;
  const moonRadius = Math.max(12, height * 0.034);
  const moonGlow = context.createRadialGradient(
    moonX,
    moonY,
    moonRadius * 0.3,
    moonX,
    moonY,
    moonRadius * 4.8,
  );
  moonGlow.addColorStop(0, "rgba(255, 218, 170, 0.22)");
  moonGlow.addColorStop(1, "rgba(255, 194, 132, 0)");
  context.fillStyle = moonGlow;
  context.fillRect(
    moonX - moonRadius * 5,
    moonY - moonRadius * 5,
    moonRadius * 10,
    moonRadius * 10,
  );
  context.fillStyle = "#efc994";
  context.beginPath();
  context.arc(moonX, moonY, moonRadius, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "rgba(151, 100, 76, 0.18)";
  context.beginPath();
  context.arc(
    moonX - moonRadius * 0.28,
    moonY + moonRadius * 0.16,
    moonRadius * 0.19,
    0,
    Math.PI * 2,
  );
  context.fill();

  const horizon = height * 0.57;
  const glow = context.createRadialGradient(
    width * 0.48,
    horizon,
    0,
    width * 0.48,
    horizon,
    width * 0.58,
  );
  glow.addColorStop(0, "rgba(241, 135, 82, 0.24)");
  glow.addColorStop(1, "rgba(85, 42, 37, 0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);

  fillTerrain(
    [
      [0, 0.58],
      [0.075, 0.535],
      [0.12, 0.49],
      [0.23, 0.49],
      [0.275, 0.535],
      [0.37, 0.55],
      [0.46, 0.505],
      [0.54, 0.505],
      [0.61, 0.555],
      [0.72, 0.53],
      [0.77, 0.47],
      [0.88, 0.47],
      [0.925, 0.525],
      [1, 0.55],
    ],
    "#382022",
  );

  const desertFloor = context.createLinearGradient(0, horizon, 0, height);
  desertFloor.addColorStop(0, "#3a241b");
  desertFloor.addColorStop(0.5, "#241813");
  desertFloor.addColorStop(1, "#100e0d");
  context.fillStyle = desertFloor;
  context.fillRect(0, horizon, width, height - horizon);

  fillTerrain(
    [
      [0, 0.66],
      [0.08, 0.625],
      [0.18, 0.61],
      [0.29, 0.635],
      [0.42, 0.605],
      [0.56, 0.625],
      [0.68, 0.6],
      [0.8, 0.63],
      [0.91, 0.595],
      [1, 0.615],
    ],
    "#2c1b16",
  );

  context.fillStyle = "rgba(198, 128, 79, 0.24)";
  for (let index = 0; index < 38; index += 1) {
    const x = pseudoRandom(index * 43 + 21) * width;
    const y = (0.61 + pseudoRandom(index * 67 + 15) * 0.33) * height;
    const radius = 0.5 + pseudoRandom(index * 31 + 8) * 1.25;
    context.beginPath();
    context.ellipse(x, y, radius * 1.8, radius * 0.55, 0, 0, Math.PI * 2);
    context.fill();
  }

  drawCactus(width * 0.09, height * 0.63, 0.72);
  drawCactus(width * 0.9, height * 0.61, 0.58);
}

function drawWorldLine(
  start,
  end,
  color,
  lineWidth = 1,
  alpha = 1,
  basis = cameraBasis(),
) {
  const projectedStart = project(start, basis);
  const projectedEnd = project(end, basis);
  if (!projectedStart || !projectedEnd) return;

  context.globalAlpha = alpha;
  context.strokeStyle = color;
  context.lineWidth = Math.max(
    0.45,
    lineWidth * (projectedStart.scale + projectedEnd.scale) * 0.016,
  );
  context.beginPath();
  context.moveTo(projectedStart.x, projectedStart.y);
  context.lineTo(projectedEnd.x, projectedEnd.y);
  context.stroke();
  context.globalAlpha = 1;
}

function drawRoad(basis) {
  const roadNearLeft = project({ x: -4.5, y: 0, z: 0 }, basis);
  const roadNearRight = project({ x: 4.5, y: 0, z: 0 }, basis);
  const roadFarRight = project({ x: 4.5, y: 0, z: 55 }, basis);
  const roadFarLeft = project({ x: -4.5, y: 0, z: 55 }, basis);

  if (roadNearLeft && roadNearRight && roadFarRight && roadFarLeft) {
    const roadGradient = context.createLinearGradient(
      0,
      roadFarLeft.y,
      0,
      roadNearLeft.y,
    );
    roadGradient.addColorStop(0, "#131925");
    roadGradient.addColorStop(1, "#0b0f16");
    context.fillStyle = roadGradient;
    context.beginPath();
    context.moveTo(roadNearLeft.x, roadNearLeft.y);
    context.lineTo(roadNearRight.x, roadNearRight.y);
    context.lineTo(roadFarRight.x, roadFarRight.y);
    context.lineTo(roadFarLeft.x, roadFarLeft.y);
    context.closePath();
    context.fill();
  }

  for (let x = -4; x <= 4; x += 1) {
    drawWorldLine(
      { x, y: 0.006, z: 1 },
      { x, y: 0.006, z: 48 },
      "#344052",
      0.55,
      x === 0 ? 0.42 : 0.2,
      basis,
    );
  }

  const roadOffset = (state.simulationTime * 7) % 3;
  for (let z = -2; z < 52; z += 3) {
    const shiftedZ = z - roadOffset;
    drawWorldLine(
      { x: -0.04, y: 0.015, z: shiftedZ },
      { x: -0.04, y: 0.015, z: shiftedZ + 1.45 },
      "#b1b8bc",
      1.15,
      0.58,
      basis,
    );
  }

  drawWorldLine(
    { x: -4.35, y: 0.02, z: 0 },
    { x: -4.35, y: 0.02, z: 55 },
    "#626a70",
    1.2,
    0.45,
    basis,
  );
  drawWorldLine(
    { x: 4.35, y: 0.02, z: 0 },
    { x: 4.35, y: 0.02, z: 55 },
    "#626a70",
    1.2,
    0.45,
    basis,
  );
}

function worldPoint(bike, x, y, z) {
  return { x: bike.x + x, y: bike.y + y, z: bike.z + z };
}

function drawWheel(bike, centerZ, basis) {
  const points = [];
  const segments = 22;
  for (let index = 0; index <= segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    points.push(
      worldPoint(
        bike,
        0,
        0.44 + Math.cos(angle) * 0.43,
        centerZ + Math.sin(angle) * 0.43,
      ),
    );
  }

  context.strokeStyle = "#788397";
  context.globalAlpha = 0.82;
  context.lineWidth = 1.2;
  context.beginPath();
  let drawing = false;
  for (const point of points) {
    const projected = project(point, basis);
    if (!projected) continue;
    if (!drawing) {
      context.moveTo(projected.x, projected.y);
      drawing = true;
    } else {
      context.lineTo(projected.x, projected.y);
    }
  }
  context.stroke();
  context.globalAlpha = 1;
}

function drawJoint(point, radius, color, basis) {
  const projected = project(point, basis);
  if (!projected) return;
  const screenRadius = Math.max(1, Math.min(18, radius * projected.scale));
  context.fillStyle = color;
  context.beginPath();
  context.arc(projected.x, projected.y, screenRadius, 0, Math.PI * 2);
  context.fill();
}

function drawBike(bike, bikes, basis) {
  const bob = Math.sin(state.simulationTime * 4.3 + bike.index * 1.7) * 0.018;
  const workingBike = { ...bike, y: bob };
  const rearHub = worldPoint(workingBike, 0, 0.44, -0.57);
  const frontHub = worldPoint(workingBike, 0, 0.44, 0.72);
  const crank = worldPoint(workingBike, 0, 0.48, 0.04);
  const seat = worldPoint(workingBike, 0, 0.92, -0.04);
  const handle = worldPoint(workingBike, 0, 0.96, 0.6);
  const frameColor = bike.lead ? "#b7c3d8" : "#7f8ca1";

  const shadow = project(worldPoint(workingBike, 0, 0.02, 0), basis);
  if (shadow) {
    context.fillStyle = "rgba(0, 0, 0, 0.36)";
    context.beginPath();
    context.ellipse(
      shadow.x,
      shadow.y,
      Math.max(3, shadow.scale * 0.55),
      Math.max(1, shadow.scale * 0.13),
      0,
      0,
      Math.PI * 2,
    );
    context.fill();
  }

  drawWheel(workingBike, -0.57, basis);
  drawWheel(workingBike, 0.72, basis);
  drawWorldLine(rearHub, crank, frameColor, 1.7, 0.95, basis);
  drawWorldLine(crank, seat, frameColor, 1.7, 0.95, basis);
  drawWorldLine(seat, rearHub, frameColor, 1.7, 0.95, basis);
  drawWorldLine(seat, handle, frameColor, 1.45, 0.88, basis);
  drawWorldLine(handle, frontHub, frameColor, 1.45, 0.88, basis);
  drawWorldLine(crank, frontHub, frameColor, 1.35, 0.82, basis);
  drawWorldLine(
    worldPoint(workingBike, -0.3, 1.02, 0.61),
    worldPoint(workingBike, 0.3, 1.02, 0.61),
    "#a7b1c1",
    1.25,
    0.9,
    basis,
  );
  drawWorldLine(
    worldPoint(workingBike, -0.18, 0.88, -0.1),
    worldPoint(workingBike, 0.18, 0.88, -0.1),
    "#343d4b",
    2.1,
    1,
    basis,
  );

  const hip = worldPoint(workingBike, 0, 1.06, -0.01);
  const shoulder = worldPoint(workingBike, 0, 1.53, 0.22);
  const head = worldPoint(workingBike, 0, 1.76, 0.25);
  drawWorldLine(hip, shoulder, "#d2d9e6", 2.45, 0.95, basis);
  drawWorldLine(
    hip,
    worldPoint(workingBike, -0.07, 0.55, -0.03),
    "#79869c",
    1.8,
    0.9,
    basis,
  );
  drawWorldLine(
    hip,
    worldPoint(workingBike, 0.07, 0.55, 0.1),
    "#79869c",
    1.8,
    0.9,
    basis,
  );
  drawWorldLine(
    shoulder,
    worldPoint(workingBike, -0.24, 1.02, 0.58),
    "#aeb8c9",
    1.65,
    0.9,
    basis,
  );
  drawWorldLine(
    shoulder,
    worldPoint(workingBike, 0.24, 1.02, 0.58),
    "#aeb8c9",
    1.65,
    0.9,
    basis,
  );
  drawJoint(head, 0.12, bike.lead ? "#e6b598" : "#c99d84", basis);

  const mastMount = worldPoint(
    workingBike,
    lightMast.x,
    lightMast.mountY,
    lightMast.z,
  );
  drawWorldLine(seat, mastMount, "#455064", 1.25, 0.86, basis);
  drawWorldLine(rearHub, mastMount, "#455064", 1.2, 0.82, basis);
  drawWorldLine(
    mastMount,
    worldPoint(workingBike, lightMast.x, lightMast.topY, lightMast.z),
    "#303a48",
    2.1,
    1,
    basis,
  );

  drawLightMast(workingBike, bike, bikes, basis);

  if (bike.lead) {
    const labelPoint = project(worldPoint(workingBike, 0, 2.64, 0.18), basis);
    if (labelPoint && labelPoint.depth < 35) {
      context.fillStyle = "rgba(221, 230, 243, 0.66)";
      context.font = "600 9px ui-sans-serif, system-ui, sans-serif";
      context.textAlign = "center";
      context.fillText("LEAD", labelPoint.x, labelPoint.y);
    }
  }
}

function rgbCss(rgb, alpha = 1) {
  const channels = rgb.map((channel) =>
    Math.round(Math.max(0, Math.min(255, channel))),
  );
  return `rgba(${channels[0]}, ${channels[1]}, ${channels[2]}, ${alpha})`;
}

function mixRgb(first, second, amount) {
  return first.map(
    (channel, index) => channel + (second[index] - channel) * amount,
  );
}

function drawScreenLine(
  start,
  end,
  widthPx,
  color,
  alpha,
  composite,
  lineCap = "round",
) {
  context.save();
  context.globalCompositeOperation = composite;
  context.globalAlpha = alpha;
  context.strokeStyle = color;
  context.lineWidth = widthPx;
  context.lineCap = lineCap;
  context.beginPath();
  context.moveTo(start.x, start.y);
  context.lineTo(end.x, end.y);
  context.stroke();
  context.restore();
}

function drawLightMast(workingBike, originalBike, bikes, basis) {
  const profile = mastModel.profile(state.hardwareMode);
  if (profile.diffuser === "none") {
    drawBareEmitters(workingBike, originalBike, bikes, basis, profile);
    return;
  }
  drawDiffusedMast(workingBike, originalBike, bikes, basis, profile);
}

function mastWorldPoint(workingBike, geometry) {
  return worldPoint(
    workingBike,
    lightMast.x + geometry.xM,
    lightMast.lightBottomY + geometry.heightM,
    lightMast.z + geometry.zM,
  );
}

function drawBareEmitters(workingBike, originalBike, bikes, basis, profile) {
  const targeted = targetMatches(originalBike, bikes);
  const midpoint = project(
    worldPoint(
      workingBike,
      lightMast.x,
      (lightMast.lightBottomY + lightMast.lightTopY) / 2,
      lightMast.z,
    ),
    basis,
  );
  if (!midpoint) return;

  const sampleCount = mastModel.renderSampleCount(
    state.hardwareMode,
    midpoint.depth,
  );
  const samples = Array.from({ length: sampleCount }, (_, sampleIndex) => {
    const physicalIndex = mastModel.physicalIndex(
      sampleIndex,
      sampleCount,
      profile.ledCount,
    );
    const geometry = mastModel.ledPoint(
      state.hardwareMode,
      physicalIndex,
      profile.ledCount,
    );
    const world = mastWorldPoint(workingBike, geometry);
    return {
      geometry,
      physicalIndex,
      point: project(world, basis),
      world,
    };
  });

  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1].point;
    const current = samples[index].point;
    if (!previous || !current) continue;
    drawScreenLine(
      previous,
      current,
      Math.max(0.35, ((previous.scale + current.scale) / 2) * 0.003),
      "#4b5566",
      0.58,
      "source-over",
    );
  }

  for (const sample of samples) {
    const { geometry, physicalIndex, point, world } = sample;
    if (!point) continue;

    const { rgb, intensity } = lightSample(
      physicalIndex,
      profile.ledCount,
      originalBike.index,
      targeted,
    );
    const [red, green, blue] = rgb;
    const outward = {
      x: Math.cos(geometry.angle),
      y: 0,
      z: Math.sin(geometry.angle),
    };
    const facing = Math.max(
      0,
      dot(outward, normalize(subtract(basis.position, world))),
    );
    const visibleIntensity = intensity * (0.16 + facing * 0.84);
    const coreRadius = Math.max(0.42, Math.min(1.8, point.scale * 0.0048));
    const glowRadius = coreRadius * (2.8 + visibleIntensity * 3.8);

    if (visibleIntensity > 0.04) {
      context.globalCompositeOperation = "lighter";
      const glow = context.createRadialGradient(
        point.x,
        point.y,
        0,
        point.x,
        point.y,
        glowRadius,
      );
      glow.addColorStop(
        0,
        `rgba(${red}, ${green}, ${blue}, ${Math.min(0.82, visibleIntensity * 0.9)})`,
      );
      glow.addColorStop(
        0.28,
        `rgba(${red}, ${green}, ${blue}, ${visibleIntensity * 0.4})`,
      );
      glow.addColorStop(1, `rgba(${red}, ${green}, ${blue}, 0)`);
      context.fillStyle = glow;
      context.beginPath();
      context.arc(point.x, point.y, glowRadius, 0, Math.PI * 2);
      context.fill();
      context.globalCompositeOperation = "source-over";
    }

    context.fillStyle = `rgba(${red}, ${green}, ${blue}, ${Math.max(0.18, visibleIntensity)})`;
    context.beginPath();
    context.arc(point.x, point.y, coreRadius, 0, Math.PI * 2);
    context.fill();
  }
}

function blurredLightSample(centerIndex, profile, bikeIndex, targeted) {
  const offsets = [-2, -1, 0, 1, 2];
  const weights = [1, 2, 3, 2, 1];
  const color = [0, 0, 0];
  let intensity = 0;
  let totalWeight = 0;

  offsets.forEach((offset, index) => {
    const physicalIndex = Math.max(
      0,
      Math.min(profile.ledCount - 1, centerIndex + offset),
    );
    const sample = lightSample(
      physicalIndex,
      profile.ledCount,
      bikeIndex,
      targeted,
    );
    const weight = weights[index];
    color[0] += sample.rgb[0] * sample.intensity * weight;
    color[1] += sample.rgb[1] * sample.intensity * weight;
    color[2] += sample.rgb[2] * sample.intensity * weight;
    intensity += sample.intensity * weight;
    totalWeight += weight;
  });

  const averageIntensity = intensity / totalWeight;
  if (intensity <= 0.001) return { rgb: [24, 29, 38], intensity: 0 };
  return {
    rgb: color.map((channel) => channel / intensity),
    intensity: averageIntensity,
  };
}

function drawDiffusedMast(workingBike, originalBike, bikes, basis, profile) {
  const targeted = targetMatches(originalBike, bikes);
  const foam = mastModel.foamPreset(state.foamColor);
  const baseRgb = profile.diffuser === "foam" ? foam.baseRgb : [224, 232, 238];
  const baseStart = project(
    worldPoint(workingBike, lightMast.x, lightMast.lightBottomY, lightMast.z),
    basis,
  );
  const baseEnd = project(
    worldPoint(workingBike, lightMast.x, lightMast.lightTopY, lightMast.z),
    basis,
  );
  if (!baseStart || !baseEnd) return;

  const tubeWidth = Math.max(
    profile.diffuser === "foam" ? 1.5 : 1.1,
    profile.outerRadiusM * 2 * ((baseStart.scale + baseEnd.scale) / 2),
  );
  drawScreenLine(
    baseStart,
    baseEnd,
    tubeWidth,
    rgbCss(baseRgb),
    profile.diffuser === "foam" ? 0.5 : 0.32,
    "source-over",
  );
  drawScreenLine(
    baseStart,
    baseEnd,
    Math.max(0.55, tubeWidth * 0.42),
    rgbCss(mixRgb(baseRgb, [255, 255, 255], 0.22)),
    0.16,
    "source-over",
  );

  const minimumSampleCount = mastModel.renderSampleCount(
    state.hardwareMode,
    (baseStart.depth + baseEnd.depth) / 2,
  );
  const projectedLength = Math.hypot(
    baseEnd.x - baseStart.x,
    baseEnd.y - baseStart.y,
  );
  const sampleCount = Math.min(
    profile.ledCount,
    Math.max(minimumSampleCount, Math.ceil(projectedLength / 3)),
  );
  const segmentCount = sampleCount - 1;
  for (let index = 0; index < segmentCount; index += 1) {
    const startProgress = index / segmentCount;
    const endProgress = (index + 1) / segmentCount;
    const start = project(
      worldPoint(
        workingBike,
        lightMast.x,
        lightMast.lightBottomY + startProgress * profile.heightM,
        lightMast.z,
      ),
      basis,
    );
    const end = project(
      worldPoint(
        workingBike,
        lightMast.x,
        lightMast.lightBottomY + endProgress * profile.heightM,
        lightMast.z,
      ),
      basis,
    );
    if (!start || !end) continue;

    const physicalIndex = mastModel.physicalIndex(
      index,
      segmentCount,
      profile.ledCount,
    );
    const sample = blurredLightSample(
      physicalIndex,
      profile,
      originalBike.index,
      targeted,
    );
    const transmitted =
      profile.diffuser === "foam"
        ? mastModel.applyFoamTransmission(
            sample.rgb,
            state.foamColor,
            state.foamTransmission,
          )
        : sample.rgb.map((channel) => channel * profile.transmission);
    const exposed = transmitted.map((channel) => Math.min(255, channel * 3.4));
    const color = mixRgb(
      baseRgb,
      exposed,
      Math.min(0.92, 0.22 + sample.intensity * 0.86),
    );
    const calibrationGain =
      profile.diffuser === "foam"
        ? state.foamTransmission / foam.transmission
        : 1;
    const backContribution =
      profile.diffuser === "foam"
        ? foam.backContribution
        : profile.backContribution;
    const diffuseIntensity =
      sample.intensity *
      Math.min(1.55, calibrationGain) *
      (0.7 + backContribution * 0.5);
    const depth = (start.depth + end.depth) / 2;
    const bloom = depth > 25 ? 0.8 : depth > 12 ? 0.55 : 0.35;

    if (diffuseIntensity > 0.04) {
      drawScreenLine(
        start,
        end,
        tubeWidth * (1.55 + bloom * 1.4),
        rgbCss(exposed),
        Math.min(0.42, diffuseIntensity * 0.32),
        "lighter",
        "butt",
      );
    }
    drawScreenLine(
      start,
      end,
      tubeWidth,
      rgbCss(color),
      Math.min(0.9, 0.2 + diffuseIntensity * 0.72),
      "source-over",
      "butt",
    );
    drawScreenLine(
      start,
      end,
      Math.max(0.55, tubeWidth * 0.45),
      rgbCss(exposed),
      Math.min(0.82, 0.08 + diffuseIntensity * 0.64),
      "lighter",
      "butt",
    );
  }
}

function render() {
  drawBackground();
  const basis = cameraBasis();
  drawRoad(basis);
  const bikes = formation(state.packSize);
  const sortedBikes = [...bikes].sort((a, b) => {
    const depthA = project({ x: a.x, y: 0.6, z: a.z }, basis)?.depth ?? 0;
    const depthB = project({ x: b.x, y: 0.6, z: b.z }, basis)?.depth ?? 0;
    return depthB - depthA;
  });
  sortedBikes.forEach((bike) => drawBike(bike, bikes, basis));
}

function frame(now) {
  const delta = Math.min(0.05, (now - lastFrameAt) / 1000);
  lastFrameAt = now;
  if (!state.paused) state.simulationTime += delta;

  if (now - lastRenderAt >= 1000 / 30) {
    render();
    document.getElementById("phase-readout").textContent =
      `Phase ${state.simulationTime.toFixed(2)} s`;
    lastRenderAt = now;
  }
  requestAnimationFrame(frame);
}

function paletteLabel() {
  const option = document.querySelector(
    `#palette-select option[value="${state.palette}"]`,
  );
  return option?.textContent?.toLowerCase() ?? state.palette;
}

function hardwareNote(profile) {
  if (profile.id === "straight") {
    return `${profile.stripLengthM.toFixed(2)} m strip · 60 LEDs/m · ${profile.ledCount} LEDs`;
  }
  const build = `${profile.stripLengthM.toFixed(2)} m strip · ${profile.turns.toFixed(1)} turns · ${Math.round(profile.pitchM * 1000)} mm pitch`;
  if (profile.id === "opal") return `${build} · 40 mm opal sleeve`;
  if (profile.id === "noodle") return `${build} · 65 mm foam · 3 A target`;
  return build;
}

function updateInterface() {
  const effect =
    state.effect === "workshop" && activeWorkshopPattern
      ? {
          code: activeWorkshopPattern.code,
          label: activeWorkshopPattern.name,
        }
      : simulatorEffects[state.effect];
  const profile = mastModel.profile(state.hardwareMode);
  document.getElementById("effect-code").textContent = effect.code;
  document.getElementById("cue-name").textContent = effect.label;
  document.getElementById("hardware-summary").textContent =
    `${profile.ledCount} LEDs`;
  document.getElementById("hardware-note").textContent = hardwareNote(profile);
  document.getElementById("noodle-settings").hidden =
    state.hardwareMode !== "noodle";
  document.getElementById("foam-transmission-value").textContent =
    `${Math.round(state.foamTransmission * 100)}%`;
  document.getElementById("pack-size-value").textContent =
    `${state.packSize} ${state.packSize === 1 ? "bike" : "bikes"}`;
  document.getElementById("brightness-value").textContent =
    `${Math.round(state.brightness * 100)}%`;
  document.getElementById("effect-speed-value").textContent =
    `${state.speed.toFixed(1)}×`;
  document.getElementById("color-value").textContent =
    state.customColor.toUpperCase();
  document.getElementById("cue-detail").textContent =
    `${state.packSize} ${state.packSize === 1 ? "bike" : "bikes"} · ${
      state.synchronized ? "synchronized" : "staggered"
    } · ${paletteLabel()} · ${profile.shortLabel.toLowerCase()}${
      state.effect === "workshop" && state.bikeVariation > 0
        ? ` · ${Math.round(state.bikeVariation * 100)}% bike variation`
        : ""
    }`;
  document.getElementById("simulation-status").textContent = state.paused
    ? "Simulation paused"
    : "Live simulation";

  document.querySelectorAll("[data-effect]").forEach((button) => {
    const active = button.dataset.effect === state.effect;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  document.querySelectorAll("[data-view]").forEach((button) => {
    const active = button.dataset.view === state.view;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  document.querySelectorAll("[data-hardware]").forEach((button) => {
    const active = button.dataset.hardware === state.hardwareMode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  const pauseButton = document.getElementById("pause-toggle");
  pauseButton.textContent = state.paused ? "Resume" : "Pause";
  pauseButton.setAttribute("aria-pressed", String(state.paused));
}

function selectEffect(effectName) {
  if (!simulatorEffects[effectName]) return;
  state.effect = effectName;
  state.simulationTime = 0;
  updateInterface();
}

const workshopElements = {
  shell: document.querySelector(".simulator-shell"),
  canvasWrap: document.querySelector(".canvas-wrap"),
  panel: document.getElementById("pattern-workshop"),
  open: document.getElementById("open-workshop"),
  close: document.getElementById("close-workshop"),
  template: document.getElementById("workshop-template"),
  author: document.getElementById("pattern-author"),
  name: document.getElementById("pattern-name"),
  code: document.getElementById("pattern-code"),
  variation: document.getElementById("bike-variation"),
  variationValue: document.getElementById("bike-variation-value"),
  body: document.getElementById("pattern-body"),
  run: document.getElementById("run-pattern"),
  copy: document.getElementById("copy-pattern"),
  download: document.getElementById("download-pattern"),
  import: document.getElementById("import-pattern"),
  status: document.getElementById("workshop-status"),
  statusTitle: document.getElementById("workshop-status-title"),
  statusDetail: document.getElementById("workshop-status-detail"),
  floor: document.getElementById("metric-floor"),
  colors: document.getElementById("metric-colors"),
  motion: document.getElementById("metric-motion"),
};

function setWorkshopStatus(stateName, title, detail) {
  workshopElements.status.dataset.state = stateName;
  workshopElements.statusTitle.textContent = title;
  workshopElements.statusDetail.textContent = detail;
}

function clearWorkshopMetrics() {
  workshopElements.floor.textContent = "—";
  workshopElements.colors.textContent = "—";
  workshopElements.motion.textContent = "—";
}

function workshopDraft() {
  return patternWorkshop.createPattern({
    name: workshopElements.name.value,
    code: workshopElements.code.value,
    author: workshopElements.author.value,
    body: workshopElements.body.value,
    preview: {
      palette: state.palette,
      speed: state.speed,
      brightness: state.brightness,
      variation: state.bikeVariation,
    },
  });
}

function applyWorkshopPreview({ quiet = false, reviewApproved = false } = {}) {
  if (workshopReviewGate.isRequired() && !reviewApproved) {
    setWorkshopStatus(
      "ready",
      "Review imported code first",
      "Press Run preview when you are ready to execute this imported pattern.",
    );
    return null;
  }
  try {
    const result = patternWorkshop.analyzePattern(workshopDraft(), {
      palette: activePalette(),
      variation: state.bikeVariation,
    });
    activeWorkshopPattern = result.pattern;
    activeWorkshopRenderer = result.renderer;
    workshopRuntimeError = null;
    workshopReviewGate.approve();
    workshopElements.code.value = result.pattern.code;
    state.effect = "workshop";
    state.simulationTime = 0;
    workshopElements.floor.textContent = `${Math.round(
      result.report.minimumIntensity * 100,
    )}%`;
    workshopElements.colors.textContent = String(result.report.uniqueColors);
    workshopElements.motion.textContent = result.report.moves ? "Yes" : "No";

    if (result.report.warnings.length > 0) {
      setWorkshopStatus(
        "warning",
        quiet ? "Preview updated with notes" : "Pattern runs with notes",
        result.report.warnings.join(" · "),
      );
    } else {
      setWorkshopStatus(
        "success",
        quiet ? "Live preview updated" : "Pattern checks passed",
        "Deterministic, shifting, colorful, and above the 50% always-on floor.",
      );
    }
    updateInterface();
    return result;
  } catch (error) {
    clearWorkshopMetrics();
    setWorkshopStatus("error", "Pattern needs a fix", error.message);
    return null;
  }
}

function reportWorkshopRuntimeError(error) {
  if (workshopRuntimeError === error.message) return;
  workshopRuntimeError = error.message;
  setWorkshopStatus("error", "Preview stopped on one frame", error.message);
}

function scheduleWorkshopPreview() {
  window.clearTimeout(workshopPreviewTimer);
  if (workshopReviewGate.isRequired()) {
    setWorkshopStatus(
      "ready",
      "Imported draft waiting for review",
      "Changes are saved in the editor, but imported code stays inert until Run preview.",
    );
    return;
  }
  setWorkshopStatus(
    "ready",
    "Editing draft",
    "The preview will update after you pause typing.",
  );
  workshopPreviewTimer = window.setTimeout(
    () => applyWorkshopPreview({ quiet: true }),
    450,
  );
}

function loadWorkshopPattern(
  pattern,
  { applyVariation = false, preserveAuthor = false, preview = false } = {},
) {
  workshopElements.name.value = pattern.name;
  workshopElements.code.value = pattern.code;
  workshopElements.body.value = pattern.body;
  if (!preserveAuthor)
    workshopElements.author.value = String(pattern.author ?? "");
  if (applyVariation) setBikeVariation(Number(pattern.preview?.variation) || 0);
  clearWorkshopMetrics();
  if (preview) applyWorkshopPreview();
}

function loadWorkshopTemplate(templateName, { preview = true } = {}) {
  const template = patternWorkshop.templates[templateName];
  if (!template) return;
  workshopReviewGate.clear();
  loadWorkshopPattern(template, { preserveAuthor: true, preview });
}

function setBikeVariation(value) {
  state.bikeVariation = Math.max(0, Math.min(1, value));
  workshopElements.variation.value = String(
    Math.round(state.bikeVariation * 100),
  );
  workshopElements.variationValue.textContent = `${Math.round(
    state.bikeVariation * 100,
  )}%`;
  updateInterface();
}

function openWorkshop() {
  controlsCollapsedForWorkshop =
    !state.controlsCollapsed &&
    window.matchMedia("(min-width: 901px) and (max-width: 1199px)").matches;
  if (controlsCollapsedForWorkshop) setControlsCollapsed(true);
  workshopElements.panel.hidden = false;
  workshopElements.shell.classList.add("is-workshop-open");
  workshopElements.canvasWrap.classList.add("is-workshop-open");
  workshopElements.open.setAttribute("aria-expanded", "true");
  workshopElements.panel.scrollTop = 0;
  workshopElements.close.focus({ preventScroll: true });
  window.requestAnimationFrame(resizeCanvas);
}

function closeWorkshop() {
  workshopElements.panel.hidden = true;
  workshopElements.shell.classList.remove("is-workshop-open");
  workshopElements.canvasWrap.classList.remove("is-workshop-open");
  workshopElements.open.setAttribute("aria-expanded", "false");
  workshopElements.open.focus();
  if (controlsCollapsedForWorkshop && state.controlsCollapsed) {
    setControlsCollapsed(false);
  }
  controlsCollapsedForWorkshop = false;
  window.requestAnimationFrame(resizeCanvas);
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Direct file launches can deny the modern clipboard API.
    }
  }
  const fallback = document.createElement("textarea");
  fallback.value = text;
  fallback.setAttribute("readonly", "");
  fallback.style.position = "fixed";
  fallback.style.opacity = "0";
  document.body.append(fallback);
  fallback.select();
  const copied = document.execCommand("copy");
  fallback.remove();
  if (!copied)
    throw new Error("Clipboard access was blocked; use Download instead");
}

async function copyWorkshopPattern() {
  const result = applyWorkshopPreview();
  if (!result) return;
  try {
    await copyText(patternWorkshop.serializePattern(result.pattern));
    setWorkshopStatus(
      "success",
      "Share JSON copied",
      "Paste it into a message to Dax or save it as a .glow-pattern.json file.",
    );
  } catch (error) {
    setWorkshopStatus("error", "Could not copy JSON", error.message);
  }
}

function downloadWorkshopPattern() {
  const result = applyWorkshopPreview();
  if (!result) return;
  const contents = patternWorkshop.serializePattern(result.pattern);
  const url = URL.createObjectURL(
    new Blob([contents], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `${result.pattern.code.toLowerCase().replaceAll("_", "-")}.glow-pattern.json`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  setWorkshopStatus(
    "success",
    "Pattern downloaded",
    `Send ${link.download} to Dax for review and firmware integration.`,
  );
}

async function importWorkshopPattern(file) {
  if (!file) return;
  if (file.size > 64000) {
    setWorkshopStatus(
      "error",
      "Pattern file is too large",
      "Files are limited to 64 KB.",
    );
    return;
  }
  try {
    const pattern = patternWorkshop.parsePattern(await file.text());
    workshopElements.template.value = "custom";
    loadWorkshopPattern(pattern, { applyVariation: true });
    workshopReviewGate.require();
    setWorkshopStatus(
      "ready",
      `${pattern.name} imported`,
      "Review the code, then press Run preview. Imported code never runs automatically.",
    );
  } catch (error) {
    setWorkshopStatus("error", "Could not import pattern", error.message);
  } finally {
    workshopElements.import.value = "";
  }
}

function selectView(viewName) {
  if (!viewPresets[viewName]) return;
  state.view = viewName;
  camera = createCamera(viewPresets[viewName]);
  updateInterface();
}

function setControlsCollapsed(collapsed) {
  state.controlsCollapsed = collapsed;
  workspace.classList.toggle("is-controls-collapsed", collapsed);
  controlPanel.setAttribute("aria-hidden", String(collapsed));
  controlsToggle.setAttribute("aria-expanded", String(!collapsed));
  controlsToggleIcon.textContent = collapsed ? "→" : "←";
  controlsToggleLabel.textContent = collapsed
    ? "Show controls"
    : "Hide controls";
  window.requestAnimationFrame(resizeCanvas);
}

function groupEffectButtons() {
  const groups = [
    { label: "Core", minimumId: 0, maximumId: 9 },
    { label: "Generative", minimumId: 10, maximumId: 15 },
    { label: "Epic", minimumId: 16, maximumId: 35 },
  ];
  const grid = document.querySelector(".effect-grid");
  const buttons = new Map(
    [...grid.querySelectorAll("[data-effect]")].map((button) => [
      button.dataset.effect,
      button,
    ]),
  );
  const fragment = document.createDocumentFragment();

  groups.forEach(({ label, minimumId, maximumId }) => {
    const effects = Object.entries(simulatorEffects)
      .filter(([, effect]) => effect.id >= minimumId && effect.id <= maximumId)
      .sort((first, second) => first[1].id - second[1].id);
    const heading = document.createElement("h3");
    const count = document.createElement("small");

    heading.className = "effect-group-heading";
    heading.textContent = label;
    count.textContent = `${effects.length} patterns`;
    heading.append(count);
    fragment.append(heading);
    effects.forEach(([effectName]) => fragment.append(buttons.get(effectName)));
  });

  grid.replaceChildren(fragment);
}

groupEffectButtons();
loadWorkshopTemplate(workshopElements.template.value, { preview: false });

document.querySelectorAll("[data-effect]").forEach((button) => {
  button.addEventListener("click", () => selectEffect(button.dataset.effect));
});

document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => selectView(button.dataset.view));
});

controlsToggle.addEventListener("click", () => {
  controlsCollapsedForWorkshop = false;
  setControlsCollapsed(!state.controlsCollapsed);
});

document.querySelectorAll("[data-hardware]").forEach((button) => {
  button.addEventListener("click", () => {
    state.hardwareMode = button.dataset.hardware;
    updateInterface();
  });
});

workshopElements.open.addEventListener("click", openWorkshop);
workshopElements.close.addEventListener("click", closeWorkshop);
workshopElements.run.addEventListener("click", () =>
  applyWorkshopPreview({ reviewApproved: true }),
);
workshopElements.copy.addEventListener("click", copyWorkshopPattern);
workshopElements.download.addEventListener("click", downloadWorkshopPattern);
workshopElements.import.addEventListener("change", (event) => {
  importWorkshopPattern(event.target.files?.[0]);
});
workshopElements.template.addEventListener("change", (event) => {
  if (event.target.value !== "custom") loadWorkshopTemplate(event.target.value);
});
workshopElements.variation.addEventListener("input", (event) => {
  setBikeVariation(Number(event.target.value) / 100);
  scheduleWorkshopPreview();
});
workshopElements.code.addEventListener("input", () => {
  workshopElements.code.value = workshopElements.code.value.toUpperCase();
  workshopElements.template.value = "custom";
  scheduleWorkshopPreview();
});
for (const field of [
  workshopElements.author,
  workshopElements.name,
  workshopElements.body,
]) {
  field.addEventListener("input", () => {
    workshopElements.template.value = "custom";
    scheduleWorkshopPreview();
  });
}
workshopElements.body.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || (!event.metaKey && !event.ctrlKey)) return;
  event.preventDefault();
  window.clearTimeout(workshopPreviewTimer);
  applyWorkshopPreview({ reviewApproved: true });
});

document.getElementById("foam-color").addEventListener("change", (event) => {
  state.foamColor = event.target.value;
  state.foamTransmission = mastModel.foamPreset(state.foamColor).transmission;
  document.getElementById("foam-transmission").value = String(
    Math.round(state.foamTransmission * 100),
  );
  updateInterface();
});

document
  .getElementById("foam-transmission")
  .addEventListener("input", (event) => {
    state.foamTransmission = Number(event.target.value) / 100;
    updateInterface();
  });

document
  .getElementById("palette-select")
  .addEventListener("change", (event) => {
    state.palette = event.target.value;
    updateInterface();
  });

document.getElementById("target-select").addEventListener("change", (event) => {
  state.target = event.target.value;
  updateInterface();
});

document.getElementById("custom-color").addEventListener("input", (event) => {
  state.customColor = event.target.value;
  state.palette = "custom";
  document.getElementById("palette-select").value = "custom";
  updateInterface();
});

document.getElementById("pack-size").addEventListener("input", (event) => {
  state.packSize = Number(event.target.value);
  updateInterface();
});

document.getElementById("brightness").addEventListener("input", (event) => {
  state.brightness = Number(event.target.value) / 100;
  updateInterface();
});

document.getElementById("effect-speed").addEventListener("input", (event) => {
  state.speed = Number(event.target.value) / 100;
  updateInterface();
});

document.getElementById("sync-toggle").addEventListener("change", (event) => {
  state.synchronized = event.target.checked;
  updateInterface();
});

document.getElementById("pause-toggle").addEventListener("click", () => {
  state.paused = !state.paused;
  updateInterface();
});

document.getElementById("reset-camera").addEventListener("click", () => {
  camera = createCamera(viewPresets[state.view]);
});

canvas.addEventListener("pointerdown", (event) => {
  activePointer = event.pointerId;
  dragStart = {
    x: event.clientX,
    y: event.clientY,
    azimuth: camera.azimuth,
    elevation: camera.elevation,
  };
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener("pointermove", (event) => {
  if (activePointer !== event.pointerId || !dragStart) return;
  camera.azimuth = dragStart.azimuth - (event.clientX - dragStart.x) * 0.008;
  camera.elevation = Math.max(
    -0.04,
    Math.min(1.35, dragStart.elevation + (event.clientY - dragStart.y) * 0.006),
  );
});

function releasePointer(event) {
  if (activePointer !== event.pointerId) return;
  activePointer = null;
  dragStart = null;
}

canvas.addEventListener("pointerup", releasePointer);
canvas.addEventListener("pointercancel", releasePointer);
canvas.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    camera.distance = Math.max(
      5,
      Math.min(34, camera.distance + event.deltaY * 0.018),
    );
  },
  { passive: false },
);
canvas.addEventListener("dblclick", () => {
  camera = createCamera(viewPresets[state.view]);
});

window.addEventListener("keydown", (event) => {
  if (
    event.code !== "Space" ||
    ["INPUT", "SELECT", "BUTTON", "TEXTAREA"].includes(
      document.activeElement?.tagName,
    )
  )
    return;
  event.preventDefault();
  state.paused = !state.paused;
  updateInterface();
});

new ResizeObserver(resizeCanvas).observe(canvas);
resizeCanvas();
updateInterface();
requestAnimationFrame(frame);

globalThis.glowSimulator = {
  effects: simulatorEffects,
  mast: mastModel,
  sampleEffect: simulatorSampleEffect,
  state,
  selectEffect,
  setControlsCollapsed,
  selectView,
  workshop: {
    applyPreview: applyWorkshopPreview,
    close: closeWorkshop,
    open: openWorkshop,
    readDraft: workshopDraft,
  },
};
