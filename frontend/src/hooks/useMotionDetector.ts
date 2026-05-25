import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { Detector, DetectorLoadResult, DetectorResult, DetectorTimings } from '../pose-detection/aiDetector';
import type { HandGestureDetection, PersonDetection } from '../pose-detection/detectionSchema';
import { createCameraFrame } from '../pose-detection/detectionSchema';
import { loadDetectorClient } from '../pose-detection/detectorClient';
import type { DetectorTask } from '../pose-detection/detectorConfig';
import type { AppPreferences } from '../app/appPreferences';
import { translateDetectorStatus, useI18n } from '../app/i18n';
import {
  assignHandDetectionsToPlayerSections,
  getDefaultPlayerPositions,
  getPlayerPositions,
  getPersonPosition,
} from '../motion-mapping/playerPositions';
import { drawDetections } from '../motion-mapping/poseOverlay';
import { useLatest } from './useLatest';

function createEmptyTrackIds(playerCount: number): Array<number | null> {
  return Array.from({ length: playerCount }, () => null);
}

function mirrorDetection<T extends PersonDetection | HandGestureDetection>(detection: T, frameWidth: number): T {
  return {
    ...detection,
    box: {
      ...detection.box,
      xmin: frameWidth - detection.box.xmax,
      xmax: frameWidth - detection.box.xmin,
    },
    keypoints: detection.keypoints?.map((keypoint) => ({
      ...keypoint,
      x: frameWidth - keypoint.x,
    })),
  } as T;
}

export type FrameTimings = DetectorTimings & {
  captureMs: number;
  drawMs: number;
  loopMs: number;
};

