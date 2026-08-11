# Dax Glow pack simulator

This self-contained browser simulator previews thirty-six effects for the GlowModule firmware, grouped as 10 core, 6 generative, and 20 epic patterns:

| ID  | Code                 | Behavior                          |
| --- | -------------------- | --------------------------------- |
| 0   | `OFF`                | Strip disabled                    |
| 1   | `SOLID`              | One steady palette color          |
| 2   | `COLOR_WIPE`         | Bottom-to-top fill and clear      |
| 3   | `COMET`              | Moving head with a fading trail   |
| 4   | `RAINBOW`            | Continuously shifting hue         |
| 5   | `FIND_BIKE_STROBE`   | Targeted three-flash locator cue  |
| 6   | `PULSE`              | Smooth whole-strip breathing      |
| 7   | `SCANNER`            | Bidirectional moving highlight    |
| 8   | `SEGMENT_CHASE`      | Rising three-pixel segments       |
| 9   | `TWINKLE`            | Deterministic sparse sparkles     |
| 10  | `BINARY_SUPERNOVA`   | One pulse recursively splits      |
| 11  | `SIERPINSKI_LACE`    | Distributed Rule 90 fractal       |
| 12  | `INFINITE_FOLD`      | Nested mirrored light folds       |
| 13  | `CANTOR_BLOOM`       | Recursive islands split and join  |
| 14  | `FRACTAL_FLOW`       | Always-on multiscale color field  |
| 15  | `MOIRE_TIDE`         | Always-on interference bands      |
| 16  | `AURORA_CURTAINS`    | Warped luminous color curtains    |
| 17  | `LAVA_CELLS`         | Merging all-on metaball cells     |
| 18  | `VORONOI_GLASS`      | Distributed moving stained glass  |
| 19  | `DIAMOND_SHOCKWAVE`  | Expanding faceted impact rings    |
| 20  | `PRISM_REFRACTION`   | Moving refracted palette fans     |
| 21  | `QUANTIZED_GLITCH`   | Digital blocks remap in time      |
| 22  | `HYPERSPACE`         | Repeating vanishing-point streaks |
| 23  | `CAUSTIC_POOL`       | Skating liquid-light highlights   |
| 24  | `TOPOGRAPHIC_LINES`  | Quantized moving contour bands    |
| 25  | `RIPPLE_ENGINE`      | Intersecting distributed ripples  |
| 26  | `DOUBLE_HELIX`       | Counter-rotating luminous strands |
| 27  | `CRYSTAL_GROWTH`     | Recrystallizing faceted fronts    |
| 28  | `MAGNETIC_FLUX`      | Field lines bending between poles |
| 29  | `TECTONIC_PLATES`    | Sliding regions and bright faults |
| 30  | `CIRCUIT_TRACES`     | Routed lanes with moving packets  |
| 31  | `WOVEN_LIGHT`        | Animated warp-and-weft pattern    |
| 32  | `KALEIDOSCOPE_TILES` | Mirrored rotating color tiles     |
| 33  | `BITSTORM`           | Bitwise density storm             |
| 34  | `PIXEL_BLOOM`        | Expanding procedural light petals |
| 35  | `HEAT_MIRAGE`        | Noise-warped shimmering bands     |

It renders a lightweight three-dimensional bicycle pack with rear-mounted vertical LED strips, without external JavaScript dependencies. Controls adjust pack size, target selection, palette, brightness, effect speed, synchronization, and camera position. The built-in Pattern workshop lets a rider edit and preview a custom renderer without changing repository files.

## Run locally

Open [`index.html`](index.html) directly, or serve the directory from the
repository root:

```bash
python3.12 -m http.server 4173 -d tools/glow-simulator
```

Then open <http://localhost:4173>.

The simulator is a visual design tool, not a timing-accurate electrical or photometric model. Firmware and simulator effect outputs should share fixed-time test vectors once the GlowModule implementation begins.

## Make and share a pattern

Select **Create pattern**, choose a starter, and edit its `render()` body. The body receives these deterministic inputs:

- `pixel`, `count`, and normalized strip position `x`
- cue time as `time` in seconds and `timeMs` in milliseconds
- `bike`, stable signed `variant` (−1 to 1), `variation` amount (0 to 1), `palette`, and a constrained `helpers` object

It must return `{ color, intensity }`, where `color` is an RGB triplet and `intensity` is normalized from 0 to 1. The helper surface includes deterministic wave, triangle, pulse, noise, palette-gradient, HSV, mixing, clamping, and basic math functions. Browser APIs, dynamic code, loops, timers, and nondeterministic sources are rejected so submissions stay easy to review and portable to firmware.

**Per-bike variation** controls how strongly bikes diverge while staying on the same cue. At 0%, every bike receives `variation === 0`; at higher settings, multiply the stable `variant` by `variation` and use that offset in hue, phase, noise position, or geometry. The same bike always receives the same variant, so the pack remains deterministic and synchronized rather than flickering randomly.

The workshop automatically samples every draft for deterministic output, movement, color variety, and the preferred 50% always-on floor. **Copy JSON** copies the versioned handoff object; **Download** creates a `.glow-pattern.json` file. Send either one to Dax. Imports populate the editor but never execute until **Run preview** is pressed, and imported code should only come from a trusted author.

[`glow-pattern.schema.json`](glow-pattern.schema.json) is the machine-readable share format. [`pattern-workshop.js`](pattern-workshop.js) owns compilation, deterministic helpers, validation, starter templates, and JSON serialization independently from the simulator UI.

## Firmware handoff contract

[`effects.js`](effects.js) is a renderer-independent effect kernel. Every sample uses only a stable effect ID, LED index/count, integer cue time in milliseconds, an RGB palette, and an optional pack index; it returns RGB plus normalized intensity. Synchronized bikes receive the same cue time, while staggered bikes receive a deterministic time offset. The fractal effects use the pack index to render coordinated slices of a larger pattern. Effect IDs are append-only so future `GlowCue` packets can keep the same mapping. [`effect-vectors.json`](effect-vectors.json) provides language-neutral expected outputs for the browser and future C++ host tests.

Run the host-side deterministic checks with:

```bash
node tools/glow-simulator/effects.test.mjs
node tools/glow-simulator/pattern-workshop.test.mjs
```
