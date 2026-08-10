# Dax Glow pack simulator

This self-contained browser simulator previews the six effects planned for the first GlowModule firmware milestone:

- `OFF`
- `SOLID`
- `COLOR_WIPE`
- `COMET`
- `RAINBOW`
- `FIND_BIKE_STROBE`

It renders a lightweight three-dimensional bicycle pack with rear-mounted vertical LED strips, without external JavaScript dependencies. Controls adjust pack size, target selection, palette, brightness, effect speed, synchronization, and camera position.

## Run locally

From the repository root:

```bash
python3.12 -m http.server 4173 -d tools/glow-simulator
```

Then open <http://localhost:4173>.

The simulator is a visual design tool, not a timing-accurate electrical or photometric model. Firmware and simulator effect outputs should share fixed-time test vectors once the GlowModule implementation begins.
