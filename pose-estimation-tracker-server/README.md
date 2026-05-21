# Pose Estimation Tracker Server

Python WebRTC pose tracker for the React motion runner UI. The browser keeps
camera ownership, streams video to this server over WebRTC, and receives
frontend-compatible person detections over a low-latency data channel.

## Run

### Using uv (Recommended for Development)

```bash
uv sync
uv run pose-tracker-server
```

### Standalone Binary

You can download pre-compiled binaries for Windows, macOS, and Linux from the [GitHub Releases](https://github.com/your-repo/releases) page.

1. Download the binary for your platform.
2. Run it from the terminal:
   ```bash
   ./pose-tracker-server --port 8765
   ```
   (On Windows, use `pose-tracker-server.exe`)

Use a different model, port, or tracker:

```bash
uv run pose-tracker-server --host 127.0.0.1 --port 8765 --model yolo26s-pose.pt --tracker botsort.yaml --conf 0.35 --imgsz 640
```

Start the frontend with the matching WebRTC signaling URL:

```bash
VITE_POSE_TRACKER_SIGNALING_URL=ws://127.0.0.1:8765 pnpm start
```

Then choose `Python WebRTC` in the app's advanced tracking selector.

## OpenCV Playground

Run YOLO directly against a local camera and show the matched pose points,
tracking IDs, and inference timing in an OpenCV window:

```bash
uv run pose-tracker-preview
```

Useful flags:

```bash
uv run pose-tracker-preview --camera 0 --model yolo26s-pose.pt --tracker botsort.yaml --conf 0.35 --imgsz 640
```

Press `q` or Escape to close the preview.

## Protocol

The WebSocket connection is only used for WebRTC signaling. The frontend sends:

```json
{
  "type": "offer",
  "sdp": "...",
  "config": {
    "threshold": 0.45,
    "maxPoses": 2
  }
}
```

The server responds:

```json
{
  "type": "answer",
  "sdp": "..."
}
```

After the peer connection is established, the browser sends the camera video
track over WebRTC. The server always processes the newest received frame and
drops stale frames if inference is busy. Detection results are pushed on the
`detections` data channel using the existing frontend `model-prediction` shape.
