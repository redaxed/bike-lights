# Hardware test log

This log records evidence from the two Heltec Wireless Tracker V2 development boards used for the Dax Glow prototype. Tests must follow the safety boundary in [the prototype guide](glow-prototype.md): serial access is exclusive per port, and flashing, erasing, reset, reboot, shutdown, or LoRa-region changes require operator approval.

## 2026-08-12 01:43-01:59 PDT — USB baseline

### Connected hardware

Both devices enumerate through the ESP32-S3 native USB interface (`VID 0x303a`, `PID 0x1001`) and are not held by another local process.

| Board | Serial port             | USB serial          | USB result |
| ----- | ----------------------- | ------------------- | ---------- |
| A     | `/dev/cu.usbmodem83101` | `44:1B:F6:F8:ED:2C` | Pass       |
| B     | `/dev/cu.usbmodem83201` | `44:1B:F6:F8:EF:24` | Pass       |

The repository target for both is `heltec-wireless-tracker-v2`, matching hardware model 113 (`HELTEC_WIRELESS_TRACKER_V2`). The boards use ESP32-S3, SX1262, UC6580 GNSS, and the KCT8103L RF front end.

### Firmware and serial results

| Check                             | Board A                    | Board B                    |
| --------------------------------- | -------------------------- | -------------------------- |
| Meshtastic USB protocol handshake | Fail: timed out after 15 s | Fail: timed out after 20 s |
| Passive 115200-baud capture       | 0 bytes in 6 s             | 0 bytes in 6 s             |
| No-reset ESP32-S3 ROM probe       | No response                | No response                |

The USB devices are present, but neither board currently exposes a responsive Meshtastic application protocol or serial log. The no-reset probe also confirms neither was already waiting in the ROM bootloader. The installed application and firmware versions are therefore unknown. No reset, flash, erase, or configuration write was performed.

Next physical-firmware step: with LoRa antennas attached and operator approval, upload the exact `heltec-wireless-tracker-v2` stock image to both boards. After that, verify hardware identity, firmware version, region, channel compatibility, radio/GNSS logs, peer discovery, and bidirectional acknowledged text before enabling custom lighting code.

### Host-side results

- Exact stock target build: pass at repository commit `42fbbcaf7`.
- Built firmware: `2.7.26.42fbbca`, 2,190,496-byte application image, SHA-256 `2493dd5ec088d594b6bf7c57fd90c5739bd02677afd3ba53a062ae3dadb274f0`.
- Deterministic effect kernel: pass, 36 effects and fixed vectors.
- Mast model: pass, four builds and five foam presets.
- Pattern workshop: pass, three templates plus validation and JSON exchange.

Physical light output was not tested. Stock Meshtastic has no Dax Glow module, and a WS2812B strip cannot be inferred from USB enumeration. The planned bench circuit uses GPIO16 for data, a separate fused 5 V supply, common ground, and a 3.3 V-to-5 V data-level shifter; the strip must not be powered from either Heltec board.

### Harness finding

The repository hardware runner currently assigns the first `0x303a` device to the single `esp32s3` role and ignores a second same-VID board. Its default ESP32-S3 target is `heltec-v3`, not `heltec-wireless-tracker-v2`. Until the runner supports two same-model ports, use explicit serialized connections and set the exact Tracker V2 environment before any approved flash. A direct unit-suite attempt was stopped because the session fixture repeatedly tried to query the unresponsive attached device; those timeouts are environmental, not firmware-test results.

## 2026-08-12 02:18-02:30 PDT — Scheduled read-only follow-up

Both previously identified boards remained connected on the same ports with the same USB serial numbers, and `lsof` found no process holding either port. All checks in this run were passive; no device reset, control-line toggle, bootloader entry, flash, erase, reboot, configuration write, or region change was attempted.

