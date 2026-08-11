function effect(id, label, code, periodMs) {
  return Object.freeze({ id, label, code, periodMs });
}

// IDs are append-only so future GlowCue packets can use the same stable mapping.
const effects = Object.freeze({
  off: effect(0, "Off", "OFF", 0),
  solid: effect(1, "Solid", "SOLID", 0),
  wipe: effect(2, "Color wipe", "COLOR_WIPE", 3100),
  comet: effect(3, "Comet", "COMET", 1700),
  rainbow: effect(4, "Rainbow", "RAINBOW", 7143),
  strobe: effect(5, "Find bike strobe", "FIND_BIKE_STROBE", 1050),
  pulse: effect(6, "Breathing pulse", "PULSE", 2400),
  scanner: effect(7, "Scanner", "SCANNER", 1800),
  chase: effect(8, "Segment chase", "SEGMENT_CHASE", 720),
  twinkle: effect(9, "Twinkle", "TWINKLE", 5760),
  supernova: effect(10, "Binary supernova", "BINARY_SUPERNOVA", 6000),
  sierpinski: effect(11, "Sierpiński lace", "SIERPINSKI_LACE", 6400),
  fold: effect(12, "Infinite fold", "INFINITE_FOLD", 5200),
  cantor: effect(13, "Cantor bloom", "CANTOR_BLOOM", 7000),
  flow: effect(14, "Fractal flow", "FRACTAL_FLOW", 8600),
  moire: effect(15, "Moiré tide", "MOIRE_TIDE", 6200),
  aurora: effect(16, "Aurora curtains", "AURORA_CURTAINS", 9400),
  lava: effect(17, "Lava cells", "LAVA_CELLS", 11200),
  voronoi: effect(18, "Voronoi glass", "VORONOI_GLASS", 12800),
  shockwave: effect(19, "Diamond shockwave", "DIAMOND_SHOCKWAVE", 4800),
  prism: effect(20, "Prism refraction", "PRISM_REFRACTION", 7600),
  glitch: effect(21, "Quantized glitch", "QUANTIZED_GLITCH", 3360),
  hyperspace: effect(22, "Hyperspace", "HYPERSPACE", 3900),
  caustic: effect(23, "Caustic pool", "CAUSTIC_POOL", 7100),
  topographic: effect(24, "Topographic lines", "TOPOGRAPHIC_LINES", 10300),
  ripple: effect(25, "Ripple engine", "RIPPLE_ENGINE", 6400),
  helix: effect(26, "Double helix", "DOUBLE_HELIX", 5700),
  crystal: effect(27, "Crystal growth", "CRYSTAL_GROWTH", 9600),
  magnetic: effect(28, "Magnetic flux", "MAGNETIC_FLUX", 8100),
  tectonic: effect(29, "Tectonic plates", "TECTONIC_PLATES", 15000),
  circuit: effect(30, "Circuit traces", "CIRCUIT_TRACES", 5200),
  woven: effect(31, "Woven light", "WOVEN_LIGHT", 8800),
  kaleidoscope: effect(32, "Kaleidoscope tiles", "KALEIDOSCOPE_TILES", 6900),
  bitstorm: effect(33, "Bitstorm", "BITSTORM", 4480),
  bloom: effect(34, "Pixel bloom", "PIXEL_BLOOM", 6000),
  mirage: effect(35, "Heat mirage", "HEAT_MIRAGE", 12000),
});

const ACTIVE_PATTERN_FLOOR = 0.34;

function positiveModulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function normalizedPhase(cueTimeMs, periodMs) {
  return positiveModulo(cueTimeMs, periodMs) / periodMs;
}

function paletteColor(palette, index) {
  return palette[positiveModulo(index, palette.length)];
}

function hashUnit(value) {
  return hash32(value) / 0xffffffff;
}

function clampUnit(value) {
  return Math.max(0, Math.min(1, value));
}

