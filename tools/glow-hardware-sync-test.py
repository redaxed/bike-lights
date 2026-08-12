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
from pubsub import pub

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
    interface: SerialInterface, payload: bytes, timeout: float = 20
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


def sync_clock(
    interface: SerialInterface, token_base: int
) -> tuple[GlowStatus, float, float]:
    best_rtt = float("inf")
    best_status: GlowStatus | None = None
    best_offset = float("inf")

    for attempt in range(4):
        compensation = 0 if best_rtt == float("inf") else round(best_rtt / 2)
        sent_at = epoch_ms()
        payload = encode_clock_sync(token_base + attempt, round(sent_at + compensation))
        status, started, finished = request(interface, payload)
        if status.result != 0 or status.clock_source != 2:
            raise RuntimeError(f"clock sync rejected: {status}")
        rtt = finished - started
        offset = status.now_epoch_ms - ((started + finished) / 2)
        if rtt < best_rtt:
            best_rtt = rtt
            best_status = status
            best_offset = offset

    assert best_status is not None
    return best_status, best_rtt, best_offset


def query_status(
    interface: SerialInterface, token: int, sample_epoch_ms: int
) -> tuple[GlowStatus, float]:
    status, started, finished = request(
        interface, encode_status_request(token, sample_epoch_ms)
    )
    if status.result != 0:
        raise RuntimeError(f"status request rejected: {status}")
    clock_offset = status.now_epoch_ms - ((started + finished) / 2)
    return status, clock_offset


def query_pair(
    first: SerialInterface,
    second: SerialInterface,
    token: int,
    sample_epoch_ms: int,
) -> tuple[tuple[GlowStatus, float], tuple[GlowStatus, float]]:
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        first_future = pool.submit(query_status, first, token, sample_epoch_ms)
        second_future = pool.submit(query_status, second, token + 1, sample_epoch_ms)
        return first_future.result(), second_future.result()


def run(first_port: str, second_port: str) -> None:
    received_cue = threading.Event()
    received_packets: list[dict[str, Any]] = []
    first = SerialInterface(devPath=first_port, connectNow=True)
    second = SerialInterface(devPath=second_port, connectNow=True)

    def on_private(packet: dict[str, Any], interface: SerialInterface) -> None:
        if interface is second:
            received_packets.append(packet)
            received_cue.set()

    pub.subscribe(on_private, "meshtastic.receive.data.PRIVATE_APP")
    try:
        time.sleep(2)
        first_sync, first_rtt, first_offset = sync_clock(first, 0x1000)
        second_sync, second_rtt, second_offset = sync_clock(second, 0x2000)
        if abs(first_offset - second_offset) > FRAME_INTERVAL_MS:
            raise RuntimeError(
                f"clock skew {abs(first_offset - second_offset):.1f} ms exceeds one {FRAME_INTERVAL_MS} ms frame"
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
        if not received_cue.wait(30):
            raise TimeoutError("second board did not receive the broadcast Glow cue")
        delivered_payload = received_packets[-1].get("decoded", {}).get("payload")
        if delivered_payload != cue_payload:
            raise RuntimeError("second board's Glow cue payload changed in transit")

        sample_epoch_ms = start_epoch_ms + 2040
        (first_status, first_probe_offset), (second_status, second_probe_offset) = (
            query_pair(first, second, 0x3000, sample_epoch_ms)
        )
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

        matching_live_frames = 0
        live_probes: list[tuple[int, int, int, int]] = []
        for probe in range(6):
            (first_live, _), (second_live, _) = query_pair(
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
                first_live.last_frame_epoch_ms == second_live.last_frame_epoch_ms
                and first_live.last_frame_hash == second_live.last_frame_hash
            ):
                matching_live_frames += 1
            time.sleep(0.12)
        if matching_live_frames == 0:
            raise RuntimeError(
                f"no simultaneous live frame probe matched: {live_probes!r}"
            )

        time.sleep(0.25)
        (first_after, _), (second_after, _) = query_pair(
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
            f"clock_rtt_ms={first_rtt:.1f},{second_rtt:.1f} "
            f"clock_offsets_ms={first_offset:.1f},{second_offset:.1f} "
            f"probe_offsets_ms={first_probe_offset:.1f},{second_probe_offset:.1f}"
        )
        print(
            f"cue_id=0x{cue_id:08x} effect=8 brightness=48 start_epoch_ms={start_epoch_ms} "
            f"payload_bytes={len(cue_payload)} delivery=byte-for-byte"
        )
        print(
            f"sample_epoch_ms={sample_epoch_ms} frame={first_status.sample_frame_number} "
            f"shared_hash=0x{first_status.sample_frame_hash:08x}"
        )
        print(
            f"live_matching_probes={matching_live_frames}/6 "
            f"render_counts={first_after.render_count},{second_after.render_count}"
        )
        print(
            f"output=gpio{first_status.data_pin} pixels={first_status.pixel_count} "
            f"brightness_cap={first_status.max_brightness} physical_led_observation=false"
        )
    finally:
        try:
            pub.unsubscribe(on_private, "meshtastic.receive.data.PRIVATE_APP")
        except Exception:
            pass
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
