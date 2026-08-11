# Dax Glow pack simulator

This self-contained browser simulator previews fourteen effects for the GlowModule firmware:

| ID  | Code               | Behavior                         |
| --- | ------------------ | -------------------------------- |
| 0   | `OFF`              | Strip disabled                   |
| 1   | `SOLID`            | One steady palette color         |
| 2   | `COLOR_WIPE`       | Bottom-to-top fill and clear     |
| 3   | `COMET`            | Moving head with a fading trail  |
| 4   | `RAINBOW`          | Continuously shifting hue        |
| 5   | `FIND_BIKE_STROBE` | Targeted three-flash locator cue |
| 6   | `PULSE`            | Smooth whole-strip breathing     |
| 7   | `SCANNER`          | Bidirectional moving highlight   |
| 8   | `SEGMENT_CHASE`    | Rising three-pixel segments      |
| 9   | `TWINKLE`          | Deterministic sparse sparkles    |
| 10  | `BINARY_SUPERNOVA` | One pulse recursively splits     |
| 11  | `SIERPINSKI_LACE`  | Distributed Rule 90 fractal      |
| 12  | `INFINITE_FOLD`    | Nested mirrored light folds      |
| 13  | `CANTOR_BLOOM`     | Recursive islands split and join |

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