| Check                          | Result                  | Evidence and conclusion                                                                                                                                                                                                                                                                                    |
| ------------------------------ | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Meshtastic BLE discovery       | No advertisements found | `mcp-server/.venv/bin/meshtastic --ble-scan --timeout 20` completed without listing a Meshtastic device. Together with the failed USB protocol handshakes, neither board currently exposes an observable stock Meshtastic control surface.                                                                 |
| USB enumeration stability      | Pass                    | A 45.4-second `serial.tools.list_ports.comports()` sampler collected 46 samples. Both ports were present in every sample with zero identity mismatches and one stable two-device layout. This rules out an obvious cable or enumeration flap during the sample, but not a firmware or board-level problem. |
| USB descriptor and power state | Pass                    | `ioreg -p IOUSB -l -w 0` reported both Espressif `USB JTAG/serial debug unit` devices registered, matched, active, and idle (`busy 0`), with `Device Speed = 1`, current configuration 1, and a 500 mA USB power allocation.                                                                               |
| USB interface inventory        | Pass                    | `ioreg -r -c IOUSBHostInterface -l -w 0` showed the expected CDC-ACM control/data pair and vendor-specific JTAG interface for each serial number. No mass-storage, network, HID, or other application interface was exposed.                                                                               |
| Recent macOS USB error log     | No matching fault found | `/usr/bin/log show --last 30m --style compact` filtered by both ports, USB serials, and `Wireless Tracker` returned no device event beyond the log query itself. No matching disconnect, reset, or transport error was recorded in that window.                                                            |

The requested ChatGPT Pro fallback was consulted with the observed device evidence and strict no-reset/no-write constraint. It narrowed the remaining useful distinction to passive host-side USB fault checks or another exposed application interface; the descriptor, interface, power, stability, and unified-log checks above exhausted those avenues without finding a new control surface. Opening the serial interface at additional baud rates was intentionally skipped: ESP32-S3 native USB is not made more informative by baud selection, and a nominally read-only TTY open can still assert modem-control lines.

The USB transport is stable, but the running application on each board remains unknown and silent over both USB and BLE. Range, RSSI/SNR, peer discovery, bidirectional text/ACK, repeatability, and light-effect integration remain blocked until the boards run known responsive firmware. Physical LED output also remains untested because no addressable strip is wired or visually observable.

The next evidence-producing step requires Dax to confirm both LoRa antennas are attached and explicitly approve a standard stock Meshtastic upload to both exact Tracker V2 boards. After a successful stock baseline, the safe order is identity/config comparison, peer discovery, bidirectional acknowledged messages, a repeated message matrix, stationary RSSI/SNR logging, and only then a separately powered and fused WS2812B bench strip for the simulator-to-firmware effect contract.

## 2026-08-12 08:28 PDT — Antenna prerequisite confirmed

Dax confirmed that a LoRa antenna is attached to each board. Both boards also remain connected and unclaimed on their original ports and USB identities:

| Board | Serial port             | USB serial          | Result                |
| ----- | ----------------------- | ------------------- | --------------------- |
| A     | `/dev/cu.usbmodem83101` | `44:1B:F6:F8:ED:2C` | Present; no port user |
| B     | `/dev/cu.usbmodem83201` | `44:1B:F6:F8:EF:24` | Present; no port user |

The antenna safety prerequisite is complete, but it does not authorize flashing. All useful non-reset read-only diagnostics were exhausted in the preceding runs, so stock upload and subsequent mesh tests remain blocked on Dax's separate explicit approval. No device operation was performed in this check.

## 2026-08-12 13:31-13:43 PDT — Approved stock flash and control-surface verification

Dax explicitly approved a standard stock Meshtastic flash on both antenna-equipped boards. The exact `heltec-wireless-tracker-v2` target was rebuilt from repository commit `40050415c` before either upload:

- Firmware: `2.7.26.4005041`, vanilla edition
- Application: 2,190,496 bytes; SHA-256 `a16918f765ecd93e68c370d250766c616ad87fbcd2055a75e1fd2784b5e5dee8`
- Factory image: 2,256,032 bytes; SHA-256 `236362c724b899306cdf71de17a9b623b6a246c69379cb385b8606a834a526d9`
- Build: pass; 144,712 of 327,680 RAM bytes and 2,190,069 of 3,342,336 application-flash bytes

