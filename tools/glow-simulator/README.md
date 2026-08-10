# Dax Glow pack simulator

This self-contained browser simulator previews ten effects for the GlowModule firmware:

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

It renders a lightweight three-dimensional bicycle pack with rear-mounted vertical LED strips, without external JavaScript dependencies. Controls adjust pack size, target selection, palette, brightness, effect speed, synchronization, and camera position.

## Run locally

From the repository root:

```bash
python3.12 -m http.server 4173 -d tools/glow-simulator
```

Then open <http://localhost:4173>.

The simulator is a visual design tool, not a timing-accurate electrical or photometric model. Firmware and simulator effect outputs should share fixed-time test vectors once the GlowModule implementation begins.

## Firmware handoff contract

[`effects.js`](effects.js) is a renderer-independent effect kernel. Every sample uses only a stable effect ID, LED index/count, integer cue time in milliseconds, and an RGB palette; it returns RGB plus normalized intensity. Synchronized bikes receive the same cue time, while staggered bikes receive a deterministic time offset. Effect IDs are append-only so future `GlowCue` packets can keep the same mapping. [`effect-vectors.json`](effect-vectors.json) provides language-neutral expected outputs for the browser and future C++ host tests.

Run the host-side deterministic checks with:

```bash
node tools/glow-simulator/effects.test.mjs
```
