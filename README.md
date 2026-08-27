# Webcam Motion Games

A browser-based motion-control game prototype. The app uses the user's camera to detect a person, maps their horizontal position into three lanes, and drives a Three.js runner scene where the player dodges incoming obstacle balls.

Play now at https://agustinramirodiaz.github.io/webcam-motion-games/!

## Features

- Live camera feedback with three lane guides
- Mirrored camera preview enabled by default
- YOLO person detection and pose models through Transformers.js
- Runtime switch between WebGPU and WASM
- Model switch between nano/small detection and pose variants
- Worker-based inference so the game/UI thread stays responsive
- Three.js rail scene with lane movement, obstacle spawning, hit count, and dodge count
- GitHub Pages deployment workflow

## Tech Stack

- React + TypeScript
- Vite
- pnpm
- Three.js
- `@huggingface/transformers`
- Web Workers

## Requirements

- Node.js 24
- pnpm 11
- A browser with camera access
- WebGPU-capable browser/GPU for the fastest runtime, otherwise the app falls back to WASM

Camera access requires a secure context. Localhost is fine for development; hosted deployments should use HTTPS.

## Install

```bash
pnpm install
```

## Development

The frontend app lives in `frontend/`. Root scripts delegate into that folder so the common commands still work from the repository root.

```bash
pnpm start
```

Open the local URL printed by Vite. If the default port is busy, Vite will offer another port.

## Test

```bash
pnpm test --watchAll=false
```

To benchmark the complete Hand Rhythm camera-to-render pipeline with a deterministic fake-camera
video, run:

```bash
pnpm test:e2e:performance
```

The command requires `ffmpeg`. It builds a production frontend, generates a temporary Y4M camera
stream from the hand fixture, warms up MediaPipe, and records steady-state latency, render-frame,
CPU, heap, process, and GPU diagnostics in `profile-results-hand-rhythm/summary.json`. Override the
sample and warm-up windows with `PROFILE_DURATION_MS` and `PROFILE_WARMUP_MS`.

Headless mode uses software graphics for a reproducible CI baseline. For representative local GPU
numbers, run:

```bash
PROFILE_REAL_GPU=true PROFILE_HEADLESS=false pnpm test:e2e:performance
```

The standalone copy of Google's MediaPipe Gesture Recognizer web sample lives in
`test-mediapipe/`. Profile its worker inference without the game pipeline using:

```bash
pnpm profile:mediapipe
```

Use `MEDIAPIPE_PROFILE_REAL_GPU=true MEDIAPIPE_PROFILE_HEADLESS=false` for local hardware-GPU
measurements.

## Lint

```bash
pnpm run lint
```

## Build

```bash
pnpm run build
```

For the GitHub Pages path used by this repository:

```bash
PUBLIC_URL=/webcam-motion-games/ pnpm run build
```

## How It Works

1. The main thread captures the current camera frame.
2. React wraps the canvas in a typed `CameraFrame` with frame id, capture time, width, and height.
3. The active `ModelPredictionService` implementation receives that frame and returns a `ModelPrediction`.
4. The current browser worker implementation transfers the frame image as an `ImageBitmap`, runs Transformers.js preprocessing and YOLO inference, then returns decoded person detections tied to the original frame metadata.
5. The highest-confidence person is mapped to left, center, or right.
6. The Three.js player sphere moves to that lane while obstacle spheres travel down the rails.

The shared prediction boundary lives in `frontend/src/detectionSchema.ts`. Keep camera frame data (`CameraFrame`) separate from model output (`ModelPrediction`) so the browser worker can be replaced by a local backend client without changing React's detection loop.

If camera mirroring is enabled, the preview and detection overlay are flipped visually, and the lane mapping is inverted so movement matches what the user sees.

## Models

The UI currently supports:

- `onnx-community/yolo26n-ONNX`
- `onnx-community/yolo26s-ONNX`
- `onnx-community/yolo26n-pose-ONNX`
- `onnx-community/yolo26s-pose-ONNX`

Detection models produce person boxes only. Pose models produce person boxes plus body keypoints.

## Deployment

GitHub Pages deployment is configured in:

```text
.github/workflows/deploy-github-pages.yml
```

The workflow runs on pushes to `main` and can also be started manually. It installs with pnpm, runs tests, builds with:

```bash
PUBLIC_URL=/webcam-motion-games/ pnpm run build
```

Then it publishes the `frontend/dist/` directory through GitHub Pages.

In the GitHub repository settings, set Pages source to **GitHub Actions**.
