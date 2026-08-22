import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { translateDetectorStatus, useI18n } from '../app/i18n';
import type { AppPreferences } from '../app/appPreferences';
import type {
  Detector,
  DetectorLoadResult,
  DetectorResult,
  DetectorTask,
} from '../pose-detection/aiDetector';
import { loadDetectorClient } from '../pose-detection/detectorClient';
import { useLatest } from './useLatest';

type UseDetectorSessionOptions = {
  task: DetectorTask;
  preferencesRef: RefObject<AppPreferences>;
  streamRef: RefObject<MediaStream | null>;
  onStreamResult: (result: DetectorResult) => void;
  onStreamError: (error: Error) => void;
};

export type DetectorSessionControls = {
  detectorRef: RefObject<Detector | null>;
  modeRef: RefObject<DetectorLoadResult['mode']>;
  isLoading: boolean;
  modelStatus: string;
  loadDetector: () => Promise<Detector>;
  disposeDetector: () => void;
  disposeStreamingDetector: () => boolean;
};

export function useDetectorSession({
  task,
  preferencesRef,
  streamRef,
  onStreamResult,
  onStreamError,
}: UseDetectorSessionOptions): DetectorSessionControls {
  const { t } = useI18n();
  const detectorRef = useRef<Detector | null>(null);
  const modeRef = useRef<DetectorLoadResult['mode']>('pull');
  const disposeRef = useRef<(() => void) | null>(null);
  const streamResultRef = useLatest(onStreamResult);
  const streamErrorRef = useLatest(onStreamError);
  const [isLoading, setIsLoading] = useState(false);
  const [modelStatus, setModelStatus] = useState(t('status.modelNotLoaded'));

  const disposeDetector = useCallback(() => {
    disposeRef.current?.();
    disposeRef.current = null;
    detectorRef.current = null;
    modeRef.current = 'pull';
    setModelStatus(t('status.modelNotLoaded'));
  }, [t]);

  const disposeStreamingDetector = useCallback(() => {
    if (modeRef.current !== 'stream') {
      return false;
    }
    disposeDetector();
    return true;
  }, [disposeDetector]);

  const loadDetector = useCallback(async () => {
    if (detectorRef.current) {
      return detectorRef.current;
    }

    const preferences = preferencesRef.current;
    setIsLoading(true);
    setModelStatus(t('status.loadingModel'));

    try {
      const { detector, runtime, fallbackReason, dispose, mode } = await loadDetectorClient({
        task,
        backend: preferences.selectedBackendId,
        modelId: preferences.selectedModelId,
        runtime: preferences.selectedRuntimeId,
        quantization: preferences.selectedQuantizationId,
        mediaPipeModelId: preferences.selectedMediaPipeModelId,
        mediaPipeDelegate: preferences.selectedMediaPipeDelegateId,
        playerCount: preferences.playerCount,
        threshold: preferences.threshold,
        stream: streamRef.current ?? undefined,
        onStatusChange: ({ message }) => setModelStatus(translateDetectorStatus(message, t)),
        onResult: (result) => streamResultRef.current(result),
        onError: (error) => streamErrorRef.current(error),
      });
      detectorRef.current = detector;
      modeRef.current = mode ?? 'pull';
      disposeRef.current = dispose ?? null;
      const runtimeLabel = preferences.selectedBackendId === 'mediapipe' ||
        preferences.selectedBackendId === 'python-webrtc'
        ? runtime
        : `${runtime} ${preferences.selectedQuantizationId.toUpperCase()}`;
      setModelStatus(
        fallbackReason
          ? t('status.modelReadyFallback', { runtime: runtimeLabel, reason: fallbackReason })
          : t('status.modelReady', { runtime: runtimeLabel })
      );
      return detector;
    } finally {
      setIsLoading(false);
    }
  }, [preferencesRef, streamErrorRef, streamRef, streamResultRef, t, task]);

  useEffect(() => {
    return () => {
      disposeRef.current?.();
      disposeRef.current = null;
      detectorRef.current = null;
    };
  }, []);

  return {
    detectorRef,
    modeRef,
    isLoading,
    modelStatus,
    loadDetector,
    disposeDetector,
    disposeStreamingDetector,
  };
}
