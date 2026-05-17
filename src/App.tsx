import { useCallback, useEffect, useRef, useState } from 'react';
import { loadYoloDetector, type Detection, type Detector } from './aiDetector';
import './App.css';

const DETECTION_INTERVAL_MS = 180;
const DEFAULT_THRESHOLD = 0.45;

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function clampBox(box: Detection['box'], width: number, height: number) {
  return {
    xmin: Math.max(0, Math.min(width, box.xmin)),
    ymin: Math.max(0, Math.min(height, box.ymin)),
    xmax: Math.max(0, Math.min(width, box.xmax)),
    ymax: Math.max(0, Math.min(height, box.ymax)),
  };
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

  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState('Camera idle');
  const [modelStatus, setModelStatus] = useState('Model not loaded');
  const [detections, setDetections] = useState<Detection[]>([]);
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);
  const [lastInferenceMs, setLastInferenceMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    thresholdRef.current = threshold;
  }, [threshold]);

  const drawDetections = useCallback((items: Detection[]) => {
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

    items.forEach((item) => {
      const box = clampBox(item.box, canvas.width, canvas.height);
      const width = box.xmax - box.xmin;
      const height = box.ymax - box.ymin;
      const label = `${item.label} ${formatPercent(item.score)}`;
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

    syncCanvasSize();
    frameContext.drawImage(video, 0, 0, frame.width, frame.height);

    const startedAt = performance.now();
    try {
      const output = await detector(frame, {
        threshold: thresholdRef.current,
        percentage: false,
      });
      const sorted = [...output].sort((a, b) => b.score - a.score);
      setDetections(sorted);
      setLastInferenceMs(Math.round(performance.now() - startedAt));
      setStatus(sorted.length ? `${sorted.length} object${sorted.length === 1 ? '' : 's'} detected` : 'Scanning');
      drawDetections(sorted);
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
      const { detector, runtime } = await loadYoloDetector({
        onStatusChange: ({ message }) => setModelStatus(message),
      });
      detectorRef.current = detector;
      setModelStatus(`Model ready on ${runtime}`);
      return detectorRef.current;
    } finally {
      setIsLoading(false);
    }
  }, []);

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

  return (
    <main className="app-shell">
      <section className="workspace" aria-label="Real-time object detection workspace">
        <div className="video-stage">
          <video
            ref={videoRef}
            className="camera-video"
            muted
            playsInline
            onLoadedMetadata={syncCanvasSize}
          />
          <canvas ref={overlayRef} className="detection-overlay" aria-hidden="true" />
          <canvas ref={frameRef} className="frame-buffer" aria-hidden="true" />

          {!cameraEnabled && (
            <div className="empty-state">
              <p className="eyebrow">YOLO26n ONNX</p>
              <h1>Live camera detection</h1>
              <p>Run COCO object detection locally in your browser.</p>
            </div>
          )}
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

          {error && <p className="error-message">{error}</p>}

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
            <p className="eyebrow">Detections</p>
            {detections.length > 0 ? (
              <ul>
                {detections.slice(0, 8).map((detection, index) => (
                  <li key={`${detection.label}-${index}-${Math.round(detection.score * 1000)}`}>
                    <span>{detection.label}</span>
                    <strong>{formatPercent(detection.score)}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No objects above threshold.</p>
            )}
          </div>
        </aside>
      </section>
    </main>
  );
}

export default App;
