const simulatorEffects = globalThis.glowEffects.effects;
const simulatorSampleEffect = globalThis.glowEffects.sampleEffect;
const patternWorkshop = globalThis.glowPatternWorkshop;

const canvas = document.getElementById("pack-canvas");
const context = canvas.getContext("2d", { alpha: false });
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
  synchronized: true,
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

function drawBackground() {
  const sky = context.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#060913");
  sky.addColorStop(0.62, "#10152a");
  sky.addColorStop(1, "#090d13");
  context.fillStyle = sky;
  context.fillRect(0, 0, width, height);

  for (const star of stars) {
    context.globalAlpha = star.alpha;
    context.fillStyle = "#d8e9ff";
    context.beginPath();
    context.arc(star.x * width, star.y * height, star.size, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;

  const horizon = height * 0.56;
  const glow = context.createRadialGradient(
    width * 0.5,
    horizon,
    0,
    width * 0.5,
    horizon,
    width * 0.52,
  );
  glow.addColorStop(0, "rgba(93, 91, 177, 0.18)");
  glow.addColorStop(1, "rgba(19, 23, 42, 0)");
  context.fillStyle = glow;
  context.fillRect(0, height * 0.18, width, height * 0.6);

  context.fillStyle = "#0b101b";
  context.beginPath();
  context.moveTo(0, horizon + 30);
  for (let index = 0; index <= 16; index += 1) {
    const x = (index / 16) * width;
    const y = horizon - 10 - pseudoRandom(index * 73 + 9) * height * 0.09;
    context.lineTo(x, y);
  }
  context.lineTo(width, height);
  context.lineTo(0, height);
  context.closePath();
  context.fill();
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

  drawLightStrip(workingBike, bike, bikes, basis);

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

function drawLightStrip(workingBike, originalBike, bikes, basis) {
  const pixelCount = 24;
  const targeted = targetMatches(originalBike, bikes);
  for (let index = 0; index < pixelCount; index += 1) {
    const progress = index / (pixelCount - 1);
    const y =
      lightMast.lightBottomY +
      progress * (lightMast.lightTopY - lightMast.lightBottomY);
    const point = project(
      worldPoint(workingBike, lightMast.x, y, lightMast.z - 0.025),
      basis,
    );
    if (!point) continue;

    const { rgb, intensity } = lightSample(
      index,
      pixelCount,
      originalBike.index,
      targeted,
    );
    const [red, green, blue] = rgb;
    const coreRadius = Math.max(0.8, Math.min(4.2, point.scale * 0.018));
    const glowRadius = coreRadius * (2.8 + intensity * 2.6);

    if (intensity > 0.055) {
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
        `rgba(${red}, ${green}, ${blue}, ${Math.min(0.82, intensity * 0.78)})`,
      );
      glow.addColorStop(
        0.28,
        `rgba(${red}, ${green}, ${blue}, ${intensity * 0.35})`,
      );
      glow.addColorStop(1, `rgba(${red}, ${green}, ${blue}, 0)`);
      context.fillStyle = glow;
      context.beginPath();
      context.arc(point.x, point.y, glowRadius, 0, Math.PI * 2);
      context.fill();
      context.globalCompositeOperation = "source-over";
    }

    context.fillStyle = `rgba(${red}, ${green}, ${blue}, ${Math.max(0.18, intensity)})`;
    context.beginPath();
    context.arc(point.x, point.y, coreRadius, 0, Math.PI * 2);
    context.fill();
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

function updateInterface() {
  const effect =
    state.effect === "workshop" && activeWorkshopPattern
      ? {
          code: activeWorkshopPattern.code,
          label: activeWorkshopPattern.name,
        }
      : simulatorEffects[state.effect];
  document.getElementById("effect-code").textContent = effect.code;
  document.getElementById("cue-name").textContent = effect.label;
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
    } · ${paletteLabel()}`;
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
  panel: document.getElementById("pattern-workshop"),
  open: document.getElementById("open-workshop"),
  close: document.getElementById("close-workshop"),
  template: document.getElementById("workshop-template"),
  author: document.getElementById("pattern-author"),
  name: document.getElementById("pattern-name"),
  code: document.getElementById("pattern-code"),
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
  { preserveAuthor = false, preview = false } = {},
) {
  workshopElements.name.value = pattern.name;
  workshopElements.code.value = pattern.code;
  workshopElements.body.value = pattern.body;
  if (!preserveAuthor)
    workshopElements.author.value = String(pattern.author ?? "");
  clearWorkshopMetrics();
  if (preview) applyWorkshopPreview();
}

function loadWorkshopTemplate(templateName, { preview = true } = {}) {
  const template = patternWorkshop.templates[templateName];
  if (!template) return;
  workshopReviewGate.clear();
  loadWorkshopPattern(template, { preserveAuthor: true, preview });
}

function openWorkshop() {
  workshopElements.panel.hidden = false;
  workshopElements.open.setAttribute("aria-expanded", "true");
  workshopElements.body.focus();
}

function closeWorkshop() {
  workshopElements.panel.hidden = true;
  workshopElements.open.setAttribute("aria-expanded", "false");
  workshopElements.open.focus();
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
    loadWorkshopPattern(pattern);
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
  sampleEffect: simulatorSampleEffect,
  state,
  selectEffect,
  selectView,
  workshop: {
    applyPreview: applyWorkshopPreview,
    close: closeWorkshop,
    open: openWorkshop,
    readDraft: workshopDraft,
  },
};
