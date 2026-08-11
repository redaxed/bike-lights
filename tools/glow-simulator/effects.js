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
});

function positiveModulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function normalizedPhase(cueTimeMs, periodMs) {
  return positiveModulo(cueTimeMs, periodMs) / periodMs;
}

function paletteColor(palette, index) {
  return palette[positiveModulo(index, palette.length)];
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
    rgb = paletteColor(palette, depth);
    intensity =
      0.025 +
      Math.min(1, current * (1 - transition) + next * transition) * 0.975;
  } else if (effectName === "sierpinski") {
    const row = positiveModulo(Math.floor(timeMs / 100) + bikeIndex * 3, 64);
    const x = Math.round((pixelIndex / Math.max(1, pixelCount - 1)) * 62 - 31);
    let lace = 0;
    for (let trail = 0; trail < 3; trail += 1) {
      const trailRow = row - trail;
      if (trailRow >= 0 && rule90Cell(trailRow, x))
        lace = Math.max(lace, [1, 0.42, 0.16][trail]);
    }
    rgb = paletteColor(palette, Math.floor(row / 8) + bikeIndex);
    intensity = 0.025 + lace * 0.975;
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
    rgb = paletteColor(palette, strongestDepth + Math.floor(timeMs / 5200));
    intensity = 0.025 + smoothstep(strongest) * 0.975;
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
    rgb = paletteColor(palette, depth + bikeIndex);
    intensity =
      0.025 + (current * (1 - transition) + next * transition) * 0.975;
  }

  return {
    rgb: rgb.map((channel) => Math.max(0, Math.min(255, Math.round(channel)))),
    intensity: clampUnit(intensity),
  };
}

globalThis.glowEffects = Object.freeze({ effects, sampleEffect });
