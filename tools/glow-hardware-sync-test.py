#!/usr/bin/env python3
"""Exercise DAX Glow clock, cue transport, render loop, and frame sync."""

from __future__ import annotations

import argparse
import concurrent.futures
import dataclasses
import struct
import threading
import time
from typing import Any

from meshtastic import BROADCAST_NUM
from meshtastic.protobuf import portnums_pb2
from meshtastic.serial_interface import SerialInterface

MAGIC = b"GLW"
VERSION = 1
CUE = 1
STATUS_REQUEST = 2
CLOCK_SYNC = 3
STATUS = 0x82
STATUS_SIZE = 80
FRAME_INTERVAL_MS = 40


@dataclasses.dataclass(frozen=True)
class GlowStatus:
    result: int
    flags: int
    clock_source: int
    effect_id: int
    brightness: int
    pixel_count: int
    max_brightness: int
    data_pin: int
    rtc_quality: int
    token: int
    cue_id: int
    start_epoch_ms: int
    now_epoch_ms: int
    sample_epoch_ms: int
    last_frame_epoch_ms: int
    sample_cue_time_ms: int
    sample_frame_number: int
    sample_frame_hash: int
    last_frame_hash: int
    render_count: int
    clock_sync_age_ms: int


def epoch_ms() -> float:
    return time.time_ns() / 1_000_000


def encode_clock_sync(token: int, host_epoch_ms: int) -> bytes:
    return struct.pack("<3sBBIQ", MAGIC, VERSION, CLOCK_SYNC, token, host_epoch_ms)


def encode_status_request(token: int, sample_epoch_ms: int) -> bytes:
    return struct.pack(
        "<3sBBIQ", MAGIC, VERSION, STATUS_REQUEST, token, sample_epoch_ms
    )


def encode_cue(
    cue_id: int, effect_id: int, brightness: int, start_epoch_ms: int
) -> bytes:
    palette = (255, 68, 137, 90, 232, 255, 123, 255, 171)
    return struct.pack(
        "<3sBBBBBIQ9B",
        MAGIC,
        VERSION,
        CUE,
        effect_id,
        brightness,
        0,
        cue_id,
        start_epoch_ms,
        *palette,
    )


def decode_status(payload: bytes) -> GlowStatus:
    if len(payload) != STATUS_SIZE:
        raise RuntimeError(
            f"DAX Glow status length {len(payload)}, expected {STATUS_SIZE}"
        )
    values = struct.unpack("<3s7BH4B2I4Q6I", payload)
    if values[0] != MAGIC or values[1] != VERSION or values[2] != STATUS:
        raise RuntimeError(f"invalid DAX Glow status header: {values[0:3]!r}")
    return GlowStatus(*(values[3:12] + values[13:]))


def local_node_num(interface: SerialInterface) -> int:
    node_num = getattr(interface.localNode, "nodeNum", None)
    if node_num is None and interface.myInfo is not None:
        node_num = interface.myInfo.my_node_num
    if node_num is None:
        raise RuntimeError("Meshtastic client did not expose the local node number")
    return int(node_num)


def request(
    interface: SerialInterface, payload: bytes, timeout: float = 8
) -> tuple[GlowStatus, float, float]:
    completed = threading.Event()
    replies: list[dict[str, Any]] = []

    def on_response(packet: dict[str, Any]) -> None:
        replies.append(packet)
        completed.set()

    started = epoch_ms()
    interface.sendData(
        payload,
        destinationId=local_node_num(interface),
        portNum=portnums_pb2.PortNum.PRIVATE_APP,
        wantResponse=True,
        onResponse=on_response,
        hopLimit=0,
    )
    if not completed.wait(timeout):
        raise TimeoutError("timed out waiting for DAX Glow status response")
    finished = epoch_ms()
    response_payload = replies[0].get("decoded", {}).get("payload")
    if not isinstance(response_payload, bytes):
        raise RuntimeError(f"DAX Glow response had no binary payload: {replies[0]!r}")
    return decode_status(response_payload), started, finished


