import { useCallback, useEffect, useRef, useState, type CSSProperties, type ChangeEvent } from 'react';
import {
  DEFAULT_DETECTOR_RUNTIME_ID,
  DEFAULT_YOLO_MODEL_ID,
  DETECTOR_RUNTIMES,
  YOLO_MODELS,
  loadYoloDetector,
  type Detector,
  type DetectorRuntimeId,
  type DetectorTimings,
  type PersonDetection,
  type PoseKeypoint,
  type YoloModelId,
} from './aiDetector';
import './App.css';

const DETECTION_INTERVAL_MS = 180;
const DEFAULT_THRESHOLD = 0.45;
const LANES = ['Left', 'Center', 'Right'] as const;
type FrameTimings = DetectorTimings & {
  captureMs: number;
  drawMs: number;
  loopMs: number;
};

const POSE_CONNECTIONS = [
  ['Left Shoulder', 'Right Shoulder'],
  ['Left Shoulder', 'Left Elbow'],
  ['Left Elbow', 'Left Wrist'],
  ['Right Shoulder', 'Right Elbow'],
  ['Right Elbow', 'Right Wrist'],
  ['Left Shoulder', 'Left Hip'],
  ['Right Shoulder', 'Right Hip'],
  ['Left Hip', 'Right Hip'],
  ['Left Hip', 'Left Knee'],
  ['Left Knee', 'Left Ankle'],
  ['Right Hip', 'Right Knee'],
  ['Right Knee', 'Right Ankle'],
  ['Nose', 'Left Eye'],
  ['Nose', 'Right Eye'],
  ['Left Eye', 'Left Ear'],
  ['Right Eye', 'Right Ear'],
] as const;

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function clampBox(box: PersonDetection['box'], width: number, height: number) {
  return {
    xmin: Math.max(0, Math.min(width, box.xmin)),
    ymin: Math.max(0, Math.min(height, box.ymin)),
    xmax: Math.max(0, Math.min(width, box.xmax)),
    ymax: Math.max(0, Math.min(height, box.ymax)),
  };
}

function findKeypoint(keypoints: PoseKeypoint[], label: string) {
  return keypoints.find((keypoint) => keypoint.label === label);
}

function formatMs(value: number) {
  return `${Math.round(value)} ms`;
}

function getPersonColumn(detection: PersonDetection, frameWidth: number) {
  if (!frameWidth) {
    return 1;
  }

  const centerX = (detection.box.xmin + detection.box.xmax) / 2;
  return Math.max(0, Math.min(2, Math.floor((centerX / frameWidth) * 3)));
}

