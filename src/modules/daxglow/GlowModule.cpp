#include "configuration.h"

#if defined(DAX_GLOW) && defined(ARCH_ESP32)

#include "GlowModule.h"

#include "NodeDB.h"
#include "Router.h"
#include "concurrency/LockGuard.h"
#include "gps/RTC.h"
#include "mesh/MeshService.h"

#include <Throttle.h>
#include <algorithm>
#include <esp_timer.h>
#include <sys/time.h>

namespace
{

constexpr uint32_t STATUS_LOG_INTERVAL_MS = 5000;
#ifdef DAX_GLOW_SELF_TEST
constexpr uint8_t SELF_TEST_BRIGHTNESS = 32;
constexpr uint8_t SELF_TEST_EFFECT = 8;

daxglow::Palette defaultPalette()
{
    return {{{255, 68, 137}, {90, 232, 255}, {123, 255, 171}}};
}
#endif

} // namespace

GlowModule::GlowModule()
    : SinglePortModule("daxglow", meshtastic_PortNum_PRIVATE_APP), concurrency::OSThread("DaxGlow"),
      pixels(DAX_GLOW_PIXEL_COUNT, DAX_GLOW_DATA_PIN, NEO_GRB + NEO_KHZ800)
{
    loopbackOk = true;
    initializeOutput();
}

void GlowModule::initializeOutput()
{
    selfTestStartMs = monotonicMs();
    pixels.begin();
    pixels.clear();
    pixels.show();

    concurrency::LockGuard guard(&stateLock);
    outputInitialized = true;
    LOG_INFO("DAX Glow ready: GPIO %u, %u pixels, brightness cap %u, %u ms frames", DAX_GLOW_DATA_PIN, DAX_GLOW_PIXEL_COUNT,
             DAX_GLOW_MAX_BRIGHTNESS, daxglow::FRAME_INTERVAL_MS);
#ifdef DAX_GLOW_SELF_TEST
    LOG_INFO("DAX Glow self-test enabled: effect %u, brightness %u", SELF_TEST_EFFECT, SELF_TEST_BRIGHTNESS);
#endif
}

uint64_t GlowModule::monotonicMs() const
{
    return static_cast<uint64_t>(esp_timer_get_time()) / 1000ULL;
}

uint64_t GlowModule::glowNowMs(daxglow::ClockSource &source) const
{
    {
        concurrency::LockGuard guard(&stateLock);
        if (hostClockValid) {
            source = daxglow::ClockSource::HOST_SYNC;
            return static_cast<uint64_t>(static_cast<int64_t>(monotonicMs()) + hostClockOffsetMs);
        }
    }

    if (getRTCQuality() != RTCQualityNone) {
        struct timeval now;
        if (gettimeofday(&now, nullptr) == 0) {
            source = daxglow::ClockSource::RTC;
            return static_cast<uint64_t>(now.tv_sec) * 1000ULL + now.tv_usec / 1000ULL;
        }
    }

    source = daxglow::ClockSource::NONE;
    return 0;
}

daxglow::Cue GlowModule::activeCue(bool &hasActive) const
{
    concurrency::LockGuard guard(&stateLock);
    if (hasCue) {
        hasActive = true;
        return cue;
    }

    hasActive = false;
    daxglow::Cue selfTest;
#ifdef DAX_GLOW_SELF_TEST
    selfTest.effectId = SELF_TEST_EFFECT;
    selfTest.brightness = SELF_TEST_BRIGHTNESS;
    selfTest.palette = defaultPalette();
#endif
    selfTest.startEpochMs = selfTestStartMs;
    return selfTest;
}