Each board was uploaded separately with `pio run -e heltec-wireless-tracker-v2 -t upload --upload-port <port>`. Esptool verified every written hash. This standard upload rewrote the bootloader, partition table, OTA data, and `app0` ranges; it did not perform a whole-chip erase and did not touch the NVS partition at `0x9000`.

| Board | Upload identity     | Post-flash serial port          | Node ID     | Upload | USB protocol |
| ----- | ------------------- | ------------------------------- | ----------- | ------ | ------------ |
| A     | `44:1B:F6:F8:ED:2C` | `/dev/cu.usbmodem441BF6F8ED2C1` | `!f6f8ed2c` | Pass   | Pass         |
| B     | `44:1B:F6:F8:EF:24` | `/dev/cu.usbmodem441BF6F8EF241` | `!f6f8ef24` | Pass   | Pass         |

Both nodes report the exact `HELTEC_WIRELESS_TRACKER_V2` hardware model, `heltec-wireless-tracker-v2` PlatformIO environment, firmware `2.7.26.4005041`, one-node databases containing only themselves, client role, and matching default primary channels. Both have `region: UNSET`, so no LoRa traffic was attempted.

Stock BLE discovery now finds `Meshtastic_ed2c` and `Meshtastic_ef24`. Dax entered the separate on-screen pairing PIN for each board, and both returned their node table over BLE. The CLI displayed the requested data but hung while disconnecting, so each already-complete process was interrupted; this was a host BLE-client cleanup issue, not a device test failure.

The next test requires explicit approval to set the legal LoRa region on both boards. Once their regions match, the existing default primary-channel configuration is already compatible for peer discovery, bidirectional acknowledged text, repeatability, and stationary RSSI/SNR measurements. Stock firmware does not contain the Dax Glow effects, and no external addressable strip is wired, so physical light testing remains pending the custom firmware and bench circuit.

## 2026-08-12 13:46-14:00 PDT — US region and bidirectional mesh baseline

Dax explicitly approved setting both nodes to the US LoRa region. `lora.region` was changed from `UNSET` to `US` on Board A and then Board B, with access serialized per port. Each setting caused the expected configuration restart; both nodes subsequently reported reboot count 2, named region `US`, stable enum value 1, and the same default primary-channel URL. No other setting or channel field was changed. An immediate compact read during Board B's restart briefly returned enum 0, but the full named configuration and a later stable compact read both confirmed `US`.

### Discovery and key exchange

- Board A heard Board B's post-region startup NodeInfo at 0 hops and 7 dB SNR.
- A short channel discovery message from Board A reached Board B at 0 hops and 8 dB SNR.
- The repository's documented `ToRadio.Heartbeat(nonce=1)` path triggered a fresh NodeInfo broadcast from each node without another restart or configuration change.
- Final node databases on both boards contain both exact Tracker V2 identities and both 32-byte public keys.

### Directed delivery and acknowledgments

Three uniquely identified directed text packets were sent in each direction using `wantAck=True`. A receiver-side decoded-text listener proved application delivery, while a sender-side response handler separately captured the routing ACK for the exact packet ID.

| Direction | Attempts | Delivered | Explicit ACK `NONE` | Hops | Received SNR range | Sampled RSSI |
| --------- | -------- | --------- | ------------------- | ---- | ------------------ | ------------ |
| A → B     | 3        | 3         | 3                   | 0    | 7.25–8.75 dB       | −29 dBm      |
| B → A     | 3        | 3         | 3                   | 0    | 7.25–8.50 dB       | −37 dBm      |

All six packets retained the intended unicast destination and reported `hopStart=3`, `hopLimit=3`, proving no hop was consumed. RSSI was present in one decoded sample per direction; the Python client omitted it from the other four packet dictionaries, so no value was inferred.

### Route test

