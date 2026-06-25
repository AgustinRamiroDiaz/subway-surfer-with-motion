import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  MEDIAPIPE_MODELS,
  YOLO_MODELS,
  type DetectorBackendId,
  type DetectorQuantizationId,
  type DetectorRuntimeId,
  type MediaPipeDelegateId,
  type MediaPipeModelId,
  type YoloModelId,
  getAvailableQuantizations,
  getDefaultQuantizationForRuntime,
} from '../pose-detection/aiDetector';
import {
  type AppPreferences,
  readStoredAppPreferences,
  writeStoredAppPreferences,
} from './appPreferences';
import type { JumpDuckGuide } from '../motion-mapping/jumpDuckActions';
import { CameraFeedbackPanel } from '../ui/CameraFeedbackPanel';
import { DetectionControls } from '../ui/DetectionControls';
import { GameScene, type GamePhase } from '../game/GameScene';
import type { RunnerGameId } from '../game/gameTypes';
import { useI18n } from './i18n';
import { TrackingInternalsDocs } from '../ui/TrackingInternalsDocs';
import { useCameraController } from '../hooks/useCameraController';
import { useMotionDetector } from '../hooks/useMotionDetector';
import '../App.css';

function App(): ReactElement {
  if (window.location.pathname === '/docs/tracking-internals') {
    return (
      <main className="app-shell docs-page-shell">
        <TrackingInternalsDocs />
      </main>
    );
  }

  return <MotionRunnerApp />;
}

