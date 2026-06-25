import { useCallback, useEffect, useRef, useState } from 'react';
import type { Detector, DetectorLoadResult, DetectorResult } from '../pose-detection/aiDetector';
import type { HandGestureDetection, PersonDetection } from '../pose-detection/detectionSchema';
import { createCameraFrame } from '../pose-detection/detectionSchema';
import { loadDetectorClient } from '../pose-detection/detectorClient';
import { translateDetectorStatus, useI18n } from '../app/i18n';
import {
  assignHandDetectionsToPlayerSections,
  getDefaultPlayerPositions,
  getPlayerPositions,
  getPersonPosition,
} from '../motion-mapping/playerPositions';
import { drawDetections } from '../motion-mapping/poseOverlay';
import { getDetectorFrameSize, scaleDetectorResultToFrame } from './detectorFrameScaling';
import { DETECTOR_UI_UPDATE_INTERVAL_MS, createEmptyPlayerDetections, createEmptyTrackIds, createFrameTimings, isMediaPipeBackend, mirrorDetection } from './motionDetectorHelpers';
import type { FrameTimings, MotionDetectorControls, UseMotionDetectorOptions } from './motionDetectorTypes';
import { useLatest } from './useLatest';

export function useMotionDetector({
  task,
  preferences,
  cameraEnabled,
  videoRef,
  overlayRef,
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
  const initialPlayerDetections = createEmptyPlayerDetections(preferences.playerCount);

  const [isDetecting, setIsDetecting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState(t('status.cameraIdle'));
  const [modelStatus, setModelStatus] = useState(t('status.modelNotLoaded'));
  const [detections, setDetections] = useState<Array<PersonDetection | HandGestureDetection>>([]);
  const [playerDetections, setPlayerDetections] =
    useState<Array<PersonDetection | HandGestureDetection | null>>(initialPlayerDetections);
  const [lastInferenceMs, setLastInferenceMs] = useState<number | null>(null);
  const [frameTimings, setFrameTimings] = useState<FrameTimings | null>(null);
  const [playerPositions, setPlayerPositions] = useState<number[]>(initialPlayerPositions);
  const playerPositionsRef = useRef<number[]>(initialPlayerPositions);
  const playerDetectionsRef = useRef<Array<PersonDetection | HandGestureDetection | null>>(initialPlayerDetections);
  const [error, setError] = useState<string | null>(null);
  const playerTrackIdsRef = useRef<Array<number | null>>(createEmptyTrackIds(initialPlayerPositions.length));
  const trackIdLastSeenRef = useRef<Map<number, number>>(new Map());
  const lastUiPublishAtRef = useRef(0);

  const clearDetectionState = useCallback(() => {
    const fallbackPositions = getDefaultPlayerPositions(preferencesRef.current.playerCount);
    const fallbackDetections = createEmptyPlayerDetections(fallbackPositions.length);
    playerPositionsRef.current = fallbackPositions;
    playerDetectionsRef.current = fallbackDetections;
    lastUiPublishAtRef.current = 0;
    setDetections([]);
    setPlayerDetections(fallbackDetections);
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
    const analysisStartedAt = performance.now();
    const activePreferences = preferencesRef.current;
    const frameWidth = result.frame.width;
    const sorted = [...result.detections].sort((a, b) => b.score - a.score);
    const shouldPublishUi =
      lastUiPublishAtRef.current === 0 ||
      analysisStartedAt - lastUiPublishAtRef.current >= DETECTOR_UI_UPDATE_INTERVAL_MS;

    if (shouldPublishUi) {
      lastUiPublishAtRef.current = analysisStartedAt;
      setDetections(sorted);
    }

    const publishPlayerState = (
      positions: number[],
      detectionsForPlayers: Array<PersonDetection | HandGestureDetection | null>
    ): void => {
      playerPositionsRef.current = positions;
      playerDetectionsRef.current = detectionsForPlayers;

      if (shouldPublishUi) {
        setPlayerPositions(positions);
        setPlayerDetections(detectionsForPlayers);
      }
    };

    const publishFrameTimings = (analysisMs: number, drawMs: number, drawDoneAt: number): void => {
      if (shouldPublishUi) {
        setLastInferenceMs(Math.round(result.timings.totalMs));
        setFrameTimings(createFrameTimings(result, captureMs, analysisMs, drawMs, loopStartedAt, drawDoneAt));
      }
    };

    if (sorted.length > 0 && sorted[0].label === 'hand') {
      const playerCount = activePreferences.playerCount;
      const handDetections = sorted.filter((detection): detection is HandGestureDetection => detection.label === 'hand');
      publishPlayerState(
        getDefaultPlayerPositions(playerCount),
        assignHandDetectionsToPlayerSections(
          handDetections,
          frameWidth,
          activePreferences.cameraMirrored,
          playerCount
        )
      );
      
      const drawStartedAt = performance.now();
      const analysisMs = drawStartedAt - analysisStartedAt;
      const overlay = overlayRef.current;
      if (overlay) {
        drawDetections(overlay, sorted);
      }
      const drawDoneAt = performance.now();
      publishFrameTimings(analysisMs, drawDoneAt - drawStartedAt, drawDoneAt);
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

    const displayDetections =
      activePreferences.cameraMirrored
        ? finalDetections.map((detection) => detection ? mirrorDetection(detection, frameWidth) : null)
        : finalDetections;
    publishPlayerState(finalPositions, displayDetections);

    if (shouldPublishUi) {
      setStatus(sorted.length ? tn('status.detectedPeople', sorted.length) : t('status.scanning'));
    }

    const drawStartedAt = performance.now();
    const analysisMs = drawStartedAt - analysisStartedAt;
    const overlay = overlayRef.current;
    if (overlay) {
      drawDetections(overlay, sorted);
    }
    const drawDoneAt = performance.now();
    publishFrameTimings(analysisMs, drawDoneAt - drawStartedAt, drawDoneAt);
  }, [overlayRef, preferencesRef, t, tn]);

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

    if (!detectingRef.current || !detector || !video) {
      return;
    }

    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) {
      scheduleDetectionFrame();
      return;
    }

    const loopStartedAt = performance.now();
    syncCanvasSize();
    const activePreferences = preferencesRef.current;
    const usesFullFrameDetectorInput = isMediaPipeBackend(activePreferences);
    let bitmap: ImageBitmap;

    if (usesFullFrameDetectorInput) {
      bitmap = await createImageBitmap(video);
    } else {
      const detectorFrameSize = getDetectorFrameSize(video.videoWidth, video.videoHeight, task);
      bitmap = await createImageBitmap(video, {
        resizeWidth: detectorFrameSize.width,
        resizeHeight: detectorFrameSize.height,
        resizeQuality: 'pixelated',
      });
    }

    const captureDoneAt = performance.now();
    frameSequenceRef.current += 1;
    const cameraFrame = createCameraFrame(bitmap, `camera-frame-${frameSequenceRef.current}`, loopStartedAt);

    try {
      const result = await detector(cameraFrame, {
        threshold: activePreferences.threshold,
        percentage: false,
      });
      const displayResult = usesFullFrameDetectorInput
        ? result
        : scaleDetectorResultToFrame(result, video.videoWidth, video.videoHeight);

      handleDetectorResult(
        displayResult,
        captureDoneAt - loopStartedAt,
        loopStartedAt
      );
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
  }, [handleDetectorResult, preferencesRef, scheduleDetectionFrame, syncCanvasSize, t, task, videoRef]);

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
    const fallbackDetections = createEmptyPlayerDetections(fallbackPositions.length);
    playerPositionsRef.current = fallbackPositions;
    playerDetectionsRef.current = fallbackDetections;
    lastUiPublishAtRef.current = 0;
    setPlayerPositions(fallbackPositions);
    setPlayerDetections(fallbackDetections);
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
    playerDetectionsRef,
    lastInferenceMs,
    frameTimings,
    playerPositions,
    playerPositionsRef,
    error,
    clearDetectionState,
    resetDetector,
    startDetection,
    stopDetection,
  };
}
