(function initializeGlowPatternWorkshop() {
  const FORMAT = "dax-glow-pattern";
  const VERSION = 1;
  const MAX_BODY_LENGTH = 12000;
  const DEFAULT_PALETTE = Object.freeze([
    Object.freeze([255, 68, 137]),
    Object.freeze([90, 232, 255]),
    Object.freeze([123, 255, 171]),
  ]);
  const FORBIDDEN_SOURCE = [
    /\b(?:window|document|globalThis|self|top|parent|opener)\b/i,
    /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/i,
    /\b(?:localStorage|sessionStorage|indexedDB|navigator|location|history)\b/i,
    /\b(?:Function|eval|constructor|__proto__|prototype|importScripts)\b/i,
    /\b(?:Worker|SharedWorker|postMessage|setTimeout|setInterval)\b/i,
    /\b(?:Date|performance|crypto|Math|arguments)\b/i,
    /\b(?:for|while|do|switch|try|catch|finally|class|new)\b/i,
    /\b(?:function|async|await|yield|with|debugger)\b/i,
    /=>|`/,
  ];

  function clamp(value, minimum = 0, maximum = 1) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function mod(value, divisor = 1) {
    return ((value % divisor) + divisor) % divisor;
  }

  function smoothstep(value) {
    const normalized = clamp(value);
    return normalized * normalized * (3 - 2 * normalized);
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

  function hashUnit(value) {
    return hash32(value) / 0xffffffff;
  }

  function noise(position, seed = 0) {
    const cell = Math.floor(position);
    const blend = smoothstep(position - cell);
    const first = hashUnit(Math.imul(cell, 0x9e3779b1) ^ Math.trunc(seed));
    const second = hashUnit(Math.imul(cell + 1, 0x9e3779b1) ^ Math.trunc(seed));
    return first + (second - first) * blend;
  }

  function wave(value) {
    return 0.5 + Math.sin(value * Math.PI * 2) * 0.5;
  }

  function triangle(value) {
    return 1 - Math.abs(mod(value) * 2 - 1);
  }

  function pulse(value, center = 0.5, width = 0.2) {
    const distance = Math.min(mod(value - center), mod(center - value));
    return smoothstep(1 - distance / Math.max(0.0001, width));
  }

  function rgb(red, green, blue) {
    return [red, green, blue];
  }

  function mix(first, second, amount) {
    const blend = clamp(amount);
    return first.map(
      (channel, index) => channel + (second[index] - channel) * blend,
    );
  }

  function gradient(palette, position) {
    const firstIndex = Math.floor(position);
    const blend = smoothstep(position - firstIndex);
    const first = palette[mod(firstIndex, palette.length)];
    const second = palette[mod(firstIndex + 1, palette.length)];
    return mix(first, second, blend);
  }

  function hsv(hue, saturation = 1, value = 1) {
    const sector = mod(hue) * 6;
    const chroma = value * saturation;
    const secondary = chroma * (1 - Math.abs((sector % 2) - 1));
    let color;

    if (sector < 1) color = [chroma, secondary, 0];
    else if (sector < 2) color = [secondary, chroma, 0];
    else if (sector < 3) color = [0, chroma, secondary];
    else if (sector < 4) color = [0, secondary, chroma];
    else if (sector < 5) color = [secondary, 0, chroma];
    else color = [chroma, 0, secondary];

    const match = value - chroma;
    return color.map((channel) => (channel + match) * 255);
  }

  const helpers = Object.freeze({
    TAU: Math.PI * 2,
    abs: Math.abs,
    ceil: Math.ceil,
    clamp,
    cos: Math.cos,
    floor: Math.floor,
    gradient,
    hsv,
    max: Math.max,
    min: Math.min,
    mix,
    mod,
    noise,
    pow: Math.pow,
    pulse,
    rgb,
    round: Math.round,
    sin: Math.sin,
    smoothstep,
    sqrt: Math.sqrt,
    triangle,
    wave,
  });

  const templates = Object.freeze({
    aurora: Object.freeze({
      name: "Aurora loom",
      code: "AURORA_LOOM",
      body: `const { gradient, noise, wave } = helpers;
const offset = variant * variation;
const curtain = wave(x * 2.4 - time * 0.16 + offset * 0.35);
const shimmer = noise(x * 8 + time * 0.7 + offset * 1.4, 11);

return {
  color: gradient(palette, curtain * 2.2 + shimmer * 0.7),
  intensity: 0.55 + 0.45 * wave(x * 3.5 + time * 0.23 + shimmer),
};`,
    }),
    orbit: Object.freeze({
      name: "Orbit weave",
      code: "ORBIT_WEAVE",
      body: `const { gradient, triangle, wave } = helpers;
const offset = variant * variation;
const forward = wave(x * 3.2 - time * 0.38 + offset * 0.45);
const backward = triangle(x * 2.1 + time * 0.27 - offset * 0.3);
const weave = forward * 0.58 + backward * 0.42;

return {
  color: gradient(palette, weave * 3 + time * 0.08),
  intensity: 0.52 + 0.48 * wave(weave + x - time * 0.12),
};`,
    }),
    prism: Object.freeze({
      name: "Prism engine",
      code: "PRISM_ENGINE",
      body: `const { clamp, hsv, sin, TAU, wave } = helpers;
const offset = variant * variation;
const bend = sin((x * 1.8 - time * 0.2 + offset * 0.25) * TAU);
const hue = x * 0.72 + time * 0.09 + bend * 0.12 + offset * 0.08;

return {
  color: hsv(hue, 0.78, 1),
  intensity: clamp(0.58 + 0.42 * wave(x * 4.2 + time * 0.31 + bend)),
};`,
    }),
  });

  function normalizeCode(value) {
    return String(value ?? "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 48);
  }

  function validateBody(body) {
    if (typeof body !== "string" || body.trim().length === 0)
      throw new TypeError("Render body cannot be empty");
    if (body.length > MAX_BODY_LENGTH)
      throw new RangeError(
        `Render body is limited to ${MAX_BODY_LENGTH} characters`,
      );
    if (!/\breturn\s*\{/.test(body))
      throw new SyntaxError("Render body must return { color, intensity }");
    if (FORBIDDEN_SOURCE.some((pattern) => pattern.test(body)))
      throw new SyntaxError(
        "Use only straight-line math and the supplied helpers; browser APIs, loops, and dynamic code are not allowed",
      );
  }

  function normalizeOutput(output) {
    if (!output || typeof output !== "object")
      throw new TypeError("Render must return { color, intensity }");
    const color = output.color ?? output.rgb;
    if (!Array.isArray(color) || color.length !== 3)
      throw new TypeError("color must contain exactly three RGB channels");
    if (!color.every(Number.isFinite))
      throw new TypeError("Every RGB channel must be a finite number");
    if (!Number.isFinite(output.intensity))
      throw new TypeError("intensity must be a finite number");
    return {
      rgb: color.map((channel) => Math.round(clamp(channel, 0, 255))),
      intensity: clamp(output.intensity),
    };
  }

  function variantForBike(bike) {
    const seed = Math.imul(Math.max(0, Math.trunc(bike)) + 1, 0x9e3779b1);
    return hashUnit(seed ^ 0x85ebca6b) * 2 - 1;
  }

  function compileBody(body) {
    validateBody(body);
    let render;
    try {
      render = new Function(
        "pixel",
        "count",
        "x",
        "time",
        "timeMs",
        "bike",
        "variant",
        "variation",
        "palette",
        "helpers",
        `"use strict";\n${body}`,
      );
    } catch (error) {
      throw new SyntaxError(`Could not compile render body: ${error.message}`);
    }

    return (pixel, count, timeMs, palette, bike = 0, variation = 0) => {
      const x = count > 1 ? pixel / (count - 1) : 0;
      const output = render(
        pixel,
        count,
        x,
        timeMs / 1000,
        timeMs,
        bike,
        variantForBike(bike),
        clamp(Number(variation) || 0),
        palette,
        helpers,
      );
      return normalizeOutput(output);
    };
  }

  function createPattern(value = {}) {
    const name = String(value.name ?? "")
      .trim()
      .slice(0, 64);
    const code = normalizeCode(value.code || name);
    const author = String(value.author ?? "")
      .trim()
      .slice(0, 64);
    const body = String(value.body ?? "");

    if (name.length < 2) throw new TypeError("Pattern name is required");
    if (!/^[A-Z][A-Z0-9_]{1,47}$/.test(code))
      throw new TypeError(
        "Pattern code must start with a letter and use 2–48 uppercase letters, numbers, or underscores",
      );
    validateBody(body);

    const pattern = {
      format: FORMAT,
      version: VERSION,
      name,
      code,
      author,
      body,
    };

    if (value.preview && typeof value.preview === "object") {
      pattern.preview = {
        palette: String(value.preview.palette ?? "neon").slice(0, 24),
        speed: clamp(Number(value.preview.speed) || 1, 0.25, 2),
        brightness: clamp(Number(value.preview.brightness) || 0.72, 0.05, 1),
        variation: clamp(Number(value.preview.variation) || 0),
      };
    }

    return pattern;
  }

  function analyzePattern(patternValue, options = {}) {
    const pattern = createPattern(patternValue);
    const renderer = compileBody(pattern.body);
    const palette = options.palette ?? DEFAULT_PALETTE;
    const pixelCount = options.pixelCount ?? 24;
    const times = options.times ?? [0, 733, 2197];
    const bikes = options.bikes ?? [0, 3];
    const variation = clamp(
      Number(options.variation ?? pattern.preview?.variation) || 0,
    );
    const colors = new Set();
    let minimumIntensity = 1;
    let maximumIntensity = 0;

    for (const timeMs of times) {
      for (const bike of bikes) {
        for (let pixel = 0; pixel < pixelCount; pixel += 1) {
          const first = renderer(
            pixel,
            pixelCount,
            timeMs,
            palette,
            bike,
            variation,
          );
          const second = renderer(
            pixel,
            pixelCount,
            timeMs,
            palette,
            bike,
            variation,
          );
          if (JSON.stringify(first) !== JSON.stringify(second))
            throw new TypeError("Pattern output must be deterministic");
          colors.add(first.rgb.join(","));
          minimumIntensity = Math.min(minimumIntensity, first.intensity);
          maximumIntensity = Math.max(maximumIntensity, first.intensity);
        }
      }
    }

    const firstFrame = Array.from({ length: pixelCount }, (_, pixel) =>
      renderer(pixel, pixelCount, times[0], palette, 0, variation),
    );
    const lastFrame = Array.from({ length: pixelCount }, (_, pixel) =>
      renderer(pixel, pixelCount, times.at(-1), palette, 0, variation),
    );
    const moves = JSON.stringify(firstFrame) !== JSON.stringify(lastFrame);
    const warnings = [];
    if (minimumIntensity < 0.5)
      warnings.push("Some sampled LEDs fall below the 50% always-on target");
    if (!moves) warnings.push("Sampled frames do not change over time");
    if (colors.size < 3)
      warnings.push("Pattern uses fewer than three sampled colors");

    return {
      pattern,
      renderer,
      report: {
        minimumIntensity,
        maximumIntensity,
        uniqueColors: colors.size,
        moves,
        warnings,
      },
    };
  }

  function serializePattern(patternValue) {
    return `${JSON.stringify(createPattern(patternValue), null, 2)}\n`;
  }

  function parsePattern(source) {
    let value;
    try {
      value = JSON.parse(source);
    } catch (error) {
      throw new SyntaxError(`Could not parse pattern JSON: ${error.message}`);
    }
    if (value?.format !== FORMAT)
      throw new TypeError(`Expected format \"${FORMAT}\"`);
    if (value?.version !== VERSION)
      throw new TypeError(`Pattern version ${value?.version} is not supported`);
    return createPattern(value);
  }

  function createReviewGate() {
    let required = false;
    return Object.freeze({
      approve() {
        required = false;
      },
      clear() {
        required = false;
      },
      isRequired() {
        return required;
      },
      require() {
        required = true;
      },
    });
  }

  globalThis.glowPatternWorkshop = Object.freeze({
    FORMAT,
    VERSION,
    MAX_BODY_LENGTH,
    analyzePattern,
    compileBody,
    createPattern,
    createReviewGate,
    helpers,
    parsePattern,
    serializePattern,
    templates,
    variantForBike,
  });
})();
