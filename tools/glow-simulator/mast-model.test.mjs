import assert from "node:assert/strict";

import "./mast-model.js";

const mastModel = globalThis.glowMastModel;
const spiral = mastModel.profile("spiral");
const noodle = mastModel.profile("noodle");

assert.equal(mastModel.profile("straight").ledCount, 95);
assert.equal(spiral.ledCount, 200);
assert.equal(noodle.ledCount, 200);
assert.ok(Math.abs(spiral.turns - 37.4) < 0.15);
assert.ok(Math.abs(spiral.pitchM - 0.0423) < 0.0003);
assert.equal(noodle.outerRadiusM, 0.0325);
assert.equal(noodle.innerRadiusM, 0.0225);

const first = mastModel.ledPoint("spiral", 0);
const last = mastModel.ledPoint("spiral", spiral.ledCount - 1);
assert.equal(first.heightM, 0);
assert.equal(last.heightM, mastModel.HEIGHT_M);
assert.ok(Math.abs(Math.hypot(first.xM, first.zM) - 0.0125) < 1e-9);
assert.ok(Math.abs(Math.hypot(last.xM, last.zM) - 0.0125) < 1e-9);

assert.equal(mastModel.renderSampleCount("spiral", 5), 200);
assert.equal(mastModel.renderSampleCount("spiral", 15), 72);
assert.equal(mastModel.renderSampleCount("spiral", 30), 32);
assert.equal(mastModel.renderSampleCount("noodle", 5), 64);
assert.equal(mastModel.renderSampleCount("noodle", 15), 40);
assert.equal(mastModel.renderSampleCount("noodle", 30), 24);

assert.equal(mastModel.physicalIndex(0, 32, 200), 0);
assert.equal(mastModel.physicalIndex(31, 32, 200), 199);

assert.deepEqual(
  mastModel
    .applyFoamTransmission([255, 120, 60], "white", 0.18)
    .map(Math.round),
  [46, 22, 11],
);
assert.deepEqual(
  mastModel.applyFoamTransmission([255, 120, 60], "blue", 0.18).map(Math.round),
  [8, 6, 11],
);

console.log(
  `Verified ${Object.keys(mastModel.profiles).length} mast builds and ${Object.keys(mastModel.foamPresets).length} foam presets.`,
);
