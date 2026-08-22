import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import {
  MEDIAPIPE_MODELS,
  YOLO_MODELS,
  type DetectorBackendId,
  type DetectorQuantizationId,
  type DetectorRuntimeId,
  type MediaPipeDelegateId,
  type MediaPipeModelId,
  type YoloModelId,
} from '../pose-detection/aiDetector';
import {
  readStoredAppPreferences,
  writeStoredAppPreferences,
} from './appPreferences';
import {
  appPreferencesReducer,
  getDetectorConfigurationKey,
} from './appPreferencesReducer';
import type { JumpDuckGuide } from '../motion-mapping/jumpDuckActions';
import { CameraFeedbackPanel } from '../ui/CameraFeedbackPanel';
import { DetectionControls } from '../ui/DetectionControls';
import type { GamePhase, RunnerGameId } from '../game/gameTypes';
import { getRunnerLevel, RUNNER_LEVELS } from '../game/levelRegistry';
import { useI18n } from './i18n';
import { useCameraController } from '../hooks/useCameraController';
import { useMotionDetector } from '../hooks/useMotionDetector';
import '../App.css';

const GameScene = lazy(async () => {
  const module = await import('../game/GameScene');
  return { default: module.GameScene };
});
const TrackingInternalsDocs = lazy(async () => {
  const module = await import('../ui/TrackingInternalsDocs');
  return { default: module.TrackingInternalsDocs };
});

function LoadingRegion(): ReactElement {
  return <div aria-busy="true" className="loading-region" />;
}

function App(): ReactElement {
  if (window.location.pathname === '/docs/tracking-internals') {
    return (
      <main className="app-shell docs-page-shell">
        <Suspense fallback={<LoadingRegion />}>
          <TrackingInternalsDocs />
        </Suspense>
      </main>
    );
  }

  return <MotionRunnerApp />;
}

