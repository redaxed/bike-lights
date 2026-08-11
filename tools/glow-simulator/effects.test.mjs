import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { effects, sampleEffect } from "./effects.js";

const vectors = JSON.parse(
  readFileSync(new URL("./effect-vectors.json", import.meta.url), "utf8"),
);
const { palette, pixelCount } = vectors;

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
]);
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
