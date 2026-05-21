import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { Detector, DetectorLoadResult, DetectorResult, DetectorTimings, PersonDetection } from './aiDetector';
import { createCameraFrame } from './detectionSchema';
import { loadDetectorClient } from './detectorClient';
import type { AppPreferences } from './appPreferences';
import { drawDetections, getDefaultPlayerPositions, getPlayerPositions, getPersonPosition } from './poseOverlay';
import { useLatest } from './useLatest';

const DETECTION_INTERVAL_MS = 180;

function createEmptyTrackIds(playerCount: number): Array<number | null> {
  return Array.from({ length: playerCount }, () => null);
}

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
  const detectorModeRef = useRef<DetectorLoadResult['mode']>('pull');
  const disposeDetectorRef = useRef<(() => void) | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const detectingRef = useRef(false);
  const frameSequenceRef = useRef(0);
  const preferencesRef = useLatest(preferences);
  const cameraEnabledRef = useLatest(cameraEnabled);
  const initialPlayerPositions = getDefaultPlayerPositions(preferences.playerCount);

  const [isDetecting, setIsDetecting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState('Camera idle');
  const [modelStatus, setModelStatus] = useState('Model not loaded');
  const [detections, setDetections] = useState<PersonDetection[]>([]);
  const [lastInferenceMs, setLastInferenceMs] = useState<number | null>(null);
  const [frameTimings, setFrameTimings] = useState<FrameTimings | null>(null);
  const [playerPositions, setPlayerPositions] = useState<number[]>(initialPlayerPositions);
  const playerPositionsRef = useLatest(playerPositions);
  const [error, setError] = useState<string | null>(null);
  const playerTrackIdsRef = useRef<Array<number | null>>(createEmptyTrackIds(initialPlayerPositions.length));
  const trackIdLastSeenRef = useRef<Map<number, number>>(new Map());

  const clearDetectionState = useCallback(() => {
    const fallbackPositions = getDefaultPlayerPositions(preferencesRef.current.playerCount);
    setDetections([]);
    setLastInferenceMs(null);
    setFrameTimings(null);
    setPlayerPositions(fallbackPositions);
    playerTrackIdsRef.current = createEmptyTrackIds(fallbackPositions.length);
    trackIdLastSeenRef.current.clear();
    clearOverlay();
  }, [clearOverlay, preferencesRef]);

  const stopDetection = useCallback(() => {
    detectingRef.current = false;
    setIsDetecting(false);
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (detectorModeRef.current === 'stream') {
      disposeDetectorRef.current?.();
      disposeDetectorRef.current = null;
      detectorRef.current = null;
      detectorModeRef.current = 'pull';
      setModelStatus('Model not loaded');
    }
    setStatus(cameraEnabledRef.current ? 'Camera ready' : 'Camera idle');
  }, [cameraEnabledRef]);

  const handleDetectorResult = useCallback((result: DetectorResult, captureMs: number, loopStartedAt: number | null) => {
    const activePreferences = preferencesRef.current;
    const frameWidth = result.frame.width;
    const sorted = [...result.detections].sort((a, b) => b.score - a.score);
    setDetections(sorted);
    const playerCount = activePreferences.playerCount;
    const fallbackPositions = getDefaultPlayerPositions(playerCount);
    if (playerTrackIdsRef.current.length !== playerCount) {
      playerTrackIdsRef.current = createEmptyTrackIds(playerCount);
    }

    const hasTrackingIds = sorted.some((d) => d.id !== undefined);
    let finalPositions: number[];

    if (hasTrackingIds) {
      const now = performance.now();
      const TRACK_TIMEOUT_MS = 2000;

      sorted.forEach((d) => {
        if (d.id !== undefined) {
          trackIdLastSeenRef.current.set(d.id, now);
        }
      });

      trackIdLastSeenRef.current.forEach((lastSeen, id) => {
        if (now - lastSeen > TRACK_TIMEOUT_MS) {
          trackIdLastSeenRef.current.delete(id);
          const index = playerTrackIdsRef.current.indexOf(id);
          if (index !== -1) {
            playerTrackIdsRef.current[index] = null;
          }
        }
      });

      const nextPositions = fallbackPositions.map(
        (fallbackPosition, index) => playerPositionsRef.current[index] ?? fallbackPosition
      );
      const assigned = new Set<PersonDetection>();

      playerTrackIdsRef.current.forEach((trackedId, index) => {
        if (trackedId === null) {
          return;
        }
        const match = sorted.find((d) => d.id === trackedId);
        if (match) {
          const pos = getPersonPosition(match, frameWidth);
          nextPositions[index] = activePreferences.cameraMirrored ? 1 - pos : pos;
          assigned.add(match);
        }
      });

      const unassignedDetections = sorted
        .filter((d) => !assigned.has(d))
        .sort((a, b) => {
          const posA = getPersonPosition(a, frameWidth);
          const posB = getPersonPosition(b, frameWidth);
          return activePreferences.cameraMirrored ? posB - posA : posA - posB;
        });

      const emptySlots = playerTrackIdsRef.current
        .map((id, index) => (id === null ? index : -1))
        .filter((index) => index !== -1);

      unassignedDetections.forEach((d, i) => {
        if (i < emptySlots.length) {
          const emptySlot = emptySlots[i];
          if (emptySlot !== undefined) {
            if (d.id !== undefined) {
              playerTrackIdsRef.current[emptySlot] = d.id;
            }
            const pos = getPersonPosition(d, frameWidth);
            nextPositions[emptySlot] = activePreferences.cameraMirrored ? 1 - pos : pos;
            assigned.add(d);
          }
        }
      });

      finalPositions = nextPositions;
    } else {
      finalPositions = getPlayerPositions(sorted, frameWidth, activePreferences.cameraMirrored, playerCount);
    }

    setPlayerPositions(finalPositions);
    setStatus(sorted.length ? `${sorted.length} person${sorted.length === 1 ? '' : 's'} detected` : 'Scanning');

    const drawStartedAt = performance.now();
    const overlay = overlayRef.current;
    if (overlay) {
      drawDetections(overlay, sorted);
    }
    const drawDoneAt = performance.now();

    const loopMs = loopStartedAt === null ? result.timings.totalMs + (drawDoneAt - drawStartedAt) : drawDoneAt - loopStartedAt;
    setLastInferenceMs(Math.round(result.timings.totalMs));
    setFrameTimings({
      ...result.timings,
      captureMs,
      drawMs: drawDoneAt - drawStartedAt,
      loopMs,
    });
  }, [overlayRef, playerPositionsRef, preferencesRef]);

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
      handleDetectorResult(result, captureDoneAt - loopStartedAt, loopStartedAt);
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
  }, [frameRef, handleDetectorResult, preferencesRef, syncCanvasSize, videoRef]);

  const loadDetector = useCallback(async () => {
    if (detectorRef.current) {
      return detectorRef.current;
    }

    const activePreferences = preferencesRef.current;
    setIsLoading(true);
    setModelStatus('Loading model');

    try {
      const { detector, runtime, fallbackReason, dispose, mode } = await loadDetectorClient({
        backend: activePreferences.selectedBackendId,
        modelId: activePreferences.selectedModelId,
        runtime: activePreferences.selectedRuntimeId,
        quantization: activePreferences.selectedQuantizationId,
        mediaPipeModelId: activePreferences.selectedMediaPipeModelId,
        mediaPipeDelegate: activePreferences.selectedMediaPipeDelegateId,
        playerCount: activePreferences.playerCount,
        threshold: activePreferences.threshold,
        stream: streamRef.current ?? undefined,
        onStatusChange: ({ message }) => setModelStatus(message),
        onResult: (result) => {
          if (!detectingRef.current) {
            return;
          }
          syncCanvasSize();
          handleDetectorResult(result, 0, null);
        },
        onError: (cause) => {
          if (!detectingRef.current) {
            return;
          }
          detectingRef.current = false;
          setIsDetecting(false);
          setError(cause.message);
          setStatus('Detection stopped');
        },
      });
      detectorRef.current = detector;
      detectorModeRef.current = mode ?? 'pull';
      disposeDetectorRef.current = dispose ?? null;
      const runtimeLabel =
        activePreferences.selectedBackendId === 'mediapipe'
          ? runtime
          : activePreferences.selectedBackendId === 'python-webrtc'
            ? runtime
          : `${runtime} ${activePreferences.selectedQuantizationId.toUpperCase()}`;
      setModelStatus(
        fallbackReason ? `Model ready on ${runtimeLabel}. WebGPU fallback: ${fallbackReason}` : `Model ready on ${runtimeLabel}`
      );
      return detectorRef.current;
    } finally {
      setIsLoading(false);
    }
  }, [handleDetectorResult, preferencesRef, streamRef, syncCanvasSize]);

  const resetDetector = useCallback(() => {
    stopDetection();
    disposeDetectorRef.current?.();
    disposeDetectorRef.current = null;
    detectorRef.current = null;
    detectorModeRef.current = 'pull';
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
      if (detectorModeRef.current !== 'stream') {
        void runDetection();
      }
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

  useEffect(() => {
    const fallbackPositions = getDefaultPlayerPositions(preferences.playerCount);
    setPlayerPositions(fallbackPositions);
    playerTrackIdsRef.current = createEmptyTrackIds(fallbackPositions.length);
    trackIdLastSeenRef.current.clear();
  }, [preferences.playerCount]);

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
