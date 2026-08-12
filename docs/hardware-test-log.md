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
