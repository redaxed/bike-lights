#pragma once

#include "configuration.h"

#if defined(DAX_GLOW) && defined(ARCH_ESP32)

#include "GlowEffect.h"
#include "GlowProtocol.h"
#include "SinglePortModule.h"
#include "concurrency/Lock.h"
#include "concurrency/OSThread.h"

#include <Adafruit_NeoPixel.h>

#ifndef DAX_GLOW_DATA_PIN
#define DAX_GLOW_DATA_PIN 16
#endif

#ifndef DAX_GLOW_PIXEL_COUNT
#define DAX_GLOW_PIXEL_COUNT 200
#endif

#ifndef DAX_GLOW_MAX_BRIGHTNESS
#define DAX_GLOW_MAX_BRIGHTNESS 64
#endif

class GlowModule : public SinglePortModule, private concurrency::OSThread
{
  public:
    GlowModule();
    void setup() override;

  protected:
    ProcessMessage handleReceived(const meshtastic_MeshPacket &mp) override;
    int32_t runOnce() override;

  private:
    uint64_t monotonicMs() const;
    uint64_t glowNowMs(daxglow::ClockSource &source) const;
    daxglow::Cue activeCue(bool &hasActiveCue) const;
    void prepareStatusReply(uint32_t token, uint64_t sampleEpochMs, daxglow::Result result);
    void deliverLocalStatusReply(const meshtastic_MeshPacket &request);
    void renderFrame(const daxglow::Cue &cue, uint64_t frameEpochMs);

    mutable concurrency::Lock stateLock;
    Adafruit_NeoPixel pixels;
    daxglow::Cue cue = {};
    bool hasCue = false;
    bool outputInitialized = false;
    bool hostClockValid = false;
    int64_t hostClockOffsetMs = 0;
    uint64_t hostClockSetMonotonicMs = 0;
    uint64_t lastFrameEpochMs = 0;
    uint32_t lastFrameHash = 0;
    uint32_t renderCount = 0;
    uint32_t lastStatusLogMs = 0;
    uint64_t selfTestStartMs = 0;
};

#endif
