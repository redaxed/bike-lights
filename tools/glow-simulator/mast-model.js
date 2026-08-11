(function attachGlowMastModel(root) {
  const TAU = Math.PI * 2;
  const HEIGHT_M = 1.58;
  const LEDS_PER_M = 60;
  const SPIRAL_LED_COUNT = 200;
  const SPIRAL_RADIUS_M = 0.0125;

  function calculateHelix(stripLengthM, heightM, radiusM) {
    const circumferentialTravelM = Math.sqrt(
      Math.max(0, stripLengthM ** 2 - heightM ** 2),
    );
    const turns = circumferentialTravelM / (TAU * radiusM);
    return {
      turns,
      pitchM: turns > 0 ? heightM / turns : heightM,
    };
  }

  const spiralLengthM = SPIRAL_LED_COUNT / LEDS_PER_M;
  const spiralGeometry = calculateHelix(
    spiralLengthM,
    HEIGHT_M,
    SPIRAL_RADIUS_M,
  );

  const profiles = Object.freeze({
    straight: Object.freeze({
      id: "straight",
      label: "Straight strip",
      shortLabel: "Straight",
      ledCount: Math.round(HEIGHT_M * LEDS_PER_M),
      stripLengthM: HEIGHT_M,
      heightM: HEIGHT_M,
      helixRadiusM: 0,
      turns: 0,
      pitchM: 0,
      diffuser: "none",
      outerRadiusM: 0.006,
    }),
    spiral: Object.freeze({
      id: "spiral",
      label: "Bare spiral",
      shortLabel: "Bare spiral",
      ledCount: SPIRAL_LED_COUNT,
      stripLengthM: spiralLengthM,
      heightM: HEIGHT_M,
      helixRadiusM: SPIRAL_RADIUS_M,
      turns: spiralGeometry.turns,
      pitchM: spiralGeometry.pitchM,
      diffuser: "none",
      outerRadiusM: SPIRAL_RADIUS_M,
    }),
    opal: Object.freeze({
      id: "opal",
      label: "Spiral + opal",
      shortLabel: "Opal spiral",
      ledCount: SPIRAL_LED_COUNT,
      stripLengthM: spiralLengthM,
      heightM: HEIGHT_M,
      helixRadiusM: SPIRAL_RADIUS_M,
      turns: spiralGeometry.turns,
      pitchM: spiralGeometry.pitchM,
      diffuser: "opal",
      outerRadiusM: 0.02,
      innerRadiusM: 0.017,
      transmission: 0.58,
      backContribution: 0.58,
      longitudinalBlurM: 0.012,
    }),
    noodle: Object.freeze({
      id: "noodle",
      label: "Spiral + pool noodle",
      shortLabel: "Pool noodle",
      ledCount: SPIRAL_LED_COUNT,
      stripLengthM: spiralLengthM,
      heightM: HEIGHT_M,
      helixRadiusM: SPIRAL_RADIUS_M,
      turns: spiralGeometry.turns,
      pitchM: spiralGeometry.pitchM,
      diffuser: "foam",
      outerRadiusM: 0.0325,
      innerRadiusM: 0.0225,
      transmission: 0.18,
      backContribution: 0.4,
      longitudinalBlurM: 0.018,
    }),
  });

  const foamPresets = Object.freeze({
    white: Object.freeze({
      id: "white",
      label: "White foam",
      baseRgb: Object.freeze([226, 222, 211]),
      transmissionRgb: Object.freeze([0.18, 0.18, 0.18]),
      transmission: 0.18,
      backContribution: 0.4,
    }),
    natural: Object.freeze({
      id: "natural",
      label: "Natural / translucent",
      baseRgb: Object.freeze([218, 207, 184]),
      transmissionRgb: Object.freeze([0.28, 0.28, 0.28]),
      transmission: 0.28,
      backContribution: 0.45,
    }),
    red: Object.freeze({
      id: "red",
      label: "Red foam",
      baseRgb: Object.freeze([181, 43, 52]),
      transmissionRgb: Object.freeze([0.2, 0.03, 0.03]),
      transmission: 0.2,
      backContribution: 0.25,
    }),
    green: Object.freeze({
      id: "green",
      label: "Green foam",
      baseRgb: Object.freeze([56, 165, 83]),
      transmissionRgb: Object.freeze([0.03, 0.18, 0.03]),
      transmission: 0.18,
      backContribution: 0.25,
    }),
    blue: Object.freeze({
      id: "blue",
      label: "Blue foam",
      baseRgb: Object.freeze([44, 101, 190]),
      transmissionRgb: Object.freeze([0.03, 0.05, 0.18]),
      transmission: 0.18,
      backContribution: 0.25,
    }),
  });

  function profile(mode) {
    return profiles[mode] ?? profiles.noodle;
  }

  function foamPreset(id) {
    return foamPresets[id] ?? foamPresets.white;
  }

  function ledPoint(mode, index, count = profile(mode).ledCount) {
    const selected = profile(mode);
    const progress = count > 1 ? index / (count - 1) : 0;
    if (mode === "straight") {
      return {
        progress,
        heightM: progress * selected.heightM,
        angle: -Math.PI / 2,
        xM: 0,
        zM: -0.025,
      };
    }

    const angle = -Math.PI / 2 + progress * selected.turns * TAU;
    return {
      progress,
      heightM: progress * selected.heightM,
      angle,
      xM: Math.cos(angle) * selected.helixRadiusM,
      zM: Math.sin(angle) * selected.helixRadiusM,
    };
  }

  function renderSampleCount(mode, depthM) {
    const selected = profile(mode);
    if (selected.diffuser !== "none") {
      if (depthM > 25) return 24;
      if (depthM > 12) return 40;
      return 64;
    }
    if (depthM > 25) return 32;
    if (depthM > 12) return mode === "straight" ? 48 : 72;
    return selected.ledCount;
  }

  function physicalIndex(sampleIndex, sampleCount, ledCount) {
    if (sampleCount <= 1 || ledCount <= 1) return 0;
    return Math.round((sampleIndex / (sampleCount - 1)) * (ledCount - 1));
  }

  function applyFoamTransmission(rgb, presetId, transmission) {
    const selected = foamPreset(presetId);
    const gain = transmission / selected.transmission;
    return rgb.map((channel, index) =>
      Math.max(
        0,
        Math.min(255, channel * selected.transmissionRgb[index] * gain),
      ),
    );
  }

  root.glowMastModel = Object.freeze({
    HEIGHT_M,
    LEDS_PER_M,
    TAU,
    applyFoamTransmission,
    calculateHelix,
    foamPreset,
    foamPresets,
    ledPoint,
    physicalIndex,
    profile,
    profiles,
    renderSampleCount,
  });
})(globalThis);
