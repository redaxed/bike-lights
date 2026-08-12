#pragma once

#include "GlowEffect.h"

#include <cstddef>
#include <cstdint>

namespace daxglow
{

constexpr uint8_t PROTOCOL_VERSION = 1;
constexpr size_t HEADER_SIZE = 5;
constexpr size_t CUE_PACKET_SIZE = 29;
constexpr size_t STATUS_REQUEST_SIZE = 17;
constexpr size_t CLOCK_SYNC_PACKET_SIZE = 17;
constexpr size_t STATUS_PACKET_SIZE = 80;

enum class MessageType : uint8_t {
    CUE = 1,
    STATUS_REQUEST = 2,
    CLOCK_SYNC = 3,
    STATUS = 0x82,
};

enum class Result : uint8_t {
    OK = 0,
    BAD_LENGTH = 1,
    BAD_MAGIC = 2,
    BAD_VERSION = 3,
    BAD_TYPE = 4,
    UNSUPPORTED_EFFECT = 5,
    CLOCK_UNAVAILABLE = 6,
    REMOTE_CLOCK_SYNC_DENIED = 7,
    STALE_CLOCK_SYNC = 8,
};

enum class ClockSource : uint8_t {
    NONE = 0,
    RTC = 1,
    HOST_SYNC = 2,
};

enum StatusFlag : uint8_t {
    SELF_TEST_BUILD = 1 << 0,
    CUE_ACTIVE = 1 << 1,
    CLOCK_VALID = 1 << 2,
    OUTPUT_INITIALIZED = 1 << 3,
};

struct StatusRequest {
    uint32_t token = 0;
    uint64_t sampleEpochMs = 0;
};

struct ClockSyncRequest {
    uint32_t token = 0;
    uint64_t hostEpochMs = 0;
};

struct Status {
    Result result = Result::OK;
    uint8_t flags = 0;
    ClockSource clockSource = ClockSource::NONE;
    uint8_t effectId = 0;
    uint8_t brightness = 0;
    uint16_t pixelCount = 0;
    uint8_t maxBrightness = 0;
    uint8_t dataPin = 0;
    uint8_t rtcQuality = 0;
    uint32_t token = 0;
    uint32_t cueId = 0;
    uint64_t startEpochMs = 0;
    uint64_t nowEpochMs = 0;
    uint64_t sampleEpochMs = 0;
    uint64_t lastFrameEpochMs = 0;
    uint32_t sampleCueTimeMs = 0;
    uint32_t sampleFrameNumber = 0;
    uint32_t sampleFrameHash = 0;
    uint32_t lastFrameHash = 0;
    uint32_t renderCount = 0;
    uint32_t clockSyncAgeMs = 0;
};

inline uint32_t readU32(const uint8_t *bytes)
{
    return static_cast<uint32_t>(bytes[0]) | (static_cast<uint32_t>(bytes[1]) << 8) | (static_cast<uint32_t>(bytes[2]) << 16) |
           (static_cast<uint32_t>(bytes[3]) << 24);
}

inline uint64_t readU64(const uint8_t *bytes)
{
    return static_cast<uint64_t>(readU32(bytes)) | (static_cast<uint64_t>(readU32(bytes + 4)) << 32);
}

inline void writeU16(uint8_t *bytes, uint16_t value)
{
    bytes[0] = static_cast<uint8_t>(value);
    bytes[1] = static_cast<uint8_t>(value >> 8);
}

inline void writeU32(uint8_t *bytes, uint32_t value)
{
    for (uint8_t i = 0; i < 4; i++)
        bytes[i] = static_cast<uint8_t>(value >> (i * 8));
}

inline void writeU64(uint8_t *bytes, uint64_t value)
{
    writeU32(bytes, static_cast<uint32_t>(value));
    writeU32(bytes + 4, static_cast<uint32_t>(value >> 32));
}

inline void writeHeader(uint8_t *bytes, MessageType type)
{
    bytes[0] = 'G';
    bytes[1] = 'L';
    bytes[2] = 'W';
    bytes[3] = PROTOCOL_VERSION;
    bytes[4] = static_cast<uint8_t>(type);
}

inline Result validateHeader(const uint8_t *bytes, size_t size, MessageType type)
{
    if (size < HEADER_SIZE)
        return Result::BAD_LENGTH;
    if (bytes[0] != 'G' || bytes[1] != 'L' || bytes[2] != 'W')
        return Result::BAD_MAGIC;
    if (bytes[3] != PROTOCOL_VERSION)
        return Result::BAD_VERSION;
    if (bytes[4] != static_cast<uint8_t>(type))
        return Result::BAD_TYPE;
    return Result::OK;
}

inline Result decodeCue(const uint8_t *bytes, size_t size, Cue &cue)
{
    const Result header = validateHeader(bytes, size, MessageType::CUE);
    if (header != Result::OK)
        return header;
    if (size != CUE_PACKET_SIZE)
        return Result::BAD_LENGTH;

    cue.effectId = bytes[5];
    cue.brightness = bytes[6];
    cue.cueId = readU32(bytes + 8);
    cue.startEpochMs = readU64(bytes + 12);
    for (uint8_t color = 0; color < 3; color++) {
        cue.palette.colors[color] = {bytes[20 + color * 3], bytes[21 + color * 3], bytes[22 + color * 3]};
    }
    return isSupportedEffect(cue.effectId) ? Result::OK : Result::UNSUPPORTED_EFFECT;
}

inline Result decodeStatusRequest(const uint8_t *bytes, size_t size, StatusRequest &request)
{
    const Result header = validateHeader(bytes, size, MessageType::STATUS_REQUEST);
    if (header != Result::OK)
        return header;
    if (size != STATUS_REQUEST_SIZE)
        return Result::BAD_LENGTH;

    request.token = readU32(bytes + 5);
    request.sampleEpochMs = readU64(bytes + 9);
    return Result::OK;
}

inline Result decodeClockSync(const uint8_t *bytes, size_t size, ClockSyncRequest &request)
{
    const Result header = validateHeader(bytes, size, MessageType::CLOCK_SYNC);
    if (header != Result::OK)
        return header;
    if (size != CLOCK_SYNC_PACKET_SIZE)
        return Result::BAD_LENGTH;

    request.token = readU32(bytes + 5);
    request.hostEpochMs = readU64(bytes + 9);
    return Result::OK;
}

inline size_t encodeStatus(const Status &status, uint8_t *bytes, size_t capacity)
{
    if (capacity < STATUS_PACKET_SIZE)
        return 0;

    writeHeader(bytes, MessageType::STATUS);
    bytes[5] = static_cast<uint8_t>(status.result);
    bytes[6] = status.flags;
    bytes[7] = static_cast<uint8_t>(status.clockSource);
    bytes[8] = status.effectId;
    bytes[9] = status.brightness;
    writeU16(bytes + 10, status.pixelCount);
    bytes[12] = status.maxBrightness;
    bytes[13] = status.dataPin;
    bytes[14] = status.rtcQuality;
    bytes[15] = 0;
    writeU32(bytes + 16, status.token);
    writeU32(bytes + 20, status.cueId);
    writeU64(bytes + 24, status.startEpochMs);
    writeU64(bytes + 32, status.nowEpochMs);
    writeU64(bytes + 40, status.sampleEpochMs);
    writeU64(bytes + 48, status.lastFrameEpochMs);
    writeU32(bytes + 56, status.sampleCueTimeMs);
    writeU32(bytes + 60, status.sampleFrameNumber);
    writeU32(bytes + 64, status.sampleFrameHash);
    writeU32(bytes + 68, status.lastFrameHash);
    writeU32(bytes + 72, status.renderCount);
    writeU32(bytes + 76, status.clockSyncAgeMs);
    return STATUS_PACKET_SIZE;
}

} // namespace daxglow
