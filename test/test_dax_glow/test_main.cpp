#include "modules/daxglow/GlowEffect.h"
#include "modules/daxglow/GlowProtocol.h"

#include <cmath>
#include <cstring>
#include <unity.h>

namespace
{

constexpr daxglow::Palette TEST_PALETTE = {{{255, 68, 137}, {90, 232, 255}, {123, 255, 171}}};

void test_core_effect_vectors_match_simulator()
{
    struct Vector {
        uint8_t effect;
        uint16_t pixel;
        uint32_t timeMs;
        daxglow::Rgb color;
        double intensity;
    };

    const Vector vectors[] = {
        {0, 0, 500, {255, 68, 137}, 0},         {1, 7, 500, {255, 68, 137}, 1},     {2, 20, 100, {255, 68, 137}, 0.03},
        {3, 10, 850, {90, 232, 255}, 0.548812}, {4, 4, 2181, {255, 46, 220}, 1},    {5, 11, 170, {255, 255, 255}, 1},
        {6, 18, 1200, {255, 68, 137}, 1},       {7, 12, 450, {255, 68, 137}, 0.81}, {8, 5, 600, {255, 68, 137}, 1},
        {9, 5, 0, {255, 68, 137}, 0.658148},
    };

    for (const auto &vector : vectors) {
        const daxglow::EffectSample sample = daxglow::sampleEffect(vector.effect, vector.pixel, 24, vector.timeMs, TEST_PALETTE);
        TEST_ASSERT_TRUE(sample.color == vector.color);
        TEST_ASSERT_INT_WITHIN(1, static_cast<int>(std::round(vector.intensity * 1000000)),
                               static_cast<int>(std::round(sample.intensity * 1000000)));
    }
}

void test_frame_hash_uses_shared_absolute_cue_time()
{
    daxglow::Cue first;
    first.cueId = 0x12345678;
    first.startEpochMs = 1800000000000ULL;
    first.effectId = 8;
    first.brightness = 48;
    first.palette = TEST_PALETTE;
    const daxglow::Cue second = first;

    const uint64_t sample = first.startEpochMs + 2047;
    TEST_ASSERT_EQUAL_UINT32(daxglow::frameHash(first, 10, sample), daxglow::frameHash(second, 10, sample));
    TEST_ASSERT_EQUAL_UINT32(daxglow::frameHash(first, 10, sample), daxglow::frameHash(first, 10, sample + 32));
    TEST_ASSERT_NOT_EQUAL(daxglow::frameHash(first, 10, sample), daxglow::frameHash(first, 10, sample + 120));
    TEST_ASSERT_EQUAL_UINT32(51, daxglow::frameNumber(first, sample));
    TEST_ASSERT_EQUAL_UINT32(2047, daxglow::cueTimeMs(first, sample));
}

void test_pixels_are_off_before_scheduled_start()
{
    daxglow::Cue cue;
    cue.startEpochMs = 1800000000000ULL;
    cue.effectId = 1;
    cue.brightness = 64;
    cue.palette = TEST_PALETTE;

    const daxglow::Rgb before = daxglow::renderPixel(cue, 0, 10, cue.startEpochMs - 1);
    const daxglow::Rgb atStart = daxglow::renderPixel(cue, 0, 10, cue.startEpochMs);
    const daxglow::Rgb off = {0, 0, 0};
    const daxglow::Rgb expected = {64, 17, 34};
    TEST_ASSERT_TRUE(before == off);
    TEST_ASSERT_TRUE(atStart == expected);
}

void test_cue_protocol_decodes_versioned_packet()
{
    uint8_t packet[daxglow::CUE_PACKET_SIZE] = {};
    daxglow::writeHeader(packet, daxglow::MessageType::CUE);
    packet[5] = 8;
    packet[6] = 48;
    daxglow::writeU32(packet + 8, 0x12345678);
    daxglow::writeU64(packet + 12, 1800000000000ULL);
    const uint8_t colors[] = {255, 68, 137, 90, 232, 255, 123, 255, 171};
    memcpy(packet + 20, colors, sizeof(colors));

    daxglow::Cue cue;
    TEST_ASSERT_EQUAL_UINT8(static_cast<uint8_t>(daxglow::Result::OK),
                            static_cast<uint8_t>(daxglow::decodeCue(packet, sizeof(packet), cue)));
    TEST_ASSERT_EQUAL_UINT32(0x12345678, cue.cueId);
    TEST_ASSERT_EQUAL_UINT64(1800000000000ULL, cue.startEpochMs);
    TEST_ASSERT_EQUAL_UINT8(8, cue.effectId);
    TEST_ASSERT_EQUAL_UINT8(48, cue.brightness);
    const daxglow::Rgb thirdColor = {123, 255, 171};
    TEST_ASSERT_TRUE(cue.palette.colors[2] == thirdColor);

    packet[5] = daxglow::CORE_EFFECT_COUNT;
    TEST_ASSERT_EQUAL_UINT8(static_cast<uint8_t>(daxglow::Result::UNSUPPORTED_EFFECT),
                            static_cast<uint8_t>(daxglow::decodeCue(packet, sizeof(packet), cue)));
}

void test_status_packet_has_stable_wire_layout()
{
    daxglow::Status status;
    status.flags = daxglow::StatusFlag::SELF_TEST_BUILD | daxglow::StatusFlag::CLOCK_VALID;
    status.clockSource = daxglow::ClockSource::HOST_SYNC;
    status.effectId = 8;
    status.brightness = 48;
    status.pixelCount = 10;
    status.maxBrightness = 64;
    status.dataPin = 16;
    status.rtcQuality = 3;
    status.token = 0xaabbccdd;
    status.cueId = 0x12345678;
    status.startEpochMs = 1800000000000ULL;
    status.nowEpochMs = status.startEpochMs + 1000;
    status.sampleEpochMs = status.startEpochMs + 2000;
    status.lastFrameEpochMs = status.startEpochMs + 960;
    status.sampleCueTimeMs = 2000;
    status.sampleFrameNumber = 50;
    status.sampleFrameHash = 0x01020304;
    status.lastFrameHash = 0x05060708;
    status.renderCount = 99;
    status.clockSyncAgeMs = 123;

    uint8_t packet[daxglow::STATUS_PACKET_SIZE] = {};
    TEST_ASSERT_EQUAL_UINT32(sizeof(packet), daxglow::encodeStatus(status, packet, sizeof(packet)));
    TEST_ASSERT_EQUAL_UINT8('G', packet[0]);
    TEST_ASSERT_EQUAL_UINT8(static_cast<uint8_t>(daxglow::MessageType::STATUS), packet[4]);
    TEST_ASSERT_EQUAL_UINT32(status.token, daxglow::readU32(packet + 16));
    TEST_ASSERT_EQUAL_UINT64(status.startEpochMs, daxglow::readU64(packet + 24));
    TEST_ASSERT_EQUAL_UINT64(status.lastFrameEpochMs, daxglow::readU64(packet + 48));
    TEST_ASSERT_EQUAL_UINT32(status.sampleFrameHash, daxglow::readU32(packet + 64));
    TEST_ASSERT_EQUAL_UINT32(status.clockSyncAgeMs, daxglow::readU32(packet + 76));
}

} // namespace

void setUp() {}
void tearDown() {}

void setup()
{
    UNITY_BEGIN();
    RUN_TEST(test_core_effect_vectors_match_simulator);
    RUN_TEST(test_frame_hash_uses_shared_absolute_cue_time);
    RUN_TEST(test_pixels_are_off_before_scheduled_start);
    RUN_TEST(test_cue_protocol_decodes_versioned_packet);
    RUN_TEST(test_status_packet_has_stable_wire_layout);
    exit(UNITY_END());
}

void loop() {}

#ifdef DAX_GLOW_HOST_TEST
int main()
{
    setup();
}
#endif