void GlowModule::renderFrame(const daxglow::Cue &frameCue, uint64_t frameEpochMs)
{
    for (uint16_t pixelIndex = 0; pixelIndex < DAX_GLOW_PIXEL_COUNT; pixelIndex++) {
        const daxglow::Rgb color = daxglow::renderPixel(frameCue, pixelIndex, DAX_GLOW_PIXEL_COUNT, frameEpochMs);
        pixels.setPixelColor(pixelIndex, pixels.Color(color.red, color.green, color.blue));
    }
    pixels.show();

    concurrency::LockGuard guard(&stateLock);
    lastFrameEpochMs = frameEpochMs;
    lastFrameHash = daxglow::frameHash(frameCue, DAX_GLOW_PIXEL_COUNT, frameEpochMs);
    renderCount++;
}

int32_t GlowModule::runOnce()
{
    daxglow::ClockSource source;
    uint64_t nowEpochMs = glowNowMs(source);
    bool usingCue = false;
    daxglow::Cue frameCue = activeCue(usingCue);

    if (!usingCue)
        nowEpochMs = monotonicMs();

    const uint64_t frameEpochMs = nowEpochMs - (nowEpochMs % daxglow::FRAME_INTERVAL_MS);
    renderFrame(frameCue, frameEpochMs);

    if (!Throttle::isWithinTimespanMs(lastStatusLogMs, STATUS_LOG_INTERVAL_MS)) {
        lastStatusLogMs = millis();
        LOG_INFO("DAX Glow frame: cue=%u effect=%u epoch=%llu hash=%08x clock=%u", frameCue.cueId, frameCue.effectId,
                 static_cast<unsigned long long>(frameEpochMs), lastFrameHash, static_cast<unsigned>(source));
    }

    const uint32_t remainder = static_cast<uint32_t>(nowEpochMs % daxglow::FRAME_INTERVAL_MS);
    return remainder == 0 ? daxglow::FRAME_INTERVAL_MS : daxglow::FRAME_INTERVAL_MS - remainder;
}

void GlowModule::prepareStatusReply(uint32_t token, uint64_t sampleEpochMs, daxglow::Result result)
{
    daxglow::ClockSource source;
    const uint64_t nowEpochMs = glowNowMs(source);
    bool usingCue = false;
    const daxglow::Cue statusCue = activeCue(usingCue);
    const uint64_t effectNowMs = usingCue ? nowEpochMs : monotonicMs();
    const uint64_t effectiveSample = usingCue && sampleEpochMs ? sampleEpochMs : effectNowMs;

    daxglow::Status status;
    status.result = result;
#ifdef DAX_GLOW_SELF_TEST
    status.flags |= daxglow::StatusFlag::SELF_TEST_BUILD;
#endif
    if (usingCue)
        status.flags |= daxglow::StatusFlag::CUE_ACTIVE;
    if (source != daxglow::ClockSource::NONE)
        status.flags |= daxglow::StatusFlag::CLOCK_VALID;

    {
        concurrency::LockGuard guard(&stateLock);
        if (outputInitialized)
            status.flags |= daxglow::StatusFlag::OUTPUT_INITIALIZED;
        status.lastFrameEpochMs = lastFrameEpochMs;
        status.lastFrameHash = lastFrameHash;
        status.renderCount = renderCount;
        if (hostClockValid)
            status.clockSyncAgeMs =
                static_cast<uint32_t>(std::min<uint64_t>(monotonicMs() - hostClockSetMonotonicMs, UINT32_MAX));
    }

    status.clockSource = source;
    status.effectId = statusCue.effectId;
    status.brightness = statusCue.brightness;
    status.pixelCount = DAX_GLOW_PIXEL_COUNT;
    status.maxBrightness = DAX_GLOW_MAX_BRIGHTNESS;
    status.dataPin = DAX_GLOW_DATA_PIN;
    status.rtcQuality = static_cast<uint8_t>(getRTCQuality());
    status.token = token;
    status.cueId = statusCue.cueId;
    status.startEpochMs = statusCue.startEpochMs;
    status.nowEpochMs = nowEpochMs;
    status.sampleEpochMs = effectiveSample;
    status.sampleCueTimeMs = daxglow::cueTimeMs(statusCue, effectiveSample);
    status.sampleFrameNumber = daxglow::frameNumber(statusCue, effectiveSample);
    status.sampleFrameHash = daxglow::frameHash(statusCue, DAX_GLOW_PIXEL_COUNT, effectiveSample);

    myReply = allocDataPacket();
    myReply->decoded.payload.size =
        daxglow::encodeStatus(status, myReply->decoded.payload.bytes, sizeof(myReply->decoded.payload.bytes));
}

