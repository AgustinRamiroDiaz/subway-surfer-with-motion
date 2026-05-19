import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { Detector, DetectorTimings, PersonDetection } from './aiDetector';
import { createCameraFrame } from './detectionSchema';
import { loadDetectorClient } from './detectorClient';
import type { AppPreferences } from './appPreferences';
import { DEFAULT_PLAYER_POSITIONS, drawDetections, getPlayerPositions } from './poseOverlay';
import { useLatest } from './useLatest';

const DETECTION_INTERVAL_MS = 180;

export type FrameTimings = DetectorTimings & {
  captureMs: number;
  drawMs: number;
  loopMs: number;
};

type UseMotionDetectorOptions = {
  preferences: AppPreferences;
  cameraEnabled: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  overlayRef: RefObject<HTMLCanvasElement | null>;
  frameRef: RefObject<HTMLCanvasElement | null>;
  streamRef: RefObject<MediaStream | null>;
  startCamera: () => Promise<MediaStream>;
  syncCanvasSize: () => void;
  clearOverlay: () => void;
};

type MotionDetectorControls = {
  isDetecting: boolean;
  isLoading: boolean;
  status: string;
  modelStatus: string;
  detections: PersonDetection[];
  lastInferenceMs: number | null;
  frameTimings: FrameTimings | null;
  playerPositions: number[];
  error: string | null;
  clearDetectionState: () => void;
  resetDetector: () => void;
  startDetection: () => Promise<boolean>;
  stopDetection: () => void;
};