def send_clock_sync(interface: SerialInterface, token: int) -> tuple[float, float]:
    started = epoch_ms()
    interface.sendData(
        encode_clock_sync(token, round(started)),
        destinationId=local_node_num(interface),
        portNum=portnums_pb2.PortNum.PRIVATE_APP,
        wantResponse=False,
        hopLimit=0,
    )
    return started, epoch_ms()


def sync_clock_pair(
    first: SerialInterface, second: SerialInterface
) -> tuple[float, float, float]:
    token = int(epoch_ms()) & 0xFFFFFFFF
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        first_future = pool.submit(send_clock_sync, first, token)
        second_future = pool.submit(send_clock_sync, second, token)
        first_started, first_finished = first_future.result()
        second_started, second_finished = second_future.result()
    return (
        abs(first_started - second_started),
        first_finished - first_started,
        second_finished - second_started,
    )


def query_status(
    interface: SerialInterface, token: int, sample_epoch_ms: int
) -> tuple[GlowStatus, float, int, float]:
    errors: list[str] = []
    for attempt in range(4):
        try:
            status, started, finished = request(
                interface, encode_status_request(token + attempt, sample_epoch_ms)
            )
        except TimeoutError as exc:
            errors.append(str(exc))
            continue
        if status.result != 0:
            raise RuntimeError(f"status request rejected: {status}")
        inbound_offset = status.now_epoch_ms - started
        return status, inbound_offset, attempt + 1, finished - started
    raise TimeoutError(f"status request failed after four attempts: {errors!r}")


def query_pair(
    first: SerialInterface,
    second: SerialInterface,
    token: int,
    sample_epoch_ms: int,
) -> tuple[tuple[GlowStatus, float, int, float], tuple[GlowStatus, float, int, float]]:
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        first_future = pool.submit(query_status, first, token, sample_epoch_ms)
        second_future = pool.submit(query_status, second, token + 1, sample_epoch_ms)
        return first_future.result(), second_future.result()