void GlowModule::deliverLocalStatusReply(const meshtastic_MeshPacket &request)
{
    if (request.from != 0 || !myReply)
        return;

    meshtastic_MeshPacket *reply = allocReply();
    setReplyTo(reply, request);
    service->sendToPhone(reply);
    ignoreRequest = true;
}

ProcessMessage GlowModule::handleReceived(const meshtastic_MeshPacket &mp)
{
    ignoreRequest = false;
    const uint8_t *payload = mp.decoded.payload.bytes;
    const size_t size = mp.decoded.payload.size;
    if (size < daxglow::HEADER_SIZE || payload[0] != 'G' || payload[1] != 'L' || payload[2] != 'W')
        return ProcessMessage::CONTINUE;

    const auto type = static_cast<daxglow::MessageType>(payload[4]);
    if (type == daxglow::MessageType::CUE) {
        daxglow::Cue incoming;
        daxglow::Result result = daxglow::decodeCue(payload, size, incoming);
        daxglow::ClockSource source;
        glowNowMs(source);
        if (result == daxglow::Result::OK && source == daxglow::ClockSource::NONE)
            result = daxglow::Result::CLOCK_UNAVAILABLE;
        if (result == daxglow::Result::OK && incoming.brightness > DAX_GLOW_MAX_BRIGHTNESS)
            incoming.brightness = DAX_GLOW_MAX_BRIGHTNESS;

        if (result == daxglow::Result::OK) {
            concurrency::LockGuard guard(&stateLock);
            cue = incoming;
            hasCue = true;
            LOG_INFO("DAX Glow cue accepted: id=%u effect=%u start=%llu brightness=%u", cue.cueId, cue.effectId,
                     static_cast<unsigned long long>(cue.startEpochMs), cue.brightness);
        } else {
            LOG_WARN("DAX Glow cue rejected: result=%u", static_cast<unsigned>(result));
        }
        if (mp.decoded.want_response) {
            prepareStatusReply(incoming.cueId, incoming.startEpochMs, result);
            deliverLocalStatusReply(mp);
        }
        return ProcessMessage::STOP;
    }

    if (type == daxglow::MessageType::STATUS_REQUEST) {
        daxglow::StatusRequest request;
        const daxglow::Result result = daxglow::decodeStatusRequest(payload, size, request);
        if (mp.decoded.want_response) {
            prepareStatusReply(request.token, request.sampleEpochMs, result);
            deliverLocalStatusReply(mp);
        }
        return ProcessMessage::STOP;
    }

    if (type == daxglow::MessageType::CLOCK_SYNC) {
        daxglow::ClockSyncRequest request;
        daxglow::Result result = daxglow::decodeClockSync(payload, size, request);
        if (result == daxglow::Result::OK && mp.transport_mechanism == meshtastic_MeshPacket_TransportMechanism_TRANSPORT_LORA)
            result = daxglow::Result::REMOTE_CLOCK_SYNC_DENIED;
        if (result == daxglow::Result::OK) {
            const uint64_t receivedAt = monotonicMs();
            concurrency::LockGuard guard(&stateLock);
            hostClockOffsetMs = static_cast<int64_t>(request.hostEpochMs) - static_cast<int64_t>(receivedAt);
            hostClockSetMonotonicMs = receivedAt;
            hostClockValid = true;
        }
        if (mp.decoded.want_response) {
            prepareStatusReply(request.token, request.hostEpochMs, result);
            deliverLocalStatusReply(mp);
        }
        return ProcessMessage::STOP;
    }

    return ProcessMessage::CONTINUE;
}

#endif
