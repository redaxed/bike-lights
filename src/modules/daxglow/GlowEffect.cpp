#include "GlowEffect.h"

#include <algorithm>
#include <cmath>

namespace daxglow
{
namespace
{

constexpr uint32_t EFFECT_PERIODS_MS[CORE_EFFECT_COUNT] = {0, 0, 3100, 1700, 7143, 1050, 2400, 1800, 720, 5760};

double positiveModulo(double value, double divisor)
{
    return std::fmod(std::fmod(value, divisor) + divisor, divisor);
}

uint32_t positiveModulo(int64_t value, uint32_t divisor)
{
    const int64_t result = value % divisor;
    return static_cast<uint32_t>(result < 0 ? result + divisor : result);
}

double normalizedPhase(uint32_t cueTime, uint32_t period)
{
    return static_cast<double>(cueTime % period) / period;
}

const Rgb &paletteColor(const Palette &palette, int64_t index)
{
    return palette.colors[positiveModulo(index, 3)];
}

uint32_t hash32(uint32_t value)
{
    value ^= value >> 16;
    value *= 0x7feb352dU;
    value ^= value >> 15;
    value *= 0x846ca68bU;
    value ^= value >> 16;
    return value;
}

double clampUnit(double value)
{
    return std::max(0.0, std::min(1.0, value));
}

Rgb hsvToRgb(double hue, double saturation, double value)
{
    const double normalizedHue = positiveModulo(hue, 1.0);
    const double sector = normalizedHue * 6.0;
    const double chroma = value * saturation;
    const double secondary = chroma * (1.0 - std::abs(positiveModulo(sector, 2.0) - 1.0));
    double red = 0;
    double green = 0;
    double blue = 0;

    if (sector < 1) {
        red = chroma;
        green = secondary;
    } else if (sector < 2) {
        red = secondary;
        green = chroma;
    } else if (sector < 3) {
        green = chroma;
        blue = secondary;
    } else if (sector < 4) {
        green = secondary;
        blue = chroma;
    } else if (sector < 5) {
        red = secondary;
        blue = chroma;
    } else {
        red = chroma;
        blue = secondary;
    }

    const double match = value - chroma;
    return {static_cast<uint8_t>(std::round((red + match) * 255.0)), static_cast<uint8_t>(std::round((green + match) * 255.0)),
            static_cast<uint8_t>(std::round((blue + match) * 255.0))};
}

double twinkleNoise(uint16_t pixelIndex, uint32_t frame)
{
    const uint32_t seed = static_cast<uint32_t>(pixelIndex + 1) * 0x9e3779b1U + (frame + 1) * 0x85ebca6bU;
    return static_cast<double>(hash32(seed)) / 0xffffffffU;
}

uint8_t scaleChannel(uint8_t channel, double intensity, uint8_t brightness)
{
    const double scaled = channel * clampUnit(intensity) * brightness / 255.0;
    return static_cast<uint8_t>(std::round(clampUnit(scaled / 255.0) * 255.0));
}

void hashByte(uint32_t &hash, uint8_t value)
{
    hash ^= value;
    hash *= 16777619U;
}

} // namespace

bool isSupportedEffect(uint8_t effectId)
{
    return effectId < CORE_EFFECT_COUNT;
}

EffectSample sampleEffect(uint8_t effectId, uint16_t pixelIndex, uint16_t pixelCount, uint32_t cueTime, const Palette &palette)
{
    if (!isSupportedEffect(effectId) || pixelCount == 0 || pixelIndex >= pixelCount)
        return {{0, 0, 0}, 0};

    Rgb color = palette.colors[0];
    double intensity = 1.0;

    switch (effectId) {
    case 0:
        intensity = 0;
        break;
    case 1:
        break;
    case 2: {
        const double phase = normalizedPhase(cueTime, EFFECT_PERIODS_MS[2]);
        const double fill = phase < 0.78 ? phase / 0.78 : (1.0 - phase) / 0.22;
        const double edge = fill * (pixelCount + 3) - 1.5;
        color = paletteColor(palette, cueTime / EFFECT_PERIODS_MS[2]);
        intensity = pixelIndex <= edge ? 1.0 : 0.03;
        break;
    }
    case 3: {
        const double head = normalizedPhase(cueTime, EFFECT_PERIODS_MS[3]) * pixelCount;
        const double distance = positiveModulo(head - pixelIndex, pixelCount);
        color = paletteColor(palette, static_cast<uint32_t>((static_cast<double>(pixelIndex) / pixelCount) * 3));
        intensity = distance < pixelCount * 0.52 ? std::exp(-distance * 0.3) : 0.025;
        break;
    }
    case 4:
        color = hsvToRgb(static_cast<double>(pixelIndex) / pixelCount - cueTime * 0.00014, 0.82, 1.0);
        break;
    case 5: {
        const uint32_t cycle = cueTime % EFFECT_PERIODS_MS[5];
        const bool flash = cycle < 75 || (cycle > 160 && cycle < 235) || (cycle > 320 && cycle < 395);
        color = flash ? Rgb{255, 255, 255} : palette.colors[0];
        intensity = flash ? 1.0 : 0.055;
        break;
    }
    case 6: {
        const double phase = normalizedPhase(cueTime, EFFECT_PERIODS_MS[6]);
        const double triangle = 1.0 - std::abs(phase * 2.0 - 1.0);
        const double eased = triangle * triangle * (3.0 - 2.0 * triangle);
        color = paletteColor(palette, cueTime / EFFECT_PERIODS_MS[6]);
        intensity = 0.1 + eased * 0.9;
        break;
    }
    case 7: {
        const double phase = normalizedPhase(cueTime, EFFECT_PERIODS_MS[7]);
        const double head = (1.0 - std::abs(phase * 2.0 - 1.0)) * (pixelCount - 1);
        const double distance = std::abs(pixelIndex - head);
        const double falloff = 1.0 - std::min(1.0, distance / 5.0);
        color = paletteColor(palette, cueTime / EFFECT_PERIODS_MS[7]);
        intensity = std::max(0.025, falloff * falloff);
        break;
    }
    case 8: {
        const uint32_t step = cueTime / 120;
        const uint32_t position = positiveModulo(static_cast<int64_t>(pixelIndex) - step, 6);
        color = paletteColor(palette, static_cast<int64_t>(std::floor((static_cast<double>(pixelIndex) - step) / 3.0)));
        intensity = position < 3 ? 1.0 : 0.035;
        break;
    }
    case 9: {
        const uint32_t frame = cueTime / 90;
        const double noise = twinkleNoise(pixelIndex, frame);
        const uint32_t colorSeed = hash32(static_cast<uint32_t>(pixelIndex + 1) * 0x27d4eb2dU ^ (frame + 1));
        color = paletteColor(palette, colorSeed);
        intensity = noise > 0.83 ? 0.55 + ((noise - 0.83) / 0.17) * 0.45 : 0.035;
        break;
    }
    default:
        break;
    }

    return {color, intensity};
}

uint32_t cueTimeMs(const Cue &cue, uint64_t sampleEpochMs)
{
    if (sampleEpochMs <= cue.startEpochMs)
        return 0;

    return static_cast<uint32_t>(std::min<uint64_t>(sampleEpochMs - cue.startEpochMs, UINT32_MAX));
}

uint32_t frameNumber(const Cue &cue, uint64_t sampleEpochMs)
{
    return cueTimeMs(cue, sampleEpochMs) / FRAME_INTERVAL_MS;
}

Rgb renderPixel(const Cue &cue, uint16_t pixelIndex, uint16_t pixelCount, uint64_t sampleEpochMs)
{
    if (sampleEpochMs < cue.startEpochMs)
        return {0, 0, 0};

    const uint32_t sampleTime = frameNumber(cue, sampleEpochMs) * FRAME_INTERVAL_MS;
    const EffectSample sample = sampleEffect(cue.effectId, pixelIndex, pixelCount, sampleTime, cue.palette);
    return {scaleChannel(sample.color.red, sample.intensity, cue.brightness),
            scaleChannel(sample.color.green, sample.intensity, cue.brightness),
            scaleChannel(sample.color.blue, sample.intensity, cue.brightness)};
}

uint32_t frameHash(const Cue &cue, uint16_t pixelCount, uint64_t sampleEpochMs)
{
    uint32_t hash = 2166136261U;
    for (uint16_t pixelIndex = 0; pixelIndex < pixelCount; pixelIndex++) {
        const Rgb pixel = renderPixel(cue, pixelIndex, pixelCount, sampleEpochMs);
        hashByte(hash, pixel.red);
        hashByte(hash, pixel.green);
        hashByte(hash, pixel.blue);
    }
    return hash;
}

} // namespace daxglow
