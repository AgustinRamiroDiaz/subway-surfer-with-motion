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

## Three.js versus native Canvas 2D

Hand Rhythm now has two selectable visual renderers. Gameplay produces one renderer-neutral visual
state containing the detected hands, targets, target depth, and judgment feedback. Each renderer
derives the same active cells from that shared hand state.
The existing Three.js scene and the native Canvas 2D scene consume that same state, so changing the
renderer does not change MediaPipe, the music clock, spawning, target judgment, or scoring.

Two five-second real-GPU comparisons were captured on August 29, 2026. The second comparison
reversed the renderer order to expose warm-up or ordering bias. Both comparisons used the same
hardware and settings as the slider benchmark: production Chrome, AMD Radeon 680M, MediaPipe Lite
with the GPU delegate, one player, hidden camera/detection overlays, a 60 FPS render cap, five-second
warm-up, and deterministic fake-camera hands. Every detector frame contained hands.

| Metric | Three.js 3D range | Canvas 2D range | Result across both orders |
| --- | ---: | ---: | --- |
| Detector throughput | 14.58–14.59 FPS | 14.79–14.82 FPS | Canvas +1.4% to +1.7% |
| MediaPipe inference p50 | 16.6–17.7 ms | 16.9–17.9 ms | Canvas 1.1% to 1.8% slower |
| MediaPipe inference p95 | 21.6–24.6 ms | 21.6–23.7 ms | Canvas 0% to 3.7% lower |
| Input-to-render p50 | 27.2–32.2 ms | 31.2 ms | Direction changed with run order |
| Input-to-render p95 | 33.6–39.4 ms | 37.0–37.8 ms | Direction changed with run order |
| Render CPU p50 | 1.2–1.3 ms | 0.1 ms | Canvas 91.7% to 92.3% lower |
| Render CPU p95 | 1.8–1.9 ms | 0.2 ms | Canvas 88.9% to 89.5% lower |
| Average process-tree CPU | 1.06 cores | 0.88–0.89 cores | Canvas 16.3% to 17.0% lower |

The repeatable result is that Canvas 2D makes renderer submission much cheaper and reduces total
CPU use. It does not make MediaPipe inference materially faster at 60 FPS: the small p50 and p95
differences are mixed and within short-run variation. Input-to-render latency also changed direction
when the order was reversed, so these trials do not establish a latency win for either renderer.

The normal application starts with camera imagery visible, so the same forward/reverse pair was
also run with the camera overlay enabled. This adds a per-frame video texture in Three.js and a
per-frame `drawImage` in Canvas 2D:

| Metric | Three.js 3D range | Canvas 2D range | Canvas result across both orders |
| --- | ---: | ---: | --- |
| Detector throughput | 14.74–14.87 FPS | 14.86–14.89 FPS | -0.0% to +1.0% |
| MediaPipe inference p50 | 18.3–18.5 ms | 16.3–17.7 ms | 3.3% to 11.9% lower |
| MediaPipe inference p95 | 22.9–23.3 ms | 20.1–21.1 ms | 9.4% to 12.2% lower |
| Input-to-render p50 | 27.2–32.0 ms | 26.2–31.0 ms | 3.1% to 3.7% lower |
| Input-to-render p95 | 34.5–39.7 ms | 32.1–37.3 ms | Direction changed with run order |
| Render CPU p50 | 1.4–1.7 ms | 0.2 ms | 85.7% to 88.2% lower |
| Render CPU p95 | 1.9–2.4 ms | 0.4 ms | 78.9% to 83.3% lower |
| Average process-tree CPU | 1.07–1.13 cores | 0.87–0.90 cores | 19.3% to 20.3% lower |

With visible camera imagery, Canvas produced a repeatable, though modest, MediaPipe improvement in
both run orders. This suggests that the Three.js video-texture path adds meaningful shared resource
pressure beyond scene submission itself. It is still not evidence of GPU scheduling priority or a
direct GPU-queue measurement, and longer trials are needed before treating the exact percentages as
a release guarantee.

MediaPipe model inference remains the largest measured pipeline stage in both modes, at roughly
17 ms p50 and 22–24 ms p95. Waiting for the next permitted render is second, at roughly 10 ms p50
and 15–18 ms p95. Renderer CPU is third in Three.js and becomes negligible in Canvas 2D.

The CPU profile also identifies repeated Three.js texture uploads (`texSubImage2D`) as the largest
named renderer-specific browser operation in the first run. Hand gesture emoji canvases are updated
and marked for upload during visual updates even while their gesture is unchanged. Caching unchanged
gesture textures is therefore a concrete Three.js optimization to test next, alongside reducing
shadow, material, and scene traversal work. This texture-upload observation concerns CPU profile
self-time; it does not by itself measure GPU queue occupancy.

Run one comparison with:

```bash
PROFILE_DURATION_MS=30000 PROFILE_WARMUP_MS=5000 PROFILE_REAL_GPU=true \
PROFILE_HEADLESS=false PROFILE_COMPARISON_OUTPUT_DIR=profile-results-renderers \
pnpm profile:hand-rhythm-renderers
```

Add `PROFILE_SHOW_CAMERA_PREVIEW=true` to measure the normal camera-visible presentation instead of
the isolated game-geometry presentation.

Reverse the order for a second comparison:

```bash
PROFILE_DURATION_MS=30000 PROFILE_WARMUP_MS=5000 PROFILE_REAL_GPU=true \
PROFILE_HEADLESS=false PROFILE_RENDERER_ORDER=canvas2d,three \
PROFILE_COMPARISON_OUTPUT_DIR=profile-results-renderers-reverse \
pnpm profile:hand-rhythm-renderers
```

Each command produces one artifact directory per renderer plus `comparison.json` and
`comparison.md`. The profiler verifies the requested renderer in the running scene, continues to
set rendering FPS through the visible slider, and does not use game hits or misses as assertions.
