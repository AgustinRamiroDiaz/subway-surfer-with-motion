export type MediaPipeProfileSample = {
  frameId: number;
  captureStartedAtMs: number;
  captureDoneAtMs: number;
  workerResultAtMs: number | null;
  drawDoneAtMs: number | null;
  inferenceMs: number | null;
  handCount: number | null;
};

export type MediaPipeProfileSnapshot = {
  startedAtMs: number;
  capturedAtMs: number;
  samples: MediaPipeProfileSample[];
};

type ProfileApi = {
  reset: () => void;
  getSnapshot: () => MediaPipeProfileSnapshot;
};

declare global {
  interface Window {
    __mediaPipeGestureProfile?: ProfileApi;
  }
}

const enabled = new URLSearchParams(window.location.search).get('profile') === '1';
let startedAtMs = performance.now();
let samples: MediaPipeProfileSample[] = [];

function reset(): void {
  startedAtMs = performance.now();
  samples = [];
}

function getSnapshot(): MediaPipeProfileSnapshot {
  return {
    startedAtMs,
    capturedAtMs: performance.now(),
    samples: samples.map((sample) => ({ ...sample })),
  };
}

if (enabled) window.__mediaPipeGestureProfile = { reset, getSnapshot };

export function recordCapture(frameId: number, captureStartedAtMs: number, captureDoneAtMs: number): void {
  if (!enabled) return;
  samples.push({
    frameId,
    captureStartedAtMs,
    captureDoneAtMs,
    workerResultAtMs: null,
    drawDoneAtMs: null,
    inferenceMs: null,
    handCount: null,
  });
  if (samples.length > 4_000) samples.shift();
}

export function recordResult(
  frameId: number,
  workerResultAtMs: number,
  drawDoneAtMs: number,
  inferenceMs: number,
  handCount: number
): void {
  if (!enabled) return;
  const sample = samples.findLast((candidate) => candidate.frameId === frameId);
  if (!sample) return;
  sample.workerResultAtMs = workerResultAtMs;
  sample.drawDoneAtMs = drawDoneAtMs;
  sample.inferenceMs = inferenceMs;
  sample.handCount = handCount;
}
