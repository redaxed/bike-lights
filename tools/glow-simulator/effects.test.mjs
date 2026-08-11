import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import "./effects.js";

const { effects, sampleEffect } = globalThis.glowEffects;

const vectors = JSON.parse(
  readFileSync(new URL("./effect-vectors.json", import.meta.url), "utf8"),
);
const { palette, pixelCount } = vectors;
const EPIC_EFFECTS = Object.freeze([
  "aurora",
  "lava",
  "voronoi",
  "shockwave",
  "prism",
  "glitch",
  "hyperspace",
  "caustic",
  "topographic",
  "ripple",
  "helix",
  "crystal",
  "magnetic",
  "tectonic",
  "circuit",
  "woven",
  "kaleidoscope",
  "bitstorm",
  "bloom",
  "mirage",
]);
const ACTIVE_EFFECT_MINIMUMS = Object.freeze({
  supernova: 0.34,
  sierpinski: 0.34,
  fold: 0.34,
  cantor: 0.34,
  flow: 0.58,
  moire: 0.52,
  ...Object.fromEntries(EPIC_EFFECTS.map((effectName) => [effectName, 0.5])),
});

const effectNames = Object.keys(effects);

assert.deepEqual(effectNames, [
  "off",
  "solid",
  "wipe",
  "comet",
  "rainbow",
  "strobe",
  "pulse",
  "scanner",
  "chase",
  "twinkle",
  "supernova",
  "sierpinski",
  "fold",
  "cantor",
  "flow",
  "moire",
  ...EPIC_EFFECTS,
]);
assert.equal(EPIC_EFFECTS.length, 20);
assert.deepEqual(
  effectNames.map((name) => effects[name].id),
  effectNames.map((_, index) => index),
);
assert.deepEqual(
  vectors.cases.map((vector) => vector.effect),
  effectNames,
);

for (const effectName of effectNames) {
  for (const cueTimeMs of [0, 137, 1024, 3100, 9876]) {
    for (const pixelIndex of [0, 11, 23]) {
      for (const bikeIndex of [0, 3, 8]) {
        const sample = sampleEffect(
          effectName,
          pixelIndex,
          pixelCount,
          cueTimeMs,
          palette,
          bikeIndex,
        );
        assert.equal(sample.rgb.length, 3);
        sample.rgb.forEach((channel) => {
          assert.equal(Number.isInteger(channel), true);
          assert.equal(channel >= 0 && channel <= 255, true);
        });
        assert.equal(sample.intensity >= 0 && sample.intensity <= 1, true);
        assert.deepEqual(
          sample,
          sampleEffect(
            effectName,
            pixelIndex,
            pixelCount,
            cueTimeMs,
            palette,
            bikeIndex,
          ),
        );
      }
    }
  }
}

for (const effectName of ["sierpinski", "cantor"]) {
  const packSlices = [0, 1].map((bikeIndex) =>
    Array.from({ length: pixelCount }, (_, pixelIndex) =>
      sampleEffect(
        effectName,
        pixelIndex,
        pixelCount,
        2100,
        palette,
        bikeIndex,
      ),
    ),
  );
  assert.notDeepEqual(packSlices[0], packSlices[1]);
}

for (const effectName of [
  "supernova",
  "sierpinski",
  "fold",
  "cantor",
  "flow",
  "moire",
  ...EPIC_EFFECTS,
]) {
  for (const cueTimeMs of [0, 713, 2400, 5199, 9876]) {
    for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
      const { intensity } = sampleEffect(
        effectName,
        pixelIndex,
        pixelCount,
        cueTimeMs,
        palette,
        4,
      );
      assert.equal(intensity >= ACTIVE_EFFECT_MINIMUMS[effectName], true);
    }
  }
}

const signatures = new Map();
for (const effectName of ["flow", "moire", ...EPIC_EFFECTS]) {
  const frames = [0, 1200].map((cueTimeMs) =>
    Array.from({ length: pixelCount }, (_, pixelIndex) =>
      sampleEffect(effectName, pixelIndex, pixelCount, cueTimeMs, palette, 2),
    ),
  );
  assert.notDeepEqual(frames[0], frames[1]);
  assert.equal(
    new Set(frames[0].map(({ rgb }) => rgb.join(","))).size >= 3,
    true,
  );

  const signature = JSON.stringify(
    [0, 733, 2197].flatMap((cueTimeMs) =>
      [0, 5, 11, 17, 23].map((pixelIndex) =>
        sampleEffect(effectName, pixelIndex, pixelCount, cueTimeMs, palette, 3),
      ),
    ),
  );
  assert.equal(signatures.has(signature), false);
  signatures.set(signature, effectName);
}

for (const vector of vectors.cases) {
  const sample = sampleEffect(
    vector.effect,
    vector.pixel,
    pixelCount,
    vector.cueTimeMs,
    palette,
    vector.bikeIndex ?? 0,
  );
  assert.deepEqual(sample.rgb, vector.rgb);
  assert.equal(Math.abs(sample.intensity - vector.intensity) <= 0.000001, true);
}

console.log(
  `Verified ${effectNames.length} deterministic Glow effects and fixed vectors.`,
);
