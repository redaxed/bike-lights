import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import "./pattern-workshop.js";

const workshop = globalThis.glowPatternWorkshop;
const palette = [
  [255, 68, 137],
  [90, 232, 255],
  [123, 255, 171],
];

assert.equal(workshop.FORMAT, "dax-glow-pattern");
assert.equal(workshop.VERSION, 1);
assert.deepEqual(Object.keys(workshop.templates), ["aurora", "orbit", "prism"]);

for (const template of Object.values(workshop.templates)) {
  const first = workshop.analyzePattern(template, { palette });
  const second = workshop.analyzePattern(template, { palette });
  assert.deepEqual(first.report, second.report);
  assert.equal(first.report.minimumIntensity >= 0.5, true);
  assert.equal(first.report.uniqueColors >= 3, true);
  assert.equal(first.report.moves, true);
  assert.deepEqual(
    first.renderer(7, 24, 1234, palette, 2),
    second.renderer(7, 24, 1234, palette, 2),
  );
}

const sharedPattern = workshop.createPattern({
  ...workshop.templates.aurora,
  author: "Glow Rider",
  preview: { palette: "electric", speed: 1.35, brightness: 0.8 },
});
const serialized = workshop.serializePattern(sharedPattern);
assert.deepEqual(workshop.parsePattern(serialized), sharedPattern);
assert.equal(serialized.endsWith("\n"), true);

assert.throws(
  () =>
    workshop.compileBody(
      "fetch('https://example.com'); return { color: [0, 0, 0], intensity: 1 };",
    ),
  /supplied helpers/,
);
assert.throws(
  () =>
    workshop.compileBody(
      "while (true) {} return { color: [0, 0, 0], intensity: 1 };",
    ),
  /supplied helpers/,
);
assert.throws(
  () =>
    workshop.analyzePattern({
      name: "Broken output",
      code: "BROKEN_OUTPUT",
      body: "return { color: [255, 0], intensity: 1 };",
    }),
  /three RGB channels/,
);
assert.throws(
  () => workshop.parsePattern('{"format":"something-else","version":1}'),
  /Expected format/,
);

const reviewGate = workshop.createReviewGate();
assert.equal(reviewGate.isRequired(), false);
reviewGate.require();
assert.equal(reviewGate.isRequired(), true);
reviewGate.approve();
assert.equal(reviewGate.isRequired(), false);
reviewGate.require();
reviewGate.clear();
assert.equal(reviewGate.isRequired(), false);

const schema = JSON.parse(
  readFileSync(new URL("./glow-pattern.schema.json", import.meta.url), "utf8"),
);
assert.equal(schema.properties.format.const, workshop.FORMAT);
assert.equal(schema.properties.version.const, workshop.VERSION);
assert.equal(schema.properties.body.maxLength, workshop.MAX_BODY_LENGTH);

const indexHtml = readFileSync(
  new URL("./index.html", import.meta.url),
  "utf8",
);
const scriptOrder = ["effects.js", "pattern-workshop.js", "simulator.js"].map(
  (source) => indexHtml.indexOf(`src="${source}"`),
);
assert.equal(
  scriptOrder.every((position) => position >= 0),
  true,
);
assert.deepEqual(
  scriptOrder,
  [...scriptOrder].sort((first, second) => first - second),
);
assert.equal(indexHtml.includes('type="module"'), false);

console.log(
  `Verified ${Object.keys(workshop.templates).length} Glow workshop templates, validation, and JSON sharing.`,
);
