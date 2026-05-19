# Pose Estimation Tracker Server

Python WebSocket pose tracker for the React motion runner UI. The browser keeps
camera ownership and sends compressed frames to this server; the server returns
frontend-compatible person detections.

## Run

```bash
uv sync
uv run pose-tracker-server
```

Use a different model, port, or tracker:

```bash
uv run pose-tracker-server --host 127.0.0.1 --port 8765 --model yolo26s-pose.pt --tracker botsort.yaml --conf 0.35 --imgsz 640
```

Start the frontend with the matching WebSocket URL:

```bash
VITE_POSE_TRACKER_WS_URL=ws://127.0.0.1:8765 pnpm start
```

Then choose `Python WebSocket` in the app's advanced tracking selector.

## Protocol

The frontend sends JSON messages:

```json
{
  "type": "detect",
  "requestId": 1,
  "threshold": 0.45,
  "frame": {
    "frameId": "camera-frame-1",
    "capturedAtMs": 1234,
    "width": 640,
    "height": 480
  },
  "image": {
    "mime": "image/jpeg",
    "data": "base64..."
  }
}
```

The server responds with the existing frontend `model-prediction` shape:

```json
{
  "type": "result",
  "requestId": 1,
  "result": {
    "type": "model-prediction",
    "frame": "...same descriptor...",
    "detections": [],
    "timings": {
      "rawImageMs": 1,
      "preprocessMs": 0,
      "modelMs": 25,
      "postprocessMs": 1,
      "totalMs": 27
    }
  }
}
```