def run(first_port: str, second_port: str) -> None:
    first = SerialInterface(devPath=first_port, connectNow=True)
    second = SerialInterface(devPath=second_port, connectNow=True)
    try:
        time.sleep(2)
        dispatch_skew, first_write_ms, second_write_ms = sync_clock_pair(first, second)
        if dispatch_skew >= FRAME_INTERVAL_MS:
            raise RuntimeError(
                f"clock calibration dispatch skew {dispatch_skew:.1f} ms exceeds one frame"
            )
        time.sleep(0.5)
        (first_sync, _, first_sync_attempts, first_rtt), (
            second_sync,
            _,
            second_sync_attempts,
            second_rtt,
        ) = query_pair(first, second, 0x2400, 0)
        if first_sync.clock_source != 2 or second_sync.clock_source != 2:
            raise RuntimeError(
                f"one or both boards rejected host clock calibration: {first_sync}, {second_sync}"
            )
        if first_sync.result != 0 or second_sync.result != 0:
            raise RuntimeError(
                f"one or both clock status probes failed: {first_sync}, {second_sync}"
            )

        cue_id = int(epoch_ms()) & 0xFFFFFFFF
        start_epoch_ms = (
            (int(epoch_ms()) + 5000 + FRAME_INTERVAL_MS - 1) // FRAME_INTERVAL_MS
        ) * FRAME_INTERVAL_MS
        cue_payload = encode_cue(
            cue_id, effect_id=8, brightness=48, start_epoch_ms=start_epoch_ms
        )
        first.sendData(
            cue_payload,
            destinationId=BROADCAST_NUM,
            portNum=portnums_pb2.PortNum.PRIVATE_APP,
            wantAck=False,
            wantResponse=False,
            hopLimit=3,
        )

        sample_epoch_ms = start_epoch_ms + 2040
        delivery_status: GlowStatus | None = None
        for delivery_probe in range(4):
            candidate, _, _, _ = query_status(
                second, 0x2800 + delivery_probe * 4, sample_epoch_ms
            )
            if (
                candidate.cue_id == cue_id
                and candidate.start_epoch_ms == start_epoch_ms
                and candidate.effect_id == 8
            ):
                delivery_status = candidate
                break
            time.sleep(1)
        if delivery_status is None:
            raise TimeoutError("second board did not accept the broadcast Glow cue")

        (first_status, _, first_probe_attempts, _), (
            second_status,
            _,
            second_probe_attempts,
            _,
        ) = query_pair(first, second, 0x3000, sample_epoch_ms)
        for label, status in (("first", first_status), ("second", second_status)):
            if not status.flags & 0x02:
                raise RuntimeError(
                    f"{label} board did not activate the broadcast cue: {status}"
                )
            if status.cue_id != cue_id or status.start_epoch_ms != start_epoch_ms:
                raise RuntimeError(f"{label} board stored a different cue: {status}")
            if (
                status.pixel_count != 10
                or status.data_pin != 16
                or not status.flags & 0x08
            ):
                raise RuntimeError(
                    f"{label} board's ten-pixel output is not initialized: {status}"
                )

        if first_status.sample_frame_hash != second_status.sample_frame_hash:
            raise RuntimeError(
                "boards rendered different frame hashes for the same cue timestamp: "
                f"{first_status.sample_frame_hash:08x} != {second_status.sample_frame_hash:08x}"
            )

        wait_seconds = max(0.0, (start_epoch_ms + 600 - epoch_ms()) / 1000)
        if wait_seconds:
            time.sleep(wait_seconds)

        phase_aligned_live_probes = 0
        live_probes: list[tuple[int, int, int, int]] = []
        for probe in range(3):
            (first_live, _, _, _), (second_live, _, _, _) = query_pair(
                first, second, 0x4000 + probe * 2, sample_epoch_ms
            )
            live_probes.append(
                (
                    first_live.last_frame_epoch_ms,
                    first_live.last_frame_hash,
                    second_live.last_frame_epoch_ms,
                    second_live.last_frame_hash,
                )
            )
            if (
                first_live.last_frame_epoch_ms % FRAME_INTERVAL_MS == 0
                and second_live.last_frame_epoch_ms % FRAME_INTERVAL_MS == 0
            ):
                phase_aligned_live_probes += 1
            time.sleep(0.12)
        if phase_aligned_live_probes != len(live_probes):
            raise RuntimeError(
                f"one or more live frames missed the absolute 40 ms phase grid: {live_probes!r}"
            )

        time.sleep(0.25)
        (first_after, _, _, _), (second_after, _, _, _) = query_pair(
            first, second, 0x5000, sample_epoch_ms
        )
        if (
            first_after.render_count <= first_status.render_count
            or second_after.render_count <= second_status.render_count
        ):
            raise RuntimeError("one or both firmware render loops did not advance")

        print("PASS DAX Glow two-board firmware synchronization")
        print(
            f"nodes=!{local_node_num(first):08x},!{local_node_num(second):08x} "
            f"ports={first_port},{second_port}"
        )
        print(
            f"clock_dispatch_skew_ms={dispatch_skew:.2f} "
            f"clock_write_ms={first_write_ms:.1f},{second_write_ms:.1f} "
            f"clock_status=host-sync,host-sync status_rtt_ms={first_rtt:.1f},{second_rtt:.1f} "
            f"status_attempts={first_sync_attempts},{second_sync_attempts} "
            f"probe_attempts={first_probe_attempts},{second_probe_attempts}"
        )
        print(
            f"cue_id=0x{cue_id:08x} effect=8 brightness=48 start_epoch_ms={start_epoch_ms} "
            f"payload_bytes={len(cue_payload)} delivery=broadcast-cue-accepted"
        )
        print(
            f"sample_epoch_ms={sample_epoch_ms} frame={first_status.sample_frame_number} "
            f"shared_hash=0x{first_status.sample_frame_hash:08x}"
        )
        print(
            f"live_phase_aligned_probes={phase_aligned_live_probes}/{len(live_probes)} "
            f"render_counts={first_after.render_count},{second_after.render_count}"
        )
        print(
            f"output=gpio{first_status.data_pin} pixels={first_status.pixel_count} "
            f"brightness_cap={first_status.max_brightness} physical_led_observation=false"
        )
    finally:
        first.close()
        second.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("first_port")
    parser.add_argument("second_port")
    args = parser.parse_args()
    run(args.first_port, args.second_port)


if __name__ == "__main__":
    main()
