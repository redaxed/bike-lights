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
