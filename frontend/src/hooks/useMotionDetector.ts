import { useCallback, useEffect, useRef, useState } from 'react';
import type { DetectorResult } from '../pose-detection/aiDetector';
import type { HandGestureDetection, PersonDetection } from '../pose-detection/detectionSchema';
import { createCameraFrame } from '../pose-detection/detectionSchema';
import { isStaleDetectorResultError } from '../pose-detection/detectorClient';
import { useI18n } from '../app/i18n';
import {
  assignHandsToPlayerSections,
  getDefaultPlayerPositions,
} from '../motion-mapping/playerPositions';
import {
  assignPlayerDetections,
  createPlayerTrackingState,
} from '../motion-mapping/playerTracking';
import {
  assignHandsByNearestPosition,
  createHandTrackingState,
} from '../motion-mapping/handTracking';
import { drawDetections } from '../motion-mapping/poseOverlay';
import {
  createEmptyGameplayInputFrame,
  toHandInput,
  type HandInput,
  toPoseInput,
  type GameplayInputFrame,
} from '../motion-mapping/gameplayInput';
import { getDetectorFrameSize, scaleDetectorResultToFrame } from './detectorFrameScaling';
import { DETECTOR_UI_UPDATE_INTERVAL_MS, createEmptyPlayerDetections, createFrameTimings, isMediaPipeBackend, mirrorDetection } from './motionDetectorHelpers';
import type { FrameTimings, MotionDetectorControls, UseMotionDetectorOptions } from './motionDetectorTypes';
import { useLatest } from './useLatest';
import { useDetectorSession } from './useDetectorSession';

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
  const videoFrameCallbackRef = useRef<number | null>(null);
  const runDetectionRef = useRef<(() => void) | null>(null);
  const detectorResultHandlerRef = useRef<((result: DetectorResult, captureMs: number, loopStartedAt: number | null) => void) | null>(null);
  const detectingRef = useRef(false);
  const frameSequenceRef = useRef(0);
  const preferencesRef = useLatest(preferences);
  const cameraEnabledRef = useLatest(cameraEnabled);
  const initialPlayerPositions = getDefaultPlayerPositions(preferences.playerCount);
  const initialPlayerDetections = createEmptyPlayerDetections(preferences.playerCount);

  const [isDetecting, setIsDetecting] = useState(false);
  const [status, setStatus] = useState(t('status.cameraIdle'));
  const [detections, setDetections] = useState<Array<PersonDetection | HandGestureDetection>>([]);
  const [lastInferenceMs, setLastInferenceMs] = useState<number | null>(null);
  const [frameTimings, setFrameTimings] = useState<FrameTimings | null>(null);
  const [playerPositions, setPlayerPositions] = useState<number[]>(initialPlayerPositions);
  const playerPositionsRef = useRef<number[]>(initialPlayerPositions);
  const playerDetectionsRef = useRef<Array<PersonDetection | HandGestureDetection | null>>(initialPlayerDetections);
  const gameplayInputRef = useRef<GameplayInputFrame>(
    createEmptyGameplayInputFrame(task, initialPlayerPositions)
  );
  const [error, setError] = useState<string | null>(null);
  const playerTrackingStateRef = useRef(createPlayerTrackingState(initialPlayerPositions.length));
  const handTrackingStateRef = useRef(createHandTrackingState(initialPlayerPositions.length));
  const lastUiPublishAtRef = useRef(0);

  const handleStreamError = useCallback((cause: Error) => {
    if (!detectingRef.current) {
      return;
    }
    detectingRef.current = false;
    setIsDetecting(false);
    setError(cause.message);
    setStatus(t('status.detectionStopped'));
  }, [t]);

  const detectorSession = useDetectorSession({
    task,
    preferencesRef,
    streamRef,
    onStreamResult: (result) => {
      if (!detectingRef.current) {
        return;
      }
      syncCanvasSize();
      detectorResultHandlerRef.current?.(result, 0, null);
    },
    onStreamError: handleStreamError,
  });

  const clearDetectionState = useCallback(() => {
    const fallbackPositions = getDefaultPlayerPositions(preferencesRef.current.playerCount);
    const fallbackDetections = createEmptyPlayerDetections(fallbackPositions.length);
    playerPositionsRef.current = fallbackPositions;
    playerDetectionsRef.current = fallbackDetections;
    gameplayInputRef.current = createEmptyGameplayInputFrame(task, fallbackPositions);
    lastUiPublishAtRef.current = 0;
    setDetections([]);
    setLastInferenceMs(null);
    setFrameTimings(null);
    setPlayerPositions(fallbackPositions);
    playerTrackingStateRef.current = createPlayerTrackingState(fallbackPositions.length);
    handTrackingStateRef.current = createHandTrackingState(fallbackPositions.length);
    clearOverlay();
  }, [clearOverlay, preferencesRef, task]);

  const cancelScheduledDetectionFrame = useCallback(() => {
    if (videoFrameCallbackRef.current !== null) {
      videoRef.current?.cancelVideoFrameCallback(videoFrameCallbackRef.current);
      videoFrameCallbackRef.current = null;
    }
  }, [videoRef]);

  const scheduleDetectionFrame = useCallback(() => {
    if (!detectingRef.current || detectorSession.modeRef.current === 'stream') {
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
  }, [detectorSession.modeRef, videoRef]);

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
      const assignedHandDetections = assignHandsToPlayerSections(
        handDetections,
        frameWidth,
        activePreferences.cameraMirrored,
        playerCount
      ).map((detections) => detections.map((detection) => activePreferences.cameraMirrored
        ? mirrorDetection(detection, frameWidth)
        : detection));
      const detectedHands = assignedHandDetections.map((detections) =>
        detections
          .map((detection) => toHandInput(detection, result.frame.width, result.frame.height))
          .filter((hand): hand is HandInput => hand !== null)
      );
      const handTracking = assignHandsByNearestPosition(
        detectedHands,
        handTrackingStateRef.current
      );
      handTrackingStateRef.current = handTracking.state;
      const assignedHands = handTracking.handsByPlayer;

      publishPlayerState(
        getDefaultPlayerPositions(playerCount),
        assignedHandDetections.map((detections) => detections[0] ?? null)
      );
      gameplayInputRef.current = {
        kind: 'gesture',
        players: assignedHands.map((hands) => ({ hand: hands.find((hand) => hand !== null) ?? null, hands })),
      };
      
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
    const trackingResult = assignPlayerDetections({
      detections: persons,
      frameWidth,
      mirrored: activePreferences.cameraMirrored,
      playerCount,
      previousPositions: playerPositionsRef.current,
      previousState: playerTrackingStateRef.current,
      nowMs: analysisStartedAt,
    });
    const finalPositions = trackingResult.positions;
    const finalDetections = trackingResult.detections;
    playerTrackingStateRef.current = trackingResult.state;

    const displayDetections =
      activePreferences.cameraMirrored
        ? finalDetections.map((detection) => detection ? mirrorDetection(detection, frameWidth) : null)
        : finalDetections;
    publishPlayerState(finalPositions, displayDetections);
    gameplayInputRef.current = {
      kind: 'pose',
      players: finalPositions.map((normalizedX, index) => ({
        normalizedX,
        pose: toPoseInput(displayDetections[index] ?? null),
      })),
    };

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

  useEffect(() => {
    detectorResultHandlerRef.current = handleDetectorResult;
  }, [handleDetectorResult]);

  const stopDetection = useCallback(() => {
    detectingRef.current = false;
    setIsDetecting(false);
    cancelScheduledDetectionFrame();
    detectorSession.disposeStreamingDetector();
    setStatus(cameraEnabledRef.current ? t('status.cameraReady') : t('status.cameraIdle'));
  }, [cameraEnabledRef, cancelScheduledDetectionFrame, detectorSession, t]);

  const runDetection = useCallback(async () => {
    const detector = detectorSession.detectorRef.current;
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
      if (isStaleDetectorResultError(cause)) {
        scheduleDetectionFrame();
        return;
      }

      detectingRef.current = false;
      setIsDetecting(false);
      setError(cause instanceof Error ? cause.message : t('status.detectionFailed'));
      setStatus(t('status.detectionStopped'));
    }

    if (detectingRef.current) {
      scheduleDetectionFrame();
    }
  }, [detectorSession.detectorRef, handleDetectorResult, preferencesRef, scheduleDetectionFrame, syncCanvasSize, t, task, videoRef]);

  useEffect(() => {
    runDetectionRef.current = () => { void runDetection(); };
  }, [runDetection]);

  const resetDetector = useCallback(() => {
    stopDetection();
    detectorSession.disposeDetector();
    clearDetectionState();
  }, [clearDetectionState, detectorSession, stopDetection]);

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
      await detectorSession.loadDetector();
      detectingRef.current = true;
      setIsDetecting(true);
      setStatus(t('status.scanning'));
      if (detectorSession.modeRef.current !== 'stream') {
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
  }, [detectorSession, scheduleDetectionFrame, startCamera, streamRef, t, videoRef]);

  useEffect(() => {
    return () => {
      detectingRef.current = false;
      cancelScheduledDetectionFrame();
    };
  }, [cancelScheduledDetectionFrame]);

  useEffect(() => {
    const fallbackPositions = getDefaultPlayerPositions(preferences.playerCount);
    const fallbackDetections = createEmptyPlayerDetections(fallbackPositions.length);
    playerPositionsRef.current = fallbackPositions;
    playerDetectionsRef.current = fallbackDetections;
    gameplayInputRef.current = createEmptyGameplayInputFrame(task, fallbackPositions);
    lastUiPublishAtRef.current = 0;
    setPlayerPositions(fallbackPositions);
    playerTrackingStateRef.current = createPlayerTrackingState(fallbackPositions.length);
  }, [preferences.playerCount, task]);

  return {
    isDetecting,
    isLoading: detectorSession.isLoading,
    status,
    modelStatus: detectorSession.modelStatus,
    detections,
    lastInferenceMs,
    frameTimings,
    playerPositions,
    playerPositionsRef,
    gameplayInputRef,
    error,
    clearDetectionState,
    resetDetector,
    startDetection,
    stopDetection,
  };
}
