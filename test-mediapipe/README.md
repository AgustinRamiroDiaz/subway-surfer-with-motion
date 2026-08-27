# MediaPipe Gesture Recognizer profiling sample

This folder is a focused copy of the official MediaPipe Tasks Web Gesture Recognizer example:

- Demo: https://google-ai-edge.github.io/mediapipe-samples-web/#/vision/gesture_recognizer
- Source: https://github.com/google-ai-edge/mediapipe-samples-web

The copied files retain their Apache-2.0 headers and license. Local modifications remove the other
task routes and add an opt-in profiling probe for bitmap capture, worker inference, message/drawing
overhead, and total camera-frame processing time.

Run the sample with `pnpm --filter @webcam-motion-games/test-mediapipe dev`. Run its fake-camera
profile from the repository root with `pnpm profile:mediapipe`.

The profiler writes `summary.json`, raw frame samples, a Chromium CPU profile, and a final screenshot
to `profile-results-mediapipe/`. Set `MEDIAPIPE_PROFILE_REAL_GPU=true` and
`MEDIAPIPE_PROFILE_HEADLESS=false` for representative hardware-GPU results; the default headless run
is a software-rendered CI baseline. Duration and warm-up can be changed with
`MEDIAPIPE_PROFILE_DURATION_MS` and `MEDIAPIPE_PROFILE_WARMUP_MS`.