function MotionRunnerApp(): ReactElement {
  const { t } = useI18n();
  const [preferences, setPreferences] = useState<AppPreferences>(readStoredAppPreferences);
  const [gamePhase, setGamePhase] = useState<GamePhase>('ready');
  const [jumpDuckGuides, setJumpDuckGuides] = useState<JumpDuckGuide[]>([]);

  const detectorTask = useMemo(() => {
    return preferences.selectedRunnerGameId === 'hand-rhythm' ? 'gesture' : 'pose';
  }, [preferences.selectedRunnerGameId]);

  const camera = useCameraController({
    preferences,
    setPreferences,
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

  const updatePreferences = useCallback((nextPreferences: AppPreferences, shouldResetDetector: boolean) => {
    setPreferences(nextPreferences);
    if (shouldResetDetector) {
      detector.resetDetector();
      setGamePhase('ready');
    }
  }, [detector]);

  const handleBackendChange = useCallback((selectedBackendId: DetectorBackendId) => {
    if (selectedBackendId === preferences.selectedBackendId) {
      return;
    }
    updatePreferences({ ...preferences, selectedBackendId }, true);
  }, [preferences, updatePreferences]);

  const handleGameIdChange = useCallback((selectedRunnerGameId: RunnerGameId) => {
    if (selectedRunnerGameId === preferences.selectedRunnerGameId) {
      return;
    }

    const nextTask = selectedRunnerGameId === 'hand-rhythm' ? 'gesture' : 'pose';
    const nextBackendId = nextTask === 'gesture' ? 'mediapipe-gesture' : 'mediapipe';

    updatePreferences(
      {
        ...preferences,
        selectedRunnerGameId,
        selectedBackendId: nextBackendId,
      },
      true
    );
  }, [preferences, updatePreferences]);

  const handleModelChange = useCallback((selectedModelId: YoloModelId) => {
    if (selectedModelId === preferences.selectedModelId) {
      return;
    }

    const nextQuantizations = getAvailableQuantizations(selectedModelId);
    const hasCurrentQuantization = nextQuantizations.some(
      (quantization) => quantization.dtype === preferences.selectedQuantizationId
    );
    const selectedQuantizationId = hasCurrentQuantization
      ? preferences.selectedQuantizationId
      : getDefaultQuantizationForRuntime(preferences.selectedRuntimeId);

    updatePreferences({ ...preferences, selectedModelId, selectedQuantizationId }, true);
  }, [preferences, updatePreferences]);

  const handleMediaPipeModelChange = useCallback((selectedMediaPipeModelId: MediaPipeModelId) => {
    if (selectedMediaPipeModelId === preferences.selectedMediaPipeModelId) {
      return;
    }
    updatePreferences({ ...preferences, selectedMediaPipeModelId }, true);
  }, [preferences, updatePreferences]);

  const handleMediaPipeDelegateChange = useCallback((selectedMediaPipeDelegateId: MediaPipeDelegateId) => {
    if (selectedMediaPipeDelegateId === preferences.selectedMediaPipeDelegateId) {
      return;
    }
    updatePreferences({ ...preferences, selectedMediaPipeDelegateId }, true);
  }, [preferences, updatePreferences]);

  const handleRuntimeChange = useCallback((selectedRuntimeId: DetectorRuntimeId) => {
    if (selectedRuntimeId === preferences.selectedRuntimeId) {
      return;
    }

    updatePreferences(
      {
        ...preferences,
        selectedRuntimeId,
        selectedQuantizationId: getDefaultQuantizationForRuntime(selectedRuntimeId),
      },
      true
    );
  }, [preferences, updatePreferences]);

  const handleQuantizationChange = useCallback((selectedQuantizationId: DetectorQuantizationId) => {
    if (selectedQuantizationId === preferences.selectedQuantizationId) {
      return;
    }
    updatePreferences({ ...preferences, selectedQuantizationId }, true);
  }, [preferences, updatePreferences]);

  const handlePlayerCountChange = useCallback((playerCount: number) => {
    if (playerCount === preferences.playerCount) {
      return;
    }
    updatePreferences({ ...preferences, playerCount }, true);
  }, [preferences, updatePreferences]);

  const handleThresholdChange = useCallback((threshold: number) => {
    updatePreferences({ ...preferences, threshold }, preferences.selectedBackendId === 'python-webrtc');
  }, [preferences, updatePreferences]);

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
          <GameScene
            phase={gamePhase}
            playerCount={preferences.playerCount}
            playerDetectionsRef={detector.playerDetectionsRef}
            playerPositionsRef={detector.playerPositionsRef}
            selectedGameId={preferences.selectedRunnerGameId}
            onJumpDuckGuidesChange={handleJumpDuckGuidesChange}
            videoRef={camera.videoRef}
          />
        </section>

        <aside className="control-panel" aria-label={t('app.detectionControls')}>
          <CameraFeedbackPanel
            cameraEnabled={camera.cameraEnabled}
            cameraMirrored={preferences.cameraMirrored}
            showCameraPreview={preferences.showCameraPreview}
            frameRef={camera.frameRef}
            jumpDuckGuides={jumpDuckGuides}
            overlayRef={camera.overlayRef}
            playerPositions={detector.playerPositions}
            selectedTrackerLabel={selectedTrackerLabel}
            videoRef={camera.videoRef}
            onLoadedMetadata={camera.syncCanvasSize}
          />

          <section className="run-panel" aria-label={t('game.controls')}>
            <div className="game-mode-selector" aria-label={t('game.modeSelector')}>
              <button
                type="button"
                className={preferences.selectedRunnerGameId === 'sideways' ? 'active' : ''}
                aria-pressed={preferences.selectedRunnerGameId === 'sideways'}
                onClick={() => handleGameSelection('sideways')}
              >
                {t('game.sidewaysMode')}
              </button>
              <button
                type="button"
                className={preferences.selectedRunnerGameId === 'jump-duck' ? 'active' : ''}
                aria-pressed={preferences.selectedRunnerGameId === 'jump-duck'}
                onClick={() => handleGameSelection('jump-duck')}
              >
                {t('game.jumpDuckMode')}
              </button>
              <button
                type="button"
                className={preferences.selectedRunnerGameId === 'hand-rhythm' ? 'active' : ''}
                aria-pressed={preferences.selectedRunnerGameId === 'hand-rhythm'}
                onClick={() => handleGameSelection('hand-rhythm')}
              >
                {t('game.handRhythmMode')}
              </button>
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
            onCameraMirrorChange={(cameraMirrored) => setPreferences({ ...preferences, cameraMirrored })}
            onCameraPreviewChange={(showCameraPreview) => setPreferences({ ...preferences, showCameraPreview })}
            onMediaPipeDelegateChange={handleMediaPipeDelegateChange}
            onMediaPipeModelChange={handleMediaPipeModelChange}
            onModelChange={handleModelChange}
            onPlayerCountChange={handlePlayerCountChange}
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
