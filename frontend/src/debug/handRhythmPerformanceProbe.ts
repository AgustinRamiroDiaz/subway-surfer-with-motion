import type { ModelPredictionTimings } from '../pose-detection/detectionSchema';

const PROBE_QUERY_PARAMETER = 'handRhythmPerformanceProbe';
const MAX_SAMPLES = 4_000;
const probeEnabled = new URLSearchParams(window.location.search).get(PROBE_QUERY_PARAMETER) === '1';

export type HandRhythmPerformanceSample = {
  frameId: string;
  mediaTimeMs: number | null;
  presentedFrames: number | null;
  expectedDisplayTimeMs: number | null;
  videoCallbackAtMs: number;
  captureStartedAtMs: number;
  captureDoneAtMs: number;
  detectorDoneAtMs: number | null;
  mappingDoneAtMs: number | null;
  overlayDoneAtMs: number | null;
  renderStartedAtMs: number | null;
  renderSubmittedAtMs: number | null;
  detectionCount: number | null;
  handCount: number | null;
  detectorTimings: ModelPredictionTimings | null;
};

export type HandRhythmRenderSample = {
  frameStartedAtMs: number;
  frameIntervalMs: number | null;
  renderStartedAtMs: number;
  renderSubmittedAtMs: number;
  renderCpuMs: number;
  inputFrameId: string | null;
};

export type HandRhythmPerformanceSnapshot = {
  startedAtMs: number;
  capturedAtMs: number;
  samples: HandRhythmPerformanceSample[];
  renderFrames: HandRhythmRenderSample[];
};

type CameraFrameTiming = {
  mediaTimeMs: number | null;
  presentedFrames: number | null;
  expectedDisplayTimeMs: number | null;
  videoCallbackAtMs: number;
};

type ProbeApi = {
  reset: () => void;
  getSnapshot: () => HandRhythmPerformanceSnapshot;
};

declare global {
  interface Window {
    __handRhythmPerformanceProbe?: ProbeApi;
  }
}

let startedAtMs = performance.now();
let samples: HandRhythmPerformanceSample[] = [];
let renderFrames: HandRhythmRenderSample[] = [];
let lastRenderFrameAtMs: number | null = null;

function snapshot(): HandRhythmPerformanceSnapshot {
  return {
    startedAtMs,
    capturedAtMs: performance.now(),
    samples: samples.map((sample) => ({
      ...sample,
      detectorTimings: sample.detectorTimings ? { ...sample.detectorTimings } : null,
    })),
    renderFrames: renderFrames.map((frame) => ({ ...frame })),
  };
}

function reset(): void {
  startedAtMs = performance.now();
  samples = [];
  renderFrames = [];
  lastRenderFrameAtMs = null;
}

function ensureApi(): void {
  if (!probeEnabled || window.__handRhythmPerformanceProbe) return;
  window.__handRhythmPerformanceProbe = { reset, getSnapshot: snapshot };
}

export function recordCameraFrame(
  frameId: string,
  cameraTiming: CameraFrameTiming | null,
  captureStartedAtMs: number,
  captureDoneAtMs: number
): void {
  if (!probeEnabled) return;
  ensureApi();
  samples.push({
    frameId,
    mediaTimeMs: cameraTiming?.mediaTimeMs ?? null,
    presentedFrames: cameraTiming?.presentedFrames ?? null,
    expectedDisplayTimeMs: cameraTiming?.expectedDisplayTimeMs ?? null,
    videoCallbackAtMs: cameraTiming?.videoCallbackAtMs ?? captureStartedAtMs,
    captureStartedAtMs,
    captureDoneAtMs,
    detectorDoneAtMs: null,
    mappingDoneAtMs: null,
    overlayDoneAtMs: null,
    renderStartedAtMs: null,
    renderSubmittedAtMs: null,
    detectionCount: null,
    handCount: null,
    detectorTimings: null,
  });
  if (samples.length > MAX_SAMPLES) samples.shift();
}

export function recordMappedDetectorResult(
  frameId: string,
  detectorDoneAtMs: number,
  mappingDoneAtMs: number,
  overlayDoneAtMs: number,
  detectionCount: number,
  handCount: number,
  detectorTimings: ModelPredictionTimings
): void {
  if (!probeEnabled) return;
  const sample = samples.findLast((candidate) => candidate.frameId === frameId);
  if (!sample) return;
  sample.detectorDoneAtMs = detectorDoneAtMs;
  sample.mappingDoneAtMs = mappingDoneAtMs;
  sample.overlayDoneAtMs = overlayDoneAtMs;
  sample.detectionCount = detectionCount;
  sample.handCount = handCount;
  sample.detectorTimings = { ...detectorTimings };
}

export function recordHandRhythmRender(
  frameStartedAtMs: number,
  renderStartedAtMs: number,
  renderSubmittedAtMs: number
): void {
  if (!probeEnabled) return;
  ensureApi();
  const inputSample = samples.findLast((sample) =>
    sample.mappingDoneAtMs !== null && sample.renderSubmittedAtMs === null
  );
  if (inputSample) {
    inputSample.renderStartedAtMs = renderStartedAtMs;
    inputSample.renderSubmittedAtMs = renderSubmittedAtMs;
  }
  renderFrames.push({
    frameStartedAtMs,
    frameIntervalMs: lastRenderFrameAtMs === null ? null : frameStartedAtMs - lastRenderFrameAtMs,
    renderStartedAtMs,
    renderSubmittedAtMs,
    renderCpuMs: renderSubmittedAtMs - renderStartedAtMs,
    inputFrameId: inputSample?.frameId ?? null,
  });
  lastRenderFrameAtMs = frameStartedAtMs;
  if (renderFrames.length > MAX_SAMPLES) renderFrames.shift();
}