export function useMotionDetector({
  preferences,
  cameraEnabled,
  videoRef,
  overlayRef,
  frameRef,
  streamRef,
  startCamera,
  syncCanvasSize,
  clearOverlay,
}: UseMotionDetectorOptions): MotionDetectorControls {
  const detectorRef = useRef<Detector | null>(null);
  const disposeDetectorRef = useRef<(() => void) | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const detectingRef = useRef(false);
  const frameSequenceRef = useRef(0);
  const preferencesRef = useLatest(preferences);
  const cameraEnabledRef = useLatest(cameraEnabled);

  const [isDetecting, setIsDetecting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState('Camera idle');
  const [modelStatus, setModelStatus] = useState('Model not loaded');
  const [detections, setDetections] = useState<PersonDetection[]>([]);
  const [lastInferenceMs, setLastInferenceMs] = useState<number | null>(null);
  const [frameTimings, setFrameTimings] = useState<FrameTimings | null>(null);
  const [playerPositions, setPlayerPositions] = useState<number[]>([...DEFAULT_PLAYER_POSITIONS]);
  const [error, setError] = useState<string | null>(null);

  const clearDetectionState = useCallback(() => {
    setDetections([]);
    setLastInferenceMs(null);
    setFrameTimings(null);
    setPlayerPositions([...DEFAULT_PLAYER_POSITIONS]);
    clearOverlay();
  }, [clearOverlay]);

  const stopDetection = useCallback(() => {
    detectingRef.current = false;
    setIsDetecting(false);
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setStatus(cameraEnabledRef.current ? 'Camera ready' : 'Camera idle');
  }, [cameraEnabledRef]);

  const runDetection = useCallback(async () => {
    const detector = detectorRef.current;
    const video = videoRef.current;
    const frame = frameRef.current;
    const frameContext = frame?.getContext('2d', { willReadFrequently: true });

    if (!detectingRef.current || !detector || !video || !frame || !frameContext) {
      return;
    }

    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) {
      timeoutRef.current = window.setTimeout(() => {
        void runDetection();
      }, DETECTION_INTERVAL_MS);
      return;
    }

    const loopStartedAt = performance.now();
    syncCanvasSize();
    frameContext.drawImage(video, 0, 0, frame.width, frame.height);
    const captureDoneAt = performance.now();
    frameSequenceRef.current += 1;
    const cameraFrame = createCameraFrame(frame, `camera-frame-${frameSequenceRef.current}`, loopStartedAt);

    try {
      const activePreferences = preferencesRef.current;
      const result = await detector(cameraFrame, {
        threshold: activePreferences.threshold,
        percentage: false,
      });
      const sorted = [...result.detections].sort((a, b) => b.score - a.score);
      setDetections(sorted);
      setPlayerPositions(getPlayerPositions(sorted, frame.width, activePreferences.cameraMirrored));
      setStatus(sorted.length ? `${sorted.length} person${sorted.length === 1 ? '' : 's'} detected` : 'Scanning');

      const drawStartedAt = performance.now();
      const overlay = overlayRef.current;
      if (overlay) {
        drawDetections(overlay, sorted);
      }
      const drawDoneAt = performance.now();

      setLastInferenceMs(Math.round(result.timings.totalMs));
      setFrameTimings({
        ...result.timings,
        captureMs: captureDoneAt - loopStartedAt,
        drawMs: drawDoneAt - drawStartedAt,
        loopMs: drawDoneAt - loopStartedAt,
      });
    } catch (cause: unknown) {
      detectingRef.current = false;
      setIsDetecting(false);
      setError(cause instanceof Error ? cause.message : 'Detection failed');
      setStatus('Detection stopped');
      return;
    }

    if (detectingRef.current) {
      timeoutRef.current = window.setTimeout(() => {
        void runDetection();
      }, DETECTION_INTERVAL_MS);
    }
  }, [frameRef, overlayRef, preferencesRef, syncCanvasSize, videoRef]);

  const loadDetector = useCallback(async () => {
    if (detectorRef.current) {
      return detectorRef.current;
    }

    const activePreferences = preferencesRef.current;
    setIsLoading(true);
    setModelStatus('Loading model');

    try {
      const { detector, runtime, fallbackReason, dispose } = await loadDetectorClient({
        backend: activePreferences.selectedBackendId,
        modelId: activePreferences.selectedModelId,
        runtime: activePreferences.selectedRuntimeId,
        quantization: activePreferences.selectedQuantizationId,
        mediaPipeModelId: activePreferences.selectedMediaPipeModelId,
        mediaPipeDelegate: activePreferences.selectedMediaPipeDelegateId,
        onStatusChange: ({ message }) => setModelStatus(message),
      });
      detectorRef.current = detector;
      disposeDetectorRef.current = dispose ?? null;
      const runtimeLabel =
        activePreferences.selectedBackendId === 'mediapipe'
          ? runtime
          : activePreferences.selectedBackendId === 'python-websocket'
            ? runtime
          : `${runtime} ${activePreferences.selectedQuantizationId.toUpperCase()}`;
      setModelStatus(
        fallbackReason ? `Model ready on ${runtimeLabel}. WebGPU fallback: ${fallbackReason}` : `Model ready on ${runtimeLabel}`
      );
      return detectorRef.current;
    } finally {
      setIsLoading(false);
    }
  }, [preferencesRef]);

  const resetDetector = useCallback(() => {
    stopDetection();
    disposeDetectorRef.current?.();
    disposeDetectorRef.current = null;
    detectorRef.current = null;
    clearDetectionState();
    setModelStatus('Model not loaded');
  }, [clearDetectionState, stopDetection]);

  const startDetection = useCallback(async () => {
    setError(null);

    if (!streamRef.current) {
      setStatus('Requesting camera');
      try {
        await startCamera();
        setStatus('Camera ready');
      } catch (cause: unknown) {
        setError(cause instanceof Error ? cause.message : 'Camera permission was denied');
        setStatus('Camera blocked');
        return false;
      }
    }

    const video = videoRef.current;
    if (!video?.srcObject) {
      return false;
    }

    try {
      await loadDetector();
      detectingRef.current = true;
      setIsDetecting(true);
      setStatus('Scanning');
      void runDetection();
      return true;
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Unable to load detector');
      setStatus('Detector unavailable');
      setIsDetecting(false);
      detectingRef.current = false;
      return false;
    }
  }, [loadDetector, runDetection, startCamera, streamRef, videoRef]);

  useEffect(() => {
    return () => {
      detectingRef.current = false;
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
      disposeDetectorRef.current?.();
    };
  }, []);

  return {
    isDetecting,
    isLoading,
    status,
    modelStatus,
    detections,
    lastInferenceMs,
    frameTimings,
    playerPositions,
    error,
    clearDetectionState,
    resetDetector,
    startDetection,
    stopDetection,
  };
}
