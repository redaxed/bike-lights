# Dax Glow prototype

## Current state

This repository is based on Meshtastic tag `v2.7.26.54e0d8d` and targets the PlatformIO environment `heltec-wireless-tracker-v2`. The untouched target builds successfully on macOS with PlatformIO 6.1.19.

No custom LED firmware is enabled yet. Stock Meshtastic remains the acceptance-test firmware until the board passes the hardware checklist below.

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

The build produces these primary artifacts:

```text
.pio/build/heltec-wireless-tracker-v2/firmware-heltec-wireless-tracker-v2-2.7.26.54e0d8d.bin
.pio/build/heltec-wireless-tracker-v2/firmware-heltec-wireless-tracker-v2-2.7.26.54e0d8d.factory.bin
```

Do not upload as part of an automated build. After the operator approves a flash and supplies the serial port, the update command is:

```bash
.venv/bin/pio run -e heltec-wireless-tracker-v2 -t upload --upload-port /dev/cu.usbmodemXXXX
```

Monitor serial output separately:

```bash
.venv/bin/pio device monitor --port /dev/cu.usbmodemXXXX --baud 115200
```

## Stock hardware gate

Complete these checks before starting the LED module:

- [ ] LoRa antenna attached before power
- [ ] Exact Heltec Wireless Tracker V2 target selected
- [ ] Meshtastic `2.7.26.54e0d8d` installed
- [ ] Board boots without a reboot loop
- [ ] Color screen works
- [ ] Phone connects over Bluetooth
- [ ] Region is set correctly for the board's physical location
- [ ] Device role is `CLIENT`
- [ ] Wi-Fi remains disabled
- [ ] Hardware identity reports `HELTEC_WIRELESS_TRACKER_V2`
- [ ] GPS obtains a plausible outdoor position
- [ ] Meshtastic CLI `--info` works over USB
- [ ] Serial output has no critical radio or GPS errors

One board can validate USB, display, Bluetooth, GNSS, and radio initialization. A controlled LoRa transmit/receive test requires a second compatible node with matching region, modem preset, frequency slot, channel name, and channel key.

## Planned integration

The least invasive integration point is an optional `SinglePortModule` registered in `src/modules/Modules.cpp` only when `DAX_GLOW` is defined. It will receive versioned binary packets on `meshtastic_PortNum_PRIVATE_APP` and use an `OSThread` for nonblocking render work. Normal Tracker V2 builds will not construct the module or initialize the LED pin.

The module lifecycle will be:

1. Meshtastic completes normal platform, radio, GNSS, Bluetooth, and display initialization.
2. The conditional module registers for the private application port.
3. Packet handling validates and queues cues without blocking the router thread.
4. The module thread renders at no more than 30 FPS from synchronized time and deterministic cue parameters.
5. The module acknowledges accepted, duplicate, malformed, or inapplicable cues.

Milestones:

1. Stock target builds without modifications. Complete.
2. `DAX_GLOW` plus an optional ten-pixel `DAX_GLOW_SELF_TEST` on GPIO16.
3. Validated `GlowCue` packets, acknowledgements, duplicate suppression, and deterministic effects.
4. Host/native tests for protocol validation, targeting, timing, and fixed-time color output.
5. Bench verification that LEDs do not disturb LoRa, GNSS, Bluetooth, or the display.

The next code change should implement only milestone 2 after the stock hardware gate passes.
