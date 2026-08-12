# Dax Glow prototype

## Current state

This repository is based on Meshtastic 2.7.26. The stock `heltec-wireless-tracker-v2` target remains unchanged, while the opt-in `heltec-wireless-tracker-v2-dax-glow` environment enables `DAX_GLOW` and `DAX_GLOW_SELF_TEST`.

Both development boards currently run the custom self-test firmware. The firmware initializes a ten-pixel WS2812-compatible output on GPIO16, renders at 25 FPS, accepts versioned Glow cues over Meshtastic `PRIVATE_APP`, and reports synchronization status and deterministic frame hashes. The live two-board test passes; see the [hardware test log](hardware-test-log.md). An LED strip has not yet been wired, so emitted light remains unverified.

Connected-device evidence and unresolved hardware gates are tracked in the [hardware test log](hardware-test-log.md).

The browser-based [pack simulator](../tools/glow-simulator/) previews the planned patterns, pack targeting, synchronized versus staggered phase, and four physical mast constructions without hardware. The current spiral model uses 200 LEDs over 3.33 m, wrapped around a 25 mm diameter core through a 1.58 m lit height; opal-sleeve and 65 mm pool-noodle views add estimated diffusion for comparison. Its renderer-independent [effect kernel](../tools/glow-simulator/effects.js) already uses stable effect IDs, integer cue time, LED index/count, and deterministic output so the same fixed-time vectors can be carried into the native firmware tests.

## Safety boundary

- Attach the 915 MHz LoRa antenna before powering or flashing the board.
- Do not flash, erase, reset, or change a connected device without explicit operator approval.
- Use GPIO16 for WS2812B data. GPIO15 is the compile-time fallback.
- Never use GPIO4, GPIO5, or GPIO7 for LEDs. The Tracker V2 variant reserves them for the KCT8103L LoRa RF front end.
- Do not power an LED strip through the Heltec. Use a separate 5 V supply, a common ground, and an SN74AHCT125 or equivalent 3.3 V-to-5 V data-level shifter.

The board-specific pin assignments live in:

- `variants/esp32s3/heltec_wireless_tracker_v2/variant.h`
- `variants/esp32s3/heltec_wireless_tracker_v2/pins_arduino.h`
- `variants/esp32s3/heltec_wireless_tracker_v2/platformio.ini`

## Development setup

Use Python 3.12 for the local environment. The repository ignores `.venv` and PlatformIO's `.pio` build directory.

```bash
python3.12 -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -r requirements-glow.txt
```

Build the stock firmware:

```bash
.venv/bin/pio run -e heltec-wireless-tracker-v2
```

Build the opt-in self-test firmware:

```bash
.venv/bin/pio run -e heltec-wireless-tracker-v2-dax-glow
```

After the operator approves a flash and supplies the serial port, upload the custom build with:

```bash
.venv/bin/pio run -e heltec-wireless-tracker-v2-dax-glow -t upload --upload-port /dev/cu.usbmodemXXXX
```

Monitor serial output separately:

```bash
.venv/bin/pio device monitor --port /dev/cu.usbmodemXXXX --baud 115200
```

## Stock hardware gate

Complete these checks before starting the LED module:

- [x] LoRa antenna attached before transmit
- [x] Exact Heltec Wireless Tracker V2 target selected
- [x] Stock Meshtastic `2.7.26.4005041` baseline completed before custom firmware
- [x] Both boards boot without a reboot loop
- [x] Color screens display the Bluetooth pairing PIN
- [x] Phone connects over Bluetooth
- [x] Region is `US` on both boards
- [x] Device role is `CLIENT`
- [ ] Wi-Fi remains disabled
- [x] Hardware identity reports `HELTEC_WIRELESS_TRACKER_V2`
- [ ] GPS obtains a plausible outdoor position
- [x] Meshtastic API works over USB
- [ ] Serial output has no critical radio or GPS errors

One board can validate USB, display, Bluetooth, GNSS, and radio initialization. A controlled LoRa transmit/receive test requires a second compatible node with matching region, modem preset, frequency slot, channel name, and channel key.

## Firmware integration

`GlowModule` is an optional `SinglePortModule` registered in `src/modules/Modules.cpp` only when `DAX_GLOW` is defined. It receives versioned binary packets on `meshtastic_PortNum_PRIVATE_APP` and uses an `OSThread` for nonblocking render work. Normal Tracker V2 builds do not construct the module or initialize the LED pin.

The implemented lifecycle is:

1. Meshtastic completes normal platform, radio, GNSS, Bluetooth, and display initialization.
2. The conditional module initializes the configured NeoPixel output and registers for the private application port.
3. Local USB clock commands establish epoch time; increasing tokens prevent delayed clock packets from overriding newer state. Clock changes received over LoRa are rejected.
4. A broadcast cue carries a stable effect ID, brightness, palette, cue ID, and absolute start time. Each node renders locally on a 40 ms frame grid.
5. Status replies expose cue state, sampled and live frame hashes, render count, clock source/age, and output configuration for automated verification.

Firmware currently implements effect IDs 0–9. Simulator effects 10–35 remain browser-only until they are ported to the deterministic C++ core and added to its fixed-vector tests.

Milestones:

1. Stock target builds without modifications. Complete.
2. `DAX_GLOW` plus an optional ten-pixel `DAX_GLOW_SELF_TEST` on GPIO16. Complete.
3. Versioned cue, status, and clock packets; clock replay protection; deterministic effects 0–9. Complete. Cue duplicate suppression remains future hardening.
4. Host tests for protocol validation, timing, and fixed-time color output plus live two-board hash verification. Complete for effects 0–9; pack targeting remains future work.
5. Bench verification that LEDs do not disturb LoRa, GNSS, Bluetooth, or the display. Pending physical strip and power circuit.

The next hardware step is a short WS2812B strip on GPIO16 through an SN74AHCT125-class level shifter, with common ground and a separately fused 5 V supply. Do not power the strip from a Heltec board.