function MotionRunnerApp(): ReactElement {
  const { t } = useI18n();
  const [preferences, dispatchPreferences] = useReducer(
    appPreferencesReducer,
    undefined,
    readStoredAppPreferences
  );
  const [gamePhase, setGamePhase] = useState<GamePhase>('ready');
  const [jumpDuckGuides, setJumpDuckGuides] = useState<JumpDuckGuide[]>([]);
  const detectorConfigurationKey = getDetectorConfigurationKey(preferences);
  const previousDetectorConfigurationKeyRef = useRef(detectorConfigurationKey);

  const detectorTask = useMemo(() => {
    return getRunnerLevel(preferences.selectedRunnerGameId).detectorTask;
  }, [preferences.selectedRunnerGameId]);
  const handlePreferencesReplacement = useCallback((nextPreferences: typeof preferences) => {
    dispatchPreferences({ type: 'replace', preferences: nextPreferences });
  }, []);

  const camera = useCameraController({
    preferences,
    onPreferencesChange: handlePreferencesReplacement,
    onCameraRestart: () => {
      detector.stopDetection();
      detector.clearDetectionState();
      setGamePhase('ready');
    },
  });
  const detector = useMotionDetector({
    task: detectorTask,
    preferences,
    cameraEnabled: camera.cameraEnabled,
    videoRef: camera.videoRef,
    overlayRef: camera.overlayRef,
    streamRef: camera.streamRef,
    startCamera: camera.startCameraWithPreferences,
    syncCanvasSize: camera.syncCanvasSize,
    clearOverlay: camera.clearOverlay,
  });

  useEffect(() => {
    writeStoredAppPreferences(preferences);
  }, [preferences]);

  useEffect(() => {
    if (previousDetectorConfigurationKeyRef.current === detectorConfigurationKey) {
      return;
    }
    previousDetectorConfigurationKeyRef.current = detectorConfigurationKey;
    detector.resetDetector();
    setGamePhase('ready');
  }, [detector, detectorConfigurationKey]);

  const selectedTrackerLabel = useMemo(() => {
    if (preferences.selectedBackendId === 'python-webrtc') {
      return 'Python WebRTC';
    }

    if (preferences.selectedBackendId === 'mediapipe') {
      const model =
        MEDIAPIPE_MODELS.find((item) => item.id === preferences.selectedMediaPipeModelId) ?? MEDIAPIPE_MODELS[0];
      return `MediaPipe ${model.label}`;
    }

    const model = YOLO_MODELS.find((item) => item.id === preferences.selectedModelId) ?? YOLO_MODELS[0];
    return model.label;
  }, [preferences.selectedBackendId, preferences.selectedMediaPipeModelId, preferences.selectedModelId]);

  const handleBackendChange = useCallback((selectedBackendId: DetectorBackendId) => {
    dispatchPreferences({ type: 'backendSelected', backendId: selectedBackendId });
  }, []);

  const handleGameIdChange = useCallback((selectedRunnerGameId: RunnerGameId) => {
    dispatchPreferences({ type: 'gameSelected', gameId: selectedRunnerGameId });
  }, []);

  const handleModelChange = useCallback((selectedModelId: YoloModelId) => {
    dispatchPreferences({ type: 'yoloModelSelected', modelId: selectedModelId });
  }, []);

  const handleMediaPipeModelChange = useCallback((selectedMediaPipeModelId: MediaPipeModelId) => {
    dispatchPreferences({ type: 'mediaPipeModelSelected', modelId: selectedMediaPipeModelId });
  }, []);

  const handleMediaPipeDelegateChange = useCallback((selectedMediaPipeDelegateId: MediaPipeDelegateId) => {
    dispatchPreferences({ type: 'mediaPipeDelegateSelected', delegateId: selectedMediaPipeDelegateId });
  }, []);

  const handleRuntimeChange = useCallback((selectedRuntimeId: DetectorRuntimeId) => {
    dispatchPreferences({ type: 'runtimeSelected', runtimeId: selectedRuntimeId });
  }, []);

  const handleQuantizationChange = useCallback((selectedQuantizationId: DetectorQuantizationId) => {
    dispatchPreferences({ type: 'quantizationSelected', quantizationId: selectedQuantizationId });
  }, []);

  const handlePlayerCountChange = useCallback((playerCount: number) => {
    dispatchPreferences({ type: 'playerCountChanged', playerCount });
  }, []);

  const handleThresholdChange = useCallback((threshold: number) => {
    dispatchPreferences({ type: 'thresholdChanged', threshold });
  }, []);

  const handleStopCamera = useCallback(() => {
    detector.stopDetection();
    camera.stopCamera();
    detector.clearDetectionState();
    camera.clearError();
    setGamePhase('ready');
  }, [camera, detector]);

  const handleStartRun = useCallback(async () => {
    camera.clearError();
    const started = await detector.startDetection();
    if (started) {
      setGamePhase('running');
    }
  }, [camera, detector]);

  const handlePauseRun = useCallback(() => {
    detector.stopDetection();
    setGamePhase('paused');
  }, [detector]);

  const handleGameSelection = useCallback((selectedRunnerGameId: RunnerGameId) => {
    if (gamePhase === 'running') {
      handlePauseRun();
    }
    handleGameIdChange(selectedRunnerGameId);
  }, [gamePhase, handleGameIdChange, handlePauseRun]);

  const handleJumpDuckGuidesChange = useCallback((guides: JumpDuckGuide[]) => {
    setJumpDuckGuides(guides);
  }, []);

  const startLabel = camera.cameraEnabled ? t('app.startRun') : t('app.enableCamera');

  return (
    <main className="app-shell">
      <section className="workspace" aria-label={t('app.workspace')}>
        <section className="game-stage" aria-label={t('app.mainGame')}>
          <Suspense fallback={<LoadingRegion />}>
            <GameScene
              phase={gamePhase}
              playerCount={preferences.playerCount}
              handRhythmGridSize={preferences.handRhythmGridSize}
              gameplayInputRef={detector.gameplayInputRef}
              selectedGameId={preferences.selectedRunnerGameId}
              onJumpDuckGuidesChange={handleJumpDuckGuidesChange}
            />
          </Suspense>
        </section>

        <aside className="control-panel" aria-label={t('app.detectionControls')}>
          <CameraFeedbackPanel
            cameraEnabled={camera.cameraEnabled}
            cameraMirrored={preferences.cameraMirrored}
            showCameraPreview={preferences.showCameraPreview}
            frameRef={camera.frameRef}
            jumpDuckGuides={jumpDuckGuides}
            handRhythmGridSize={preferences.handRhythmGridSize}
            showHandRhythmGrid={preferences.selectedRunnerGameId === 'hand-rhythm'}
            overlayRef={camera.overlayRef}
            playerPositions={detector.playerPositions}
            selectedTrackerLabel={selectedTrackerLabel}
            videoRef={camera.videoRef}
            onLoadedMetadata={camera.syncCanvasSize}
          />

          <section className="run-panel" aria-label={t('game.controls')}>
            <div className="game-mode-selector" aria-label={t('game.modeSelector')}>
              {RUNNER_LEVELS.map((level) => (
                <button
                  key={level.id}
                  type="button"
                  className={preferences.selectedRunnerGameId === level.id ? 'active' : ''}
                  aria-pressed={preferences.selectedRunnerGameId === level.id}
                  onClick={() => handleGameSelection(level.id)}
                >
                  {t(level.modeLabelKey)}
                </button>
              ))}
            </div>
            <div className="run-controls">
              <button
                className="primary-action"
                type="button"
                disabled={detector.isLoading || gamePhase === 'running'}
                onClick={handleStartRun}
              >
                {detector.isLoading ? t('app.loadingModel') : startLabel}
              </button>
              <button type="button" disabled={gamePhase !== 'running'} onClick={handlePauseRun}>
                {t('game.pause')}
              </button>
            </div>
          </section>

          <DetectionControls
            task={detectorTask}
            detections={detector.detections}
            error={detector.error ?? camera.error}
            frameTimings={detector.frameTimings}
            isLoading={detector.isLoading}
            lastInferenceMs={detector.lastInferenceMs}
            modelStatus={detector.modelStatus}
            preferences={preferences}
            status={detector.status}
            stopDisabled={!camera.cameraEnabled && !detector.isDetecting}
            onBackendChange={handleBackendChange}
            cameraOptions={camera.cameraOptions}
            selectedCameraValue={camera.selectedCameraValue}
            onCameraChange={camera.changeCamera}
            onDevCameraMultiplierChange={camera.changeDevCameraMultiplier}
            onCameraMirrorChange={(mirrored) => dispatchPreferences({ type: 'cameraMirrorChanged', mirrored })}
            onCameraPreviewChange={(visible) => dispatchPreferences({ type: 'cameraPreviewChanged', visible })}
            onMediaPipeDelegateChange={handleMediaPipeDelegateChange}
            onMediaPipeModelChange={handleMediaPipeModelChange}
            onModelChange={handleModelChange}
            onPlayerCountChange={handlePlayerCountChange}
            onHandRhythmGridSizeChange={(gridSize) => dispatchPreferences({ type: 'handRhythmGridChanged', gridSize })}
            onQuantizationChange={handleQuantizationChange}
            onRuntimeChange={handleRuntimeChange}
            onStopCamera={handleStopCamera}
            onThresholdChange={handleThresholdChange}
          />
        </aside>
      </section>
    </main>
  );
}

export default App;
