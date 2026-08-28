# Hand Rhythm performance findings

This document records the current end-to-end Hand Rhythm benchmark and the effect of changing the
game render rate through the in-app slider. The benchmark measures performance only. It does not
score whether synthetic hands hit or miss rhythm targets.

## Benchmark scope

The measured path is:

1. Chromium reads a deterministic fake-camera video containing hands.
2. MediaPipe Gesture Recognizer processes camera frames in its worker.
3. The app maps detector output into game input.
4. The Hand Rhythm scene consumes that input and submits a rendered frame.

The performance probe records detector throughput, inference time, camera-to-render latency,
render cadence, render CPU time, and operating-system process and thread resource usage.

## Slider-controlled comparison

The comparison was captured on August 28, 2026 with these fixed conditions:

- Production build in Google Chrome with hardware acceleration enabled.
- AMD Radeon 680M through ANGLE/OpenGL and Mesa 25.2.8.
- MediaPipe Lite model with the GPU delegate.
- One Hand Rhythm player, with camera preview and detection overlay hidden.
- The same deterministic generated hand-video fixture.
- Five-second warm-up followed by a five-second profiling window.
- The render rate was applied exclusively through the visible app slider and verified before
  warm-up. Detector configuration and frequency were unchanged between runs.

The actual render rate is derived from submitted render frames divided by the probe duration.

| Metric | Slider at 60 FPS | Slider at 15 FPS | Change at 15 FPS |
| --- | ---: | ---: | ---: |
| Actual render rate | 58.65 FPS | 14.70 FPS | -74.9% |
| Detector throughput | 14.83 FPS | 14.86 FPS | +0.2% |
| MediaPipe inference p50 | 15.3 ms | 11.9 ms | -22.2% |
| MediaPipe inference p95 | 21.1 ms | 14.6 ms | -30.8% |
| Input-to-render latency p50 | 31.8 ms | 50.1 ms | +57.5% |
| Input-to-render latency p95 | 35.8 ms | 51.3 ms | +43.3% |
| Average process-tree CPU use | 1.03 cores | 0.69 cores | -33.6% |

Both runs detected hands in every processed camera frame. Detector throughput remained effectively
constant at approximately 14.8 FPS, confirming that changing the render slider does not throttle
the detector loop.

## Comparison with the earlier controlled runs

The earlier pair configured the render cap through the benchmark setup rather than through the
visible control. The important relative effects reproduced:

| Effect of 15 FPS relative to 60 FPS | Earlier setup | Current UI slider |
| --- | ---: | ---: |
| Detector throughput | -0.2% | +0.2% |
| MediaPipe inference p50 | -20.6% | -22.2% |
| MediaPipe inference p95 | -15.2% | -30.8% |
| Input-to-render latency p50 | +40.6% | +57.5% |
| Input-to-render latency p95 | +78.8% | +43.3% |
| Average process-tree CPU use | -29.0% | -33.6% |

Absolute latency percentiles vary between short profiling windows, but the direction and approximate
size of the main effects are consistent. In particular, median MediaPipe inference improved by
about 21–22%, detector throughput stayed flat, and total CPU use fell by about 29–34% at the lower
render rate.

## Interpretation

At 60 FPS, MediaPipe model inference is the largest measured pipeline stage. At 15 FPS, model
inference becomes faster, but waiting for the next visual update becomes the largest contributor to
camera-to-display latency.

The result supports the resource-contention hypothesis: submitting fewer Three.js frames leaves
more CPU/GPU capacity available and MediaPipe inference completes faster. The profiles do not
directly measure GPU queue occupancy or prove a particular browser scheduling mechanism, so this
should not be described as proof that Three.js alone blocks or starves MediaPipe.

The practical tradeoff is:

- Lower render rates reduce resource use and improve model inference time.
- Detector throughput is independent of the render-rate control.
- Very low render rates increase visible input latency because completed detections wait longer for
  the next rendered frame.
- A 60 FPS default is a better latency/visual-smoothness balance than 15 FPS on the measured system,
  while the slider remains useful for testing slower hardware.

## Reproducing the comparison

Run both commands on the same machine with no other GPU-heavy workload:

```bash
PROFILE_PORT=5183 PROFILE_DURATION_MS=5000 PROFILE_WARMUP_MS=5000 \
PROFILE_REAL_GPU=true PROFILE_HEADLESS=false PROFILE_RENDER_FPS=60 \
PROFILE_OUTPUT_DIR=profile-results-ui-slider-60 pnpm test:e2e:performance

PROFILE_PORT=5183 PROFILE_SKIP_BUILD=true PROFILE_DURATION_MS=5000 PROFILE_WARMUP_MS=5000 \
PROFILE_REAL_GPU=true PROFILE_HEADLESS=false PROFILE_RENDER_FPS=15 \
PROFILE_OUTPUT_DIR=profile-results-ui-slider-15 pnpm test:e2e:performance
```

The profiler starts from the app's normal default, moves the visible slider with keyboard input,
verifies the selected value, and records `renderFpsControlMethod: "ui-slider-keyboard"` in each
summary. Generated `profile-results*` directories are intentionally ignored by Git because their
trace and heap artifacts are large.

For more stable release criteria, use at least a 30-second measurement window and repeat each
configuration several times. Compare medians across runs rather than treating one short trace as a
permanent hardware-independent result.
