#pragma once

#include <cstddef>
#include <cstdint>

namespace daxglow
{

constexpr uint8_t CORE_EFFECT_COUNT = 10;
constexpr uint32_t FRAME_INTERVAL_MS = 40;

struct Rgb {
    uint8_t red;
    uint8_t green;
    uint8_t blue;

    bool operator==(const Rgb &other) const { return red == other.red && green == other.green && blue == other.blue; }
};

struct Palette {
    Rgb colors[3];
};

struct EffectSample {
    Rgb color;
    double intensity;
};

struct Cue {
    uint32_t cueId = 0;
    uint64_t startEpochMs = 0;
    uint8_t effectId = 0;
    uint8_t brightness = 0;
    Palette palette = {};
};

bool isSupportedEffect(uint8_t effectId);
EffectSample sampleEffect(uint8_t effectId, uint16_t pixelIndex, uint16_t pixelCount, uint32_t cueTimeMs, const Palette &palette);
Rgb renderPixel(const Cue &cue, uint16_t pixelIndex, uint16_t pixelCount, uint64_t sampleEpochMs);
uint32_t frameHash(const Cue &cue, uint16_t pixelCount, uint64_t sampleEpochMs);
uint32_t cueTimeMs(const Cue &cue, uint64_t sampleEpochMs);
uint32_t frameNumber(const Cue &cue, uint64_t sampleEpochMs);

} // namespace daxglow
