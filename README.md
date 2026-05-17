# Subway Surfer With Motion

A browser-based motion-control game prototype. The app uses the user's camera to detect a person, maps their horizontal position into three lanes, and drives a Three.js runner scene where the player dodges incoming obstacle balls.

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
- Create React App
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

```bash
pnpm start
```

Open the local URL printed by Create React App. If the default port is busy, CRA will offer another port.

## Test

```bash
pnpm test --watchAll=false
```

## Build

```bash
pnpm run build
```

For the GitHub Pages path used by this repository:

```bash
PUBLIC_URL=/subway-surfer-with-motion pnpm run build
```

## How It Works

1. The main thread captures the current camera frame.
2. The frame is transferred to a Web Worker as an `ImageBitmap`.
3. The worker runs Transformers.js preprocessing and YOLO inference.
4. The decoded person detections are sent back to React.
5. The highest-confidence person is mapped to left, center, or right.
6. The Three.js player sphere moves to that lane while obstacle spheres travel down the rails.

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
PUBLIC_URL=/subway-surfer-with-motion pnpm run build
```

Then it publishes the `build/` directory through GitHub Pages.

In the GitHub repository settings, set Pages source to **GitHub Actions**.