function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<HTMLCanvasElement | null>(null);
  const detectorRef = useRef<Detector | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const detectingRef = useRef(false);
  const thresholdRef = useRef(DEFAULT_THRESHOLD);
  const selectedModelRef = useRef<YoloModelId>(DEFAULT_YOLO_MODEL_ID);
  const selectedRuntimeRef = useRef<DetectorRuntimeId>(DEFAULT_DETECTOR_RUNTIME_ID);

  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState('Camera idle');
  const [modelStatus, setModelStatus] = useState('Model not loaded');
  const [selectedModelId, setSelectedModelId] = useState<YoloModelId>(DEFAULT_YOLO_MODEL_ID);
  const [selectedRuntimeId, setSelectedRuntimeId] = useState<DetectorRuntimeId>(DEFAULT_DETECTOR_RUNTIME_ID);
  const [detections, setDetections] = useState<PersonDetection[]>([]);
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);
  const [lastInferenceMs, setLastInferenceMs] = useState<number | null>(null);
  const [frameTimings, setFrameTimings] = useState<FrameTimings | null>(null);
  const [playerColumn, setPlayerColumn] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    thresholdRef.current = threshold;
  }, [threshold]);

  useEffect(() => {
    selectedModelRef.current = selectedModelId;
  }, [selectedModelId]);

  useEffect(() => {
    selectedRuntimeRef.current = selectedRuntimeId;
  }, [selectedRuntimeId]);

  const drawDetections = useCallback((items: PersonDetection[]) => {
    const video = videoRef.current;
    const canvas = overlayRef.current;
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) {
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.lineWidth = Math.max(3, Math.round(canvas.width / 240));
    context.font = `${Math.max(15, Math.round(canvas.width / 48))}px Inter, system-ui, sans-serif`;
    context.textBaseline = 'top';

    items.forEach((item, index) => {
      const box = clampBox(item.box, canvas.width, canvas.height);
      const width = box.xmax - box.xmin;
      const height = box.ymax - box.ymin;
      const label = `person ${index + 1} ${formatPercent(item.score)}`;
      const labelWidth = context.measureText(label).width + 16;
      const labelHeight = 28;
      const labelY = box.ymin > labelHeight ? box.ymin - labelHeight : box.ymin;

      context.strokeStyle = '#2fffb2';
      context.fillStyle = 'rgba(47, 255, 178, 0.14)';
      context.strokeRect(box.xmin, box.ymin, width, height);
      context.fillRect(box.xmin, box.ymin, width, height);

      context.fillStyle = '#07120f';
      context.fillRect(box.xmin, labelY, labelWidth, labelHeight);
      context.fillStyle = '#dfffee';
      context.fillText(label, box.xmin + 8, labelY + 5);

      if (item.keypoints?.length) {
        context.strokeStyle = '#ffcc4d';
        context.lineWidth = Math.max(2, Math.round(canvas.width / 360));
        POSE_CONNECTIONS.forEach(([fromLabel, toLabel]) => {
          const from = findKeypoint(item.keypoints ?? [], fromLabel);
          const to = findKeypoint(item.keypoints ?? [], toLabel);
          if (!from || !to) {
            return;
          }
          context.beginPath();
          context.moveTo(from.x, from.y);
          context.lineTo(to.x, to.y);
          context.stroke();
        });

        item.keypoints.forEach((keypoint) => {
          context.beginPath();
          context.fillStyle = '#ff5f7a';
          context.arc(keypoint.x, keypoint.y, Math.max(4, Math.round(canvas.width / 180)), 0, Math.PI * 2);
          context.fill();
        });
      }
    });
  }, []);

  const syncCanvasSize = useCallback(() => {
    const video = videoRef.current;
    const overlay = overlayRef.current;
    const frame = frameRef.current;
    if (!video || !overlay || !frame || !video.videoWidth || !video.videoHeight) {
      return;
    }

    overlay.width = video.videoWidth;
    overlay.height = video.videoHeight;
    frame.width = video.videoWidth;
    frame.height = video.videoHeight;
  }, []);

  const stopDetection = useCallback(() => {
    detectingRef.current = false;
    setIsDetecting(false);
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setStatus(cameraEnabled ? 'Camera ready' : 'Camera idle');
  }, [cameraEnabled]);

  const runDetection = useCallback(async () => {
    const detector = detectorRef.current;
    const video = videoRef.current;
    const frame = frameRef.current;
    const frameContext = frame?.getContext('2d', { willReadFrequently: true });

    if (!detectingRef.current || !detector || !video || !frame || !frameContext) {
      return;
    }

    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) {
      timeoutRef.current = window.setTimeout(runDetection, DETECTION_INTERVAL_MS);
      return;
    }

    const loopStartedAt = performance.now();
    syncCanvasSize();
    frameContext.drawImage(video, 0, 0, frame.width, frame.height);
    const captureDoneAt = performance.now();

    try {
      const result = await detector(frame, {
        threshold: thresholdRef.current,
        percentage: false,
      });
      const sorted = [...result.detections].sort((a, b) => b.score - a.score);
      setDetections(sorted);
      if (sorted[0]) {
        setPlayerColumn(getPersonColumn(sorted[0], frame.width));
      }
      setStatus(sorted.length ? `${sorted.length} person${sorted.length === 1 ? '' : 's'} detected` : 'Scanning');
      const drawStartedAt = performance.now();
      drawDetections(sorted);
      const drawDoneAt = performance.now();
      const loopMs = drawDoneAt - loopStartedAt;

      setLastInferenceMs(Math.round(result.timings.totalMs));
      setFrameTimings({
        ...result.timings,
        captureMs: captureDoneAt - loopStartedAt,
        drawMs: drawDoneAt - drawStartedAt,
        loopMs,
      });
    } catch (cause) {
      detectingRef.current = false;
      setIsDetecting(false);
      setError(cause instanceof Error ? cause.message : 'Detection failed');
      setStatus('Detection stopped');
      return;
    }

    if (detectingRef.current) {
      timeoutRef.current = window.setTimeout(runDetection, DETECTION_INTERVAL_MS);
    }
  }, [drawDetections, syncCanvasSize]);

  const loadDetector = useCallback(async () => {
    if (detectorRef.current) {
      return detectorRef.current;
    }

    setIsLoading(true);
    setModelStatus('Loading model');

    try {
      const { detector, runtime, fallbackReason } = await loadYoloDetector({
        modelId: selectedModelId,
        runtime: selectedRuntimeId,
        onStatusChange: ({ message }) => setModelStatus(message),
      });
      detectorRef.current = detector;
      setModelStatus(
        fallbackReason
          ? `Model ready on ${runtime}. WebGPU fallback: ${fallbackReason}`
          : `Model ready on ${runtime}`
      );
      return detectorRef.current;
    } finally {
      setIsLoading(false);
    }
  }, [selectedModelId, selectedRuntimeId]);

  const resetDetector = useCallback(() => {
    stopDetection();
    detectorRef.current = null;
    setDetections([]);
    setLastInferenceMs(null);
    setFrameTimings(null);
    setPlayerColumn(1);
    setModelStatus('Model not loaded');

    const overlay = overlayRef.current;
    overlay?.getContext('2d')?.clearRect(0, 0, overlay.width, overlay.height);
  }, [stopDetection]);

  const handleModelChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    const nextModelId = event.target.value as YoloModelId;
    if (nextModelId === selectedModelRef.current) {
      return;
    }

    selectedModelRef.current = nextModelId;
    setSelectedModelId(nextModelId);
    resetDetector();
  }, [resetDetector]);

  const handleRuntimeChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    const nextRuntimeId = event.target.value as DetectorRuntimeId;
    if (nextRuntimeId === selectedRuntimeRef.current) {
      return;
    }

    selectedRuntimeRef.current = nextRuntimeId;
    setSelectedRuntimeId(nextRuntimeId);
    resetDetector();
  }, [resetDetector]);

  const startCamera = useCallback(async () => {
    setError(null);
    setStatus('Requesting camera');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraEnabled(true);
      setStatus('Camera ready');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Camera permission was denied');
      setStatus('Camera blocked');
    }
  }, []);

  const startDetection = useCallback(async () => {
    setError(null);

    if (!streamRef.current) {
      await startCamera();
    }

    const video = videoRef.current;
    if (!video?.srcObject) {
      return;
    }

    try {
      await loadDetector();
      detectingRef.current = true;
      setIsDetecting(true);
      setStatus('Scanning');
      runDetection();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load detector');
      setStatus('Detector unavailable');
      setIsDetecting(false);
      detectingRef.current = false;
    }
  }, [loadDetector, runDetection, startCamera]);

  const stopCamera = useCallback(() => {
    stopDetection();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    const overlay = overlayRef.current;
    overlay?.getContext('2d')?.clearRect(0, 0, overlay.width, overlay.height);
    setCameraEnabled(false);
    setDetections([]);
    setLastInferenceMs(null);
    setFrameTimings(null);
    setPlayerColumn(1);
    setStatus('Camera idle');
  }, [stopDetection]);

  useEffect(() => {
    return () => {
      detectingRef.current = false;
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const selectedModel = YOLO_MODELS.find((model) => model.id === selectedModelId) ?? YOLO_MODELS[0];
  const playerLane = LANES[playerColumn];

  return (
    <main className="app-shell">
      <section className="workspace" aria-label="Motion game workspace">
        <div className="play-split">
          <section className="game-stage" aria-label="Main game">
            <div className="stage-heading">
              <p className="eyebrow">Main game</p>
              <h1>Motion runner</h1>
            </div>
            <div className="game-lanes" aria-hidden="true">
              {LANES.map((lane) => (
                <div key={lane} className="game-lane" />
              ))}
            </div>
            <div
              className="player-token"
              style={{ '--player-column': playerColumn } as CSSProperties}
              aria-label={`Player in ${playerLane.toLowerCase()} lane`}
            />
            <div className="lane-readout">
              <span>Lane</span>
              <strong>{playerLane}</strong>
            </div>
          </section>

          <section className="video-stage" aria-label="Camera feedback">
            <div className="stage-heading camera-heading">
              <p className="eyebrow">Camera feedback</p>
              <h2>{selectedModel.label}</h2>
            </div>
            <video
              ref={videoRef}
              className="camera-video"
              muted
              playsInline
              onLoadedMetadata={syncCanvasSize}
            />
            <div className="camera-lane-guides" aria-hidden="true">
              {LANES.map((lane) => (
                <div key={lane} className="camera-lane" />
              ))}
            </div>
            <canvas ref={overlayRef} className="detection-overlay" aria-hidden="true" />
            <canvas ref={frameRef} className="frame-buffer" aria-hidden="true" />

            {!cameraEnabled && (
              <div className="empty-state">
                <p className="eyebrow">{selectedModel.label} ONNX</p>
                <h2>Start the camera</h2>
                <p>Stand in one of the three columns to move the player.</p>
              </div>
            )}
          </section>
        </div>

        <aside className="control-panel" aria-label="Detection controls">
          <div>
            <p className="eyebrow">Status</p>
            <h2>{status}</h2>
            <p className="model-status">{modelStatus}</p>
            {lastInferenceMs !== null && (
              <p className="latency">{lastInferenceMs} ms inference</p>
            )}
          </div>

          {frameTimings && (
            <div className="timing-panel" aria-label="Frame timing breakdown">
              <p className="eyebrow">Timing</p>
              <dl>
                <div>
                  <dt>Capture</dt>
                  <dd>{formatMs(frameTimings.captureMs)}</dd>
                </div>
                <div>
                  <dt>Raw image</dt>
                  <dd>{formatMs(frameTimings.rawImageMs)}</dd>
                </div>
                <div>
                  <dt>Preprocess</dt>
                  <dd>{formatMs(frameTimings.preprocessMs)}</dd>
                </div>
                <div>
                  <dt>Model</dt>
                  <dd>{formatMs(frameTimings.modelMs)}</dd>
                </div>
                <div>
                  <dt>Postprocess</dt>
                  <dd>{formatMs(frameTimings.postprocessMs)}</dd>
                </div>
                <div>
                  <dt>Draw</dt>
                  <dd>{formatMs(frameTimings.drawMs)}</dd>
                </div>
                <div>
                  <dt>Total</dt>
                  <dd>{formatMs(frameTimings.loopMs)}</dd>
                </div>
              </dl>
            </div>
          )}

          {error && <p className="error-message">{error}</p>}

          <label className="model-control">
            <span>Model</span>
            <select value={selectedModelId} onChange={handleModelChange} disabled={isLoading}>
              {YOLO_MODELS.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label} · {model.description}
                </option>
              ))}
            </select>
          </label>

          <label className="model-control">
            <span>Runtime</span>
            <select value={selectedRuntimeId} onChange={handleRuntimeChange} disabled={isLoading}>
              {DETECTOR_RUNTIMES.map((runtime) => (
                <option key={runtime.id} value={runtime.id}>
                  {runtime.label} · {runtime.description}
                </option>
              ))}
            </select>
          </label>

          <div className="button-row">
            <button type="button" onClick={startCamera} disabled={cameraEnabled || isLoading}>
              Start camera
            </button>
            <button
              type="button"
              className="primary-action"
              onClick={isDetecting ? stopDetection : startDetection}
              disabled={isLoading}
            >
              {isDetecting ? 'Pause detection' : isLoading ? 'Loading model' : 'Detect'}
            </button>
            <button type="button" onClick={stopCamera} disabled={!cameraEnabled && !isDetecting}>
              Stop
            </button>
          </div>

          <label className="threshold-control">
            <span>Confidence threshold</span>
            <strong>{formatPercent(threshold)}</strong>
            <input
              type="range"
              min="0.1"
              max="0.9"
              step="0.05"
              value={threshold}
              onChange={(event) => setThreshold(Number(event.target.value))}
            />
          </label>

          <div className="detection-list" aria-live="polite">
            <p className="eyebrow">People</p>
            {detections.length > 0 ? (
              <ul>
                {detections.slice(0, 8).map((detection, index) => (
                  <li key={`${detection.label}-${index}-${Math.round(detection.score * 1000)}`}>
                    <span>Person {index + 1}</span>
                    <strong>
                      {detection.keypoints?.length ? `${detection.keypoints.length} points` : formatPercent(detection.score)}
                    </strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No people above threshold.</p>
            )}
          </div>
        </aside>
      </section>
    </main>
  );
}

export default App;