| Request | Forward path    | Return path     | Result |
| ------- | --------------- | --------------- | ------ |
| A → B   | direct, 9.25 dB | direct, 7.75 dB | Pass   |
| B → A   | direct, 9.25 dB | direct, 7.25 dB | Pass   |

Both application serial ports were present and unclaimed after testing. This completes the stationary stock-firmware USB, BLE, discovery, public-key, directed-delivery, explicit-ACK, repeatability, and direct-route baseline. Meaningful range testing now requires physically separating the nodes and recording distance/obstructions. Physical light-effect testing still requires custom Glow firmware plus an externally powered, fused, level-shifted addressable strip that is visibly observable.

## 2026-08-12 15:06-16:07 PDT — DAX_GLOW_SELF_TEST firmware and synchronization

Dax requested and approved implementing and loading the custom self-test firmware on both antenna-equipped boards. The opt-in `heltec-wireless-tracker-v2-dax-glow` environment was built from commit `45bbcfd80`:

- Firmware: `2.7.26.45bbcfd`
- Application: 2,208,048 bytes; SHA-256 `f536690ad07091079c68a47f1d5078c993b3cd6057353b08043215d06e59fe0f`
- Build use: 144,752 of 327,680 RAM bytes and 2,207,613 of 3,342,336 application-flash bytes
- Self-test output contract: ten WS2812-compatible pixels on GPIO16, brightness cap 64, 25 FPS
- Firmware effects: stable IDs 0–9 (`off`, `solid`, `wipe`, `comet`, `rainbow`, `strobe`, `pulse`, `scanner`, `chase`, `twinkle`)

Each ESP32-S3 entered its normal native-USB bootloader through a 1200-baud touch and was uploaded separately. Esptool verified every written segment before reboot. This was a standard upload, not a whole-chip erase; the existing NVS configuration remained intact.

| Board | Node ID     | Application port                | Firmware         | Region | Upload |
| ----- | ----------- | ------------------------------- | ---------------- | ------ | ------ |
| A     | `!f6f8ed2c` | `/dev/cu.usbmodem441BF6F8ED2C1` | `2.7.26.45bbcfd` | `US`   | Pass   |
| B     | `!f6f8ef24` | `/dev/cu.usbmodem441BF6F8EF241` | `2.7.26.45bbcfd` | `US`   | Pass   |

### Software and live-device evidence

- The deterministic C++ effect/protocol suite passed 5/5, including simulator vectors, absolute cue time, pre-start blackout, cue decoding, and the stable status layout.
- The unchanged stock `heltec-wireless-tracker-v2` environment and the custom environment both built successfully; the custom additions are compile-time gated.
- Both firmware instances reported `SELF_TEST_BUILD`, `OUTPUT_INITIALIZED`, ten pixels, GPIO16, and brightness cap 64. Their render counters advanced from the running 25 FPS loop.
- Concurrent USB clock commands were launched 0.60 ms apart. Both boards subsequently reported `HOST_SYNC`; old or repeated clock tokens are rejected so a delayed packet cannot roll a newer clock backward.
- Board A broadcast one 29-byte Glow cue over LoRa. Board B accepted the exact cue identity, effect 8, brightness 48, and absolute start time `1786575905160` ms.
- At the shared requested timestamp `1786575907200` ms, both boards independently reported frame 51 with the same RGB frame hash, `0x479708d5`.
- Three of three live probes reported frames on the common 40 ms phase grid. Final render counts were 5,371 and 4,339.

The repeatable command is:

```bash
mcp-server/.venv/bin/python tools/glow-hardware-sync-test.py \
  /dev/cu.usbmodem441BF6F8ED2C1 \
  /dev/cu.usbmodem441BF6F8EF241
```

Result: the custom module, GPIO driver initialization, LoRa cue transport, absolute-time effect calculation, and two-board firmware synchronization pass. `physical_led_observation=false`: no addressable strip was wired or visible, so this does not claim that actual LEDs emitted the expected colors. Visual and electrical verification still require the separately powered, fused, level-shifted bench circuit described in the prototype guide.
