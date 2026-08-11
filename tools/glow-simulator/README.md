# Dax Glow pack simulator

This self-contained browser simulator previews thirty-six effects for the GlowModule firmware:

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

It renders a lightweight three-dimensional bicycle pack with rear-mounted vertical LED strips, without external JavaScript dependencies. Controls adjust pack size, target selection, palette, brightness, effect speed, synchronization, and camera position.

## Run locally

Open [`index.html`](index.html) directly, or serve the directory from the
repository root:

```bash
python3.12 -m http.server 4173 -d tools/glow-simulator
```

Then open <http://localhost:4173>.

The simulator is a visual design tool, not a timing-accurate electrical or photometric model. Firmware and simulator effect outputs should share fixed-time test vectors once the GlowModule implementation begins.

## Firmware handoff contract

[`effects.js`](effects.js) is a renderer-independent effect kernel. Every sample uses only a stable effect ID, LED index/count, integer cue time in milliseconds, an RGB palette, and an optional pack index; it returns RGB plus normalized intensity. Synchronized bikes receive the same cue time, while staggered bikes receive a deterministic time offset. The fractal effects use the pack index to render coordinated slices of a larger pattern. Effect IDs are append-only so future `GlowCue` packets can keep the same mapping. [`effect-vectors.json`](effect-vectors.json) provides language-neutral expected outputs for the browser and future C++ host tests.

Run the host-side deterministic checks with:

```bash
node tools/glow-simulator/effects.test.mjs
```