function hsvToRgb(hue, saturation = 1, value = 1) {
  const normalizedHue = positiveModulo(hue, 1);
  const sector = normalizedHue * 6;
  const chroma = value * saturation;
  const secondary = chroma * (1 - Math.abs((sector % 2) - 1));
  let rgb;

  if (sector < 1) rgb = [chroma, secondary, 0];
  else if (sector < 2) rgb = [secondary, chroma, 0];
  else if (sector < 3) rgb = [0, chroma, secondary];
  else if (sector < 4) rgb = [0, secondary, chroma];
  else if (sector < 5) rgb = [secondary, 0, chroma];
  else rgb = [chroma, 0, secondary];

  const match = value - chroma;
  return rgb.map((channel) => Math.round((channel + match) * 255));
}

function hash32(value) {
  let hash = value >>> 0;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

function twinkleNoise(pixelIndex, frame) {
  const seed =
    Math.imul(pixelIndex + 1, 0x9e3779b1) + Math.imul(frame + 1, 0x85ebca6b);
  return hash32(seed) / 0xffffffff;
}

function smoothstep(value) {
  const clamped = clampUnit(value);
  return clamped * clamped * (3 - 2 * clamped);
}

function triangleWave(value) {
  return 1 - Math.abs(positiveModulo(value, 1) * 2 - 1);
}

function circularDistance(first, second) {
  const distance = Math.abs(first - second);
  return Math.min(distance, 1 - distance);
}

function paletteGradient(palette, position) {
  const firstIndex = Math.floor(position);
  const blend = smoothstep(position - firstIndex);
  const first = paletteColor(palette, firstIndex);
  const second = paletteColor(palette, firstIndex + 1);
  return first.map(
    (channel, index) => channel + (second[index] - channel) * blend,
  );
}

function activePatternIntensity(value) {
  return ACTIVE_PATTERN_FLOOR + clampUnit(value) * (1 - ACTIVE_PATTERN_FLOOR);
}

function valueNoise(position, seed) {
  const cell = Math.floor(position);
  const blend = smoothstep(position - cell);
  const first = hashUnit(Math.imul(cell, 0x9e3779b1) ^ seed);
  const second = hashUnit(Math.imul(cell + 1, 0x9e3779b1) ^ seed);
  return first + (second - first) * blend;
}

function countBits(value) {
  let bits = value >>> 0;
  bits -= (bits >>> 1) & 0x55555555;
  bits = (bits & 0x33333333) + ((bits >>> 2) & 0x33333333);
  return (((bits + (bits >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

function peak(distance, width) {
  return clampUnit(1 - Math.abs(distance) / width);
}

function binaryPulse(position, depth) {
  const cellCount = 2 ** depth;
  const distance = positiveModulo(position * cellCount, 1) - 0.5;
  return smoothstep(peak(distance, Math.max(0.12, 0.3 - depth * 0.025)));
}

function rule90Cell(row, x) {
  const sum = row + x;
  if (sum % 2 !== 0) return false;
  const left = sum / 2;
  const right = row - left;
  return left >= 0 && right >= 0 && (left & right) === 0;
}

function cantorAlive(position, depth) {
  let cursor = position;
  for (let level = 0; level < depth; level += 1) {
    const digit = Math.min(2, Math.floor(cursor * 3));
    if (digit === 1) return 0;
    cursor = positiveModulo(cursor * 3, 1);
  }
  return 1;
}

/**
 * Pure, renderer-independent effect kernel.
 *
 * Inputs intentionally match values that fit a future embedded renderer:
 * an effect key, LED index/count, integer cue time in milliseconds, RGB
 * palette, and an optional pack index. The result is one RGB color plus
 * normalized intensity.
 */
function sampleEffect(
  effectName,
  pixelIndex,
  pixelCount,
  cueTimeMs,
  palette,
  bikeIndex = 0,
) {
  if (!effects[effectName])
    throw new RangeError(`Unknown effect: ${effectName}`);
  if (
    !Number.isInteger(pixelIndex) ||
    pixelIndex < 0 ||
    pixelIndex >= pixelCount
  )
    throw new RangeError("Pixel index must be inside the strip");
  if (!Number.isInteger(pixelCount) || pixelCount < 1)
    throw new RangeError("Pixel count must be a positive integer");
  if (!Array.isArray(palette) || palette.length < 1)
    throw new RangeError("Palette must contain at least one RGB color");
  if (!Number.isInteger(bikeIndex) || bikeIndex < 0)
    throw new RangeError("Bike index must be a non-negative integer");

  const timeMs = Math.trunc(cueTimeMs);
  let rgb = palette[0];
  let intensity = 1;

  if (effectName === "off") {
    intensity = 0;
  } else if (effectName === "solid") {
    rgb = palette[0];
  } else if (effectName === "pulse") {
    const phase = normalizedPhase(timeMs, effects.pulse.periodMs);
    const triangle = 1 - Math.abs(phase * 2 - 1);
    const eased = triangle * triangle * (3 - 2 * triangle);
    rgb = paletteColor(palette, Math.floor(timeMs / effects.pulse.periodMs));
    intensity = 0.1 + eased * 0.9;
  } else if (effectName === "wipe") {
    const phase = normalizedPhase(timeMs, effects.wipe.periodMs);
    const fill = phase < 0.78 ? phase / 0.78 : (1 - phase) / 0.22;
    const edge = fill * (pixelCount + 3) - 1.5;
    rgb = paletteColor(palette, Math.floor(timeMs / effects.wipe.periodMs));
    intensity = pixelIndex <= edge ? 1 : 0.03;
  } else if (effectName === "comet") {
    const head = normalizedPhase(timeMs, effects.comet.periodMs) * pixelCount;
    const distance = positiveModulo(head - pixelIndex, pixelCount);
    rgb = paletteColor(
      palette,
      Math.floor((pixelIndex / pixelCount) * palette.length),
    );
    intensity =
      distance < pixelCount * 0.52 ? Math.exp(-distance * 0.3) : 0.025;
  } else if (effectName === "scanner") {
    const phase = normalizedPhase(timeMs, effects.scanner.periodMs);
    const head = (1 - Math.abs(phase * 2 - 1)) * (pixelCount - 1);
    const distance = Math.abs(pixelIndex - head);
    const falloff = 1 - Math.min(1, distance / 5);
    rgb = paletteColor(palette, Math.floor(timeMs / effects.scanner.periodMs));
    intensity = Math.max(0.025, falloff * falloff);
  } else if (effectName === "chase") {
    const step = Math.floor(timeMs / 120);
    const position = positiveModulo(pixelIndex - step, 6);
    rgb = paletteColor(palette, Math.floor((pixelIndex - step) / 3));
    intensity = position < 3 ? 1 : 0.035;
  } else if (effectName === "twinkle") {
    const frame = Math.floor(timeMs / 90);
    const noise = twinkleNoise(pixelIndex, frame);
    const colorSeed = hash32(
      Math.imul(pixelIndex + 1, 0x27d4eb2d) ^ (frame + 1),
    );
    rgb = paletteColor(palette, colorSeed);
    intensity = noise > 0.83 ? 0.55 + ((noise - 0.83) / 0.17) * 0.45 : 0.035;
  } else if (effectName === "rainbow") {
    rgb = hsvToRgb(pixelIndex / pixelCount - timeMs * 0.00014, 0.82, 1);
  } else if (effectName === "strobe") {
    const cycleMs = positiveModulo(timeMs, effects.strobe.periodMs);
    const flash =
      cycleMs < 75 ||
      (cycleMs > 160 && cycleMs < 235) ||
      (cycleMs > 320 && cycleMs < 395);
    rgb = flash ? [255, 255, 255] : palette[0];
    intensity = flash ? 1 : 0.055;
  } else if (effectName === "supernova") {
    const position = (pixelIndex + 0.5) / pixelCount;
    const depthPosition =
      normalizedPhase(timeMs, effects.supernova.periodMs) * 6;
    const depth = Math.min(5, Math.floor(depthPosition));
    const transition = smoothstep(depthPosition - depth);
    const current = binaryPulse(position, depth);
    const next = binaryPulse(position, Math.min(5, depth + 1));
    const split = Math.min(1, current * (1 - transition) + next * transition);
    rgb = paletteGradient(
      palette,
      depth + position * palette.length + transition,
    );
    intensity = activePatternIntensity(split);
  } else if (effectName === "sierpinski") {
    const row = positiveModulo(Math.floor(timeMs / 100) + bikeIndex * 3, 64);
    const x = Math.round((pixelIndex / Math.max(1, pixelCount - 1)) * 62 - 31);
    let lace = 0;
    for (let trail = 0; trail < 3; trail += 1) {
      const trailRow = row - trail;
      if (trailRow >= 0 && rule90Cell(trailRow, x))
        lace = Math.max(lace, [1, 0.42, 0.16][trail]);
    }
    rgb = paletteGradient(
      palette,
      (pixelIndex / pixelCount) * palette.length +
        row / 12 +
        bikeIndex * 0.24 +
        lace * 0.6,
    );
    intensity = activePatternIntensity(lace);
  } else if (effectName === "fold") {
    const position = (pixelIndex + 0.5) / pixelCount;
    const phase = normalizedPhase(timeMs, effects.fold.periodMs);
    let folded = position;
    let strongest = 0;
    let strongestDepth = 0;
    for (let depth = 0; depth < 5; depth += 1) {
      folded = Math.abs(folded * 2 - 1);
      const head = positiveModulo(phase + depth * 0.13, 1);
      const distance = Math.min(
        Math.abs(folded - head),
        1 - Math.abs(folded - head),
      );
      const level = peak(distance, 0.11 - depth * 0.012) * (1 - depth * 0.1);
      if (level > strongest) {
        strongest = level;
        strongestDepth = depth;
      }
    }
    rgb = paletteGradient(
      palette,
      folded * palette.length + phase * palette.length + strongestDepth * 0.3,
    );
    intensity = activePatternIntensity(smoothstep(strongest));
  } else if (effectName === "cantor") {
    const position = (pixelIndex + 0.5) / pixelCount;
    const maxDepth = Math.min(
      6,
      Math.max(1, Math.floor(Math.log(pixelCount) / Math.log(3)) + 2),
    );
    const phase = normalizedPhase(
      timeMs + bikeIndex * 280,
      effects.cantor.periodMs,
    );
    const depthPosition = (1 - Math.abs(phase * 2 - 1)) * maxDepth;
    const depth = Math.floor(depthPosition);
    const transition = smoothstep(depthPosition - depth);
    const current = cantorAlive(position, depth);
    const next = cantorAlive(position, Math.min(maxDepth, depth + 1));
    const islands = current * (1 - transition) + next * transition;
    rgb = paletteGradient(
      palette,
      position * palette.length * 2 +
        depth +
        phase * palette.length +
        bikeIndex * 0.22,
    );
    intensity = activePatternIntensity(islands);
  } else if (effectName === "flow") {
    const position = (pixelIndex + 0.5) / pixelCount;
    const phase = normalizedPhase(timeMs, effects.flow.periodMs);
    const broad = triangleWave(position * 1.25 - phase);
    const medium = triangleWave(
      position * 2.75 + phase * 1.7 + bikeIndex * 0.03,
    );
    const fine = triangleWave(position * 5.5 - phase * 2.4);
    const field = broad * 0.5 + medium * 0.3 + fine * 0.2;
    rgb = paletteGradient(
      palette,
      position * palette.length * 1.4 +
        phase * palette.length * 2.2 +
        field * 1.8 +
        bikeIndex * 0.12,
    );
    intensity = 0.58 + field * 0.42;
  } else if (effectName === "moire") {
    const position = (pixelIndex + 0.5) / pixelCount;
    const phase = normalizedPhase(timeMs, effects.moire.periodMs);
    const rising = triangleWave(position * 4 - phase * 2.1);
    const falling = triangleWave(
      position * 7 + phase * 1.35 + bikeIndex * 0.05,
    );
    const interference = 1 - Math.abs(rising - falling);
    const facets = triangleWave(position * 13 - phase * 0.7);
    const field = interference * 0.75 + facets * 0.25;
    rgb = paletteGradient(
      palette,
      field * (palette.length + 0.8) +
        phase * palette.length +
        bikeIndex * 0.16,
    );
    intensity = 0.52 + field * 0.48;
  } else if (effectName === "aurora") {
    const position = (pixelIndex + 0.5) / pixelCount;
    const phase = normalizedPhase(timeMs, effects.aurora.periodMs);
    const warp =
      triangleWave(position * 3 - phase * 0.8 + bikeIndex * 0.05) * 0.14 +
      triangleWave(position * 7 + phase * 1.3) * 0.06;
    const curtain = triangleWave((position + warp) * 2 - phase * 0.7);
    const shimmer = triangleWave((position + warp) * 6 + phase * 1.9);
    rgb = paletteGradient(
      palette,
      curtain * (palette.length + 0.7) + phase * 1.8 + bikeIndex * 0.13,
    );
    intensity = 0.54 + (curtain * 0.65 + shimmer * 0.35) * 0.46;
  } else if (effectName === "lava") {
    const position = (pixelIndex + 0.5) / pixelCount;
    const phase = normalizedPhase(timeMs, effects.lava.periodMs);
    let strongest = 0;
    let second = 0;
    let strongestCell = 0;
    for (let cell = 0; cell < 4; cell += 1) {
      const direction = cell % 2 === 0 ? 1 : -1;
      const center = positiveModulo(
        hashUnit(cell * 71 + bikeIndex * 19) +
          direction * phase * (0.18 + cell * 0.035),
        1,
      );
      const weight = smoothstep(
        clampUnit(1 - circularDistance(position, center) / 0.3),
      );
      if (weight > strongest) {
        second = strongest;
        strongest = weight;
        strongestCell = cell;
      } else if (weight > second) {
        second = weight;
      }
    }
    const field = clampUnit(strongest + second * 0.38);
    rgb = paletteGradient(
      palette,
      strongestCell + field * 1.4 + phase * 1.2 + bikeIndex * 0.1,
    );
    intensity = 0.52 + field * 0.48;
  } else if (effectName === "voronoi") {
    const position = (pixelIndex + 0.5) / pixelCount;
    const phase = normalizedPhase(timeMs, effects.voronoi.periodMs);
    const packY = positiveModulo(bikeIndex * 0.173, 1);
    let nearest = Number.POSITIVE_INFINITY;
    let secondNearest = Number.POSITIVE_INFINITY;
    let winner = 0;
    for (let site = 0; site < 5; site += 1) {
      const direction = site % 2 === 0 ? 1 : -1;
      const siteX = positiveModulo(
        hashUnit(site * 97 + 11) + direction * phase * (0.09 + site * 0.01),
        1,
      );
      const siteY = hashUnit(site * 131 + 53);
      const distance =
        circularDistance(position, siteX) + Math.abs(packY - siteY) * 0.62;
      if (distance < nearest) {
        secondNearest = nearest;
        nearest = distance;
        winner = site;
      } else if (distance < secondNearest) {
        secondNearest = distance;
      }
    }
    const glassCenter = smoothstep(clampUnit((secondNearest - nearest) * 5));
    rgb = paletteGradient(palette, winner * 0.83 + phase * 1.7 + nearest * 2.4);
    intensity = 0.55 + glassCenter * 0.45;
  } else if (effectName === "shockwave") {
    const position = (pixelIndex + 0.5) / pixelCount;
    const cycle = Math.floor(timeMs / effects.shockwave.periodMs);
    const phase = normalizedPhase(timeMs, effects.shockwave.periodMs);
    const center = hashUnit(cycle * 83 + bikeIndex * 29);
    const distance = circularDistance(position, center);
    const radius = phase * 0.52;
    const ring = smoothstep(peak(distance - radius, 0.13));
    rgb = paletteGradient(
      palette,
      distance * palette.length * 4 + phase * 2 + cycle * 0.37,
    );
    intensity = 0.5 + ring * 0.5;
  } else if (effectName === "prism") {
    const position = (pixelIndex + 0.5) / pixelCount;
    const phase = normalizedPhase(timeMs, effects.prism.periodMs);
    const prism = 0.08 + triangleWave(phase) * 0.84;
    const distance = Math.abs(position - prism);
    const refraction = position * 3 + distance * 5 - phase * 2;
    rgb = paletteGradient(palette, refraction + bikeIndex * 0.09);
    intensity = 0.55 + (1 - clampUnit(distance * 1.2)) * 0.45;
  } else if (effectName === "glitch") {
    const position = (pixelIndex + 0.5) / pixelCount;
    const cell = Math.floor(position * 14);
    const epoch = Math.floor(timeMs / 280);
    const value = hash32(
      cell ^ Math.imul(epoch + 1, 0x85ebca6b) ^ Math.imul(bikeIndex + 1, 37),
    );
    rgb = paletteGradient(
      palette,
      ((value >>> 8) / 0xffffff) * palette.length * 2 + cell * 0.11,
    );
    intensity = 0.55 + ((value >>> 28) / 15) * 0.45;
  } else if (effectName === "hyperspace") {
    const position = (pixelIndex + 0.5) / pixelCount;
    const phase = normalizedPhase(timeMs, effects.hyperspace.periodMs);
    const depth = positiveModulo(
      position * 10 - phase * 10 + bikeIndex * 0.07,
      1,
    );
    const stretch = 1 / (1 + depth * 11);
    rgb = paletteGradient(
      palette,
      depth * palette.length * 1.7 + phase * 3 + bikeIndex * 0.12,
    );
    intensity = 0.5 + stretch * 0.5;
  } else if (effectName === "caustic") {
    const position = (pixelIndex + 0.5) / pixelCount;
    const phase = normalizedPhase(timeMs, effects.caustic.periodMs);
    const first = triangleWave(position * 5 + phase * 1.8);
    const second = triangleWave(position * 7 - phase * 1.3 + bikeIndex * 0.13);
    const field = Math.max(first, second);
    rgb = paletteGradient(palette, field * 3.2 + phase * 1.4);
    intensity = 0.52 + field * field * 0.48;
  } else if (effectName === "topographic") {
    const position = (pixelIndex + 0.5) / pixelCount;
    const phase = normalizedPhase(timeMs, effects.topographic.periodMs);
    const elevation =
      triangleWave(position * 1.7 - phase * 0.7) * 0.55 +
      triangleWave(position * 4.3 + phase * 1.1 + bikeIndex * 0.04) * 0.3 +
      triangleWave(position * 9.1 - phase * 1.9) * 0.15;
    const contours = triangleWave(elevation * 8 + phase * 1.5);
    const level = Math.floor(elevation * 6) / 6;
    rgb = paletteGradient(
      palette,
      level * palette.length * 2 + phase + bikeIndex * 0.11,
    );
    intensity = 0.5 + contours * contours * 0.5;
  } else if (effectName === "ripple") {
    const position = (pixelIndex + 0.5) / pixelCount;
    const phase = normalizedPhase(timeMs, effects.ripple.periodMs);
    const firstCenter = 0.1 + triangleWave(phase) * 0.8;
    const secondCenter = hashUnit(bikeIndex * 113 + 41);
    const first = triangleWave(
      circularDistance(position, firstCenter) * 7 - phase * 4,
    );
    const second = triangleWave(
      circularDistance(position, secondCenter) * 10 + phase * 3,
    );
    const field = Math.max(first, second * 0.82);
    rgb = paletteGradient(palette, field * 2.6 + phase * 2 + bikeIndex * 0.08);
    intensity = 0.52 + field * 0.48;
  } else if (effectName === "helix") {
    const position = (pixelIndex + 0.5) / pixelCount;
    const phase = normalizedPhase(timeMs, effects.helix.periodMs);
    const first = triangleWave(position * 2 - phase * 2 + bikeIndex * 0.06);
    const second = triangleWave(position * 2 + phase * 2 - bikeIndex * 0.06);
    const crossing = 1 - Math.abs(first - second);
    const field = crossing * 0.55 + Math.max(first, second) * 0.45;
    rgb = paletteGradient(
      palette,
      (first > second ? 0.3 : 1.3) + crossing * 1.7 + phase * 1.2,
    );
    intensity = 0.52 + field * 0.48;
  } else if (effectName === "crystal") {
    const position = (pixelIndex + 0.5) / pixelCount;
    const phase = normalizedPhase(timeMs, effects.crystal.periodMs);
    const epoch = Math.floor(timeMs / effects.crystal.periodMs);
    const seed = hashUnit(epoch * 43 + bikeIndex * 17);
    const crystalPosition = positiveModulo(
      position * 6 + seed + phase * 0.28,
      1,
    );
    const face = 1 - Math.abs(crystalPosition * 2 - 1);
    const facet = Math.floor(position * 6 + seed);
    rgb = paletteGradient(palette, facet * 0.72 + face * 1.4 + phase * 0.8);
    intensity = 0.52 + face * 0.48;
  } else if (effectName === "magnetic") {
    const position = (pixelIndex + 0.5) / pixelCount;
    const phase = normalizedPhase(timeMs, effects.magnetic.periodMs);
    const firstPole = positiveModulo(
      hashUnit(bikeIndex * 17 + 5) + phase * 0.4,
      1,
    );
    const secondPole = positiveModulo(
      hashUnit(bikeIndex * 23 + 71) - phase * 0.31,
      1,
    );
    const firstDistance = circularDistance(position, firstPole);
    const secondDistance = circularDistance(position, secondPole);
    const flux = triangleWave(
      (firstDistance + secondDistance) * 9 + phase * 1.8,
    );
    rgb = paletteGradient(
      palette,
      (firstDistance - secondDistance) * 5 + phase * 2 + bikeIndex * 0.09,
    );
    intensity = 0.55 + flux * 0.45;
  } else if (effectName === "tectonic") {
    const position = (pixelIndex + 0.5) / pixelCount;
    const phase = normalizedPhase(timeMs, effects.tectonic.periodMs);
    const platePosition = position * 6 + phase * 1.2;
    const plate = Math.floor(platePosition);
    const local = positiveModulo(platePosition, 1);
    const faultDistance = Math.min(local, 1 - local);
    const fault = smoothstep(peak(faultDistance, 0.16));
    const plateSeed = hashUnit(plate * 89 + bikeIndex * 31);
    rgb = paletteGradient(
      palette,
      plateSeed * palette.length * 2 + phase * 0.7,
    );
    intensity = 0.58 + fault * 0.42;
  } else if (effectName === "circuit") {
    const position = (pixelIndex + 0.5) / pixelCount;
    const phase = normalizedPhase(timeMs, effects.circuit.periodMs);
    const cell = Math.floor(position * 24);
    const group = Math.floor(cell / 4);
    const lane = cell % 4;
    const route = hash32(group * 73 + bikeIndex * 17) & 3;
    const trace = lane === route ? 1 : 0.22;
    const packet = triangleWave((cell % 6) / 6 - phase * 3 + route * 0.17);
    const field = Math.max(trace * 0.82, packet * 0.68);
    rgb = paletteGradient(palette, route * 0.78 + packet * 1.4 + phase * 1.2);
    intensity = 0.56 + field * 0.44;
  } else if (effectName === "woven") {
    const position = (pixelIndex + 0.5) / pixelCount;
    const phase = normalizedPhase(timeMs, effects.woven.periodMs);
    const warp = triangleWave(position * 12 - phase * 2);
    const weft = triangleWave(position * 5 + phase * 1.3 + bikeIndex * 0.18);
    const over =
      (Math.floor(position * 12) + bikeIndex + Math.floor(phase * 12)) & 1;
    const field = over ? warp : weft;
    rgb = paletteGradient(palette, (over ? 0.2 : 1.2) + field * 1.8 + phase);
    intensity = 0.54 + field * 0.46;
  } else if (effectName === "kaleidoscope") {
    const position = (pixelIndex + 0.5) / pixelCount;
    const phase = normalizedPhase(timeMs, effects.kaleidoscope.periodMs);
    const tile = positiveModulo(position * 8, 2);
    const mirrored = 1 - Math.abs(tile - 1);
    const rotation = triangleWave(mirrored * 2 + phase * 2 + bikeIndex * 0.03);
    const facets = triangleWave(mirrored * 5 - phase * 3);
    const field = rotation * 0.62 + facets * 0.38;
    rgb = paletteGradient(
      palette,
      mirrored * palette.length + phase * 2.4 + field,
    );
    intensity = 0.52 + field * 0.48;
  } else if (effectName === "bitstorm") {
    const position = (pixelIndex + 0.5) / pixelCount;
    const led = Math.floor(position * 64);
    const tick = Math.floor(timeMs / 140);
    const word =
      Math.imul(led ^ tick ^ Math.imul(bikeIndex + 1, 13), 0x9e3779b1) ^
      (tick >>> 2);
    const density = countBits(word) / 32;
    const colorBits = (word >>> 7) & 7;
    rgb = paletteGradient(
      palette,
      colorBits * 0.43 + density * 2 + tick * 0.03,
    );
    intensity = 0.52 + density * 0.48;
  } else if (effectName === "bloom") {
    const position = (pixelIndex + 0.5) / pixelCount;
    const cycle = Math.floor(timeMs / effects.bloom.periodMs);
    const phase = normalizedPhase(timeMs, effects.bloom.periodMs);
    const center = hashUnit(cycle * 67 + bikeIndex * 29 + 3);
    const distance = circularDistance(position, center);
    const petals = triangleWave(distance * 8 - phase * 4);
    const opening = triangleWave(phase - distance * 0.55);
    const field = petals * 0.58 + opening * 0.42;
    rgb = paletteGradient(
      palette,
      Math.floor(distance * 8) * 0.47 + phase * 2.8 + field,
    );
    intensity = 0.52 + field * 0.48;
  } else if (effectName === "mirage") {
    const position = (pixelIndex + 0.5) / pixelCount;
    const phase = normalizedPhase(timeMs, effects.mirage.periodMs);
    const heat = valueNoise(
      position * 6 + phase * 3,
      Math.imul(bikeIndex + 1, 0x27d4eb2d),
    );
    const warped = position + (heat - 0.5) * 0.2;
    const bands = triangleWave(warped * 4 - phase * 2);
    const field = heat * 0.38 + bands * 0.62;
    rgb = paletteGradient(
      palette,
      warped * palette.length * 2 + phase * 1.8 + field,
    );
    intensity = 0.55 + field * 0.45;
  }

  return {
    rgb: rgb.map((channel) => Math.max(0, Math.min(255, Math.round(channel)))),
    intensity: clampUnit(intensity),
  };
}

globalThis.glowEffects = Object.freeze({ effects, sampleEffect });