type UseMotionDetectorOptions = {
  task: DetectorTask;
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
  detections: Array<PersonDetection | HandGestureDetection>;
  playerDetections: Array<PersonDetection | HandGestureDetection | null>;
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
  task,
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
  const { t, tn } = useI18n();
  const detectorRef = useRef<Detector | null>(null);
  const detectorModeRef = useRef<DetectorLoadResult['mode']>('pull');
  const disposeDetectorRef = useRef<(() => void) | null>(null);
  const videoFrameCallbackRef = useRef<number | null>(null);
  const runDetectionRef = useRef<(() => void) | null>(null);
  const detectingRef = useRef(false);
  const frameSequenceRef = useRef(0);
  const preferencesRef = useLatest(preferences);
  const cameraEnabledRef = useLatest(cameraEnabled);
  const initialPlayerPositions = getDefaultPlayerPositions(preferences.playerCount);

  const [isDetecting, setIsDetecting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState(t('status.cameraIdle'));
  const [modelStatus, setModelStatus] = useState(t('status.modelNotLoaded'));
  const [detections, setDetections] = useState<Array<PersonDetection | HandGestureDetection>>([]);
  const [playerDetections, setPlayerDetections] = useState<Array<PersonDetection | HandGestureDetection | null>>(
    Array.from({ length: preferences.playerCount }, () => null)
  );
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
    setPlayerDetections(Array.from({ length: fallbackPositions.length }, () => null));
    setLastInferenceMs(null);
    setFrameTimings(null);
    setPlayerPositions(fallbackPositions);
    playerTrackIdsRef.current = createEmptyTrackIds(fallbackPositions.length);
    trackIdLastSeenRef.current.clear();
    clearOverlay();
  }, [clearOverlay, preferencesRef]);

  const cancelScheduledDetectionFrame = useCallback(() => {
    if (videoFrameCallbackRef.current !== null) {
      videoRef.current?.cancelVideoFrameCallback(videoFrameCallbackRef.current);
      videoFrameCallbackRef.current = null;
    }
  }, [videoRef]);

  const scheduleDetectionFrame = useCallback(() => {
    if (!detectingRef.current || detectorModeRef.current === 'stream') {
      return;
    }
    if (videoFrameCallbackRef.current !== null) {
      return;
    }

    const video = videoRef.current;
    if (!video) {
      return;
    }

    videoFrameCallbackRef.current = video.requestVideoFrameCallback(() => {
      videoFrameCallbackRef.current = null;
      runDetectionRef.current?.();
    });
  }, [videoRef]);

  const handleDetectorResult = useCallback((result: DetectorResult, captureMs: number, loopStartedAt: number | null) => {
    const activePreferences = preferencesRef.current;
    const frameWidth = result.frame.width;
    const sorted = [...result.detections].sort((a, b) => b.score - a.score);
    setDetections(sorted);

    if (sorted.length > 0 && sorted[0].label === 'hand') {
      const playerCount = activePreferences.playerCount;
      const handDetections = sorted.filter((detection): detection is HandGestureDetection => detection.label === 'hand');
      setPlayerDetections(assignHandDetectionsToPlayerSections(
        handDetections,
        frameWidth,
        activePreferences.cameraMirrored,
        playerCount
      ));
      setPlayerPositions(getDefaultPlayerPositions(playerCount));
      
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
      return;
    }

    const persons = sorted.filter((d): d is PersonDetection => d.label === 'person');
    const playerCount = activePreferences.playerCount;
    const fallbackPositions = getDefaultPlayerPositions(playerCount);
    if (playerTrackIdsRef.current.length !== playerCount) {
      playerTrackIdsRef.current = createEmptyTrackIds(playerCount);
    }

    const hasTrackingIds = persons.some((d) => d.id !== undefined);
    let finalPositions: number[];
    let finalDetections: Array<PersonDetection | null> = Array.from(
      { length: playerCount },
      (): PersonDetection | null => null
    );

    if (hasTrackingIds) {
      const now = performance.now();
      const TRACK_TIMEOUT_MS = 2000;

      persons.forEach((d) => {
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
        const match = persons.find((d) => d.id === trackedId);
        if (match) {
          const pos = getPersonPosition(match, frameWidth);
          nextPositions[index] = activePreferences.cameraMirrored ? 1 - pos : pos;
          finalDetections[index] = match;
          assigned.add(match);
        }
      });

      const unassignedDetections = persons
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
            finalDetections[emptySlot] = d;
            assigned.add(d);
          }
        }
      });

      finalPositions = nextPositions;
    } else {
      finalPositions = getPlayerPositions(persons, frameWidth, activePreferences.cameraMirrored, playerCount);
      const sortedByPosition = persons
        .slice(0, playerCount)
        .sort((left, right) => {
          const leftPosition = getPersonPosition(left, frameWidth);
          const rightPosition = getPersonPosition(right, frameWidth);
          return activePreferences.cameraMirrored ? rightPosition - leftPosition : leftPosition - rightPosition;
        });
      finalDetections = finalPositions.map((_, index) => sortedByPosition[index] ?? null);
    }

    setPlayerPositions(finalPositions);
    setPlayerDetections(
      activePreferences.cameraMirrored
        ? finalDetections.map((detection) => detection ? mirrorDetection(detection, frameWidth) : null)
        : finalDetections
    );
    setStatus(sorted.length ? tn('status.detectedPeople', sorted.length) : t('status.scanning'));

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
  }, [overlayRef, playerPositionsRef, preferencesRef, t, tn]);

  const stopDetection = useCallback(() => {
    detectingRef.current = false;
    setIsDetecting(false);
    cancelScheduledDetectionFrame();
    if (detectorModeRef.current === 'stream') {
      disposeDetectorRef.current?.();
      disposeDetectorRef.current = null;
      detectorRef.current = null;
      detectorModeRef.current = 'pull';
      setModelStatus(t('status.modelNotLoaded'));
    }
    setStatus(cameraEnabledRef.current ? t('status.cameraReady') : t('status.cameraIdle'));
  }, [cameraEnabledRef, cancelScheduledDetectionFrame, t]);

  const runDetection = useCallback(async () => {
    const detector = detectorRef.current;
    const video = videoRef.current;
    const frame = frameRef.current;
    const frameContext = frame?.getContext('2d', { willReadFrequently: true });

    if (!detectingRef.current || !detector || !video || !frame || !frameContext) {
      return;
    }

    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) {
      scheduleDetectionFrame();
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
      setError(cause instanceof Error ? cause.message : t('status.detectionFailed'));
      setStatus(t('status.detectionStopped'));
      return;
    }

    if (detectingRef.current) {
      scheduleDetectionFrame();
    }
  }, [frameRef, handleDetectorResult, preferencesRef, scheduleDetectionFrame, syncCanvasSize, t, videoRef]);

  useEffect(() => {
    runDetectionRef.current = () => {
      void runDetection();
    };
  }, [runDetection]);

  const loadDetector = useCallback(async () => {
    if (detectorRef.current) {
      return detectorRef.current;
    }

    const activePreferences = preferencesRef.current;
    setIsLoading(true);
    setModelStatus(t('status.loadingModel'));

    try {
      const { detector, runtime, fallbackReason, dispose, mode } = await loadDetectorClient({
        task,
        backend: activePreferences.selectedBackendId,
        modelId: activePreferences.selectedModelId,
        runtime: activePreferences.selectedRuntimeId,
        quantization: activePreferences.selectedQuantizationId,
        mediaPipeModelId: activePreferences.selectedMediaPipeModelId,
        mediaPipeDelegate: activePreferences.selectedMediaPipeDelegateId,
        playerCount: activePreferences.playerCount,
        threshold: activePreferences.threshold,
        stream: streamRef.current ?? undefined,
        onStatusChange: ({ message }) => setModelStatus(translateDetectorStatus(message, t)),
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
          setStatus(t('status.detectionStopped'));
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
        fallbackReason
          ? t('status.modelReadyFallback', { runtime: runtimeLabel, reason: fallbackReason })
          : t('status.modelReady', { runtime: runtimeLabel })
      );
      return detectorRef.current;
    } finally {
      setIsLoading(false);
    }
  }, [handleDetectorResult, preferencesRef, streamRef, syncCanvasSize, t, task]);

  const resetDetector = useCallback(() => {
    stopDetection();
    disposeDetectorRef.current?.();
    disposeDetectorRef.current = null;
    detectorRef.current = null;
    detectorModeRef.current = 'pull';
    clearDetectionState();
    setModelStatus(t('status.modelNotLoaded'));
  }, [clearDetectionState, stopDetection, t]);

  const startDetection = useCallback(async () => {
    setError(null);

    if (!streamRef.current) {
      setStatus(t('status.requestingCamera'));
      try {
        await startCamera();
        setStatus(t('status.cameraReady'));
      } catch (cause: unknown) {
        setError(cause instanceof Error ? cause.message : t('status.cameraDenied'));
        setStatus(t('status.cameraBlocked'));
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
      setStatus(t('status.scanning'));
      if (detectorModeRef.current !== 'stream') {
        scheduleDetectionFrame();
      }
      return true;
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : t('status.detectorLoadFailed'));
      setStatus(t('status.detectorUnavailable'));
      setIsDetecting(false);
      detectingRef.current = false;
      return false;
    }
  }, [loadDetector, scheduleDetectionFrame, startCamera, streamRef, t, videoRef]);

  useEffect(() => {
    return () => {
      detectingRef.current = false;
      cancelScheduledDetectionFrame();
      disposeDetectorRef.current?.();
    };
  }, [cancelScheduledDetectionFrame]);

  useEffect(() => {
    const fallbackPositions = getDefaultPlayerPositions(preferences.playerCount);
    setPlayerPositions(fallbackPositions);
    setPlayerDetections(Array.from({ length: fallbackPositions.length }, () => null));
    playerTrackIdsRef.current = createEmptyTrackIds(fallbackPositions.length);
    trackIdLastSeenRef.current.clear();
  }, [preferences.playerCount]);

  return {
    isDetecting,
    isLoading,
    status,
    modelStatus,
    detections,
    playerDetections,
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
