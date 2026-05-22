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
} from './aiDetector';
import {
  type AppPreferences,
  readStoredAppPreferences,
  writeStoredAppPreferences,
} from './appPreferences';
import { CameraFeedbackPanel } from './CameraFeedbackPanel';
import { DetectionControls } from './DetectionControls';
import { GameScene, type GamePhase } from './GameScene';
import { TrackingInternalsDocs } from './TrackingInternalsDocs';
import { useCameraController } from './useCameraController';
import { useMotionDetector } from './useMotionDetector';
import './App.css';

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
  const [preferences, setPreferences] = useState<AppPreferences>(readStoredAppPreferences);
  const [gamePhase, setGamePhase] = useState<GamePhase>('ready');
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
    preferences,
    cameraEnabled: camera.cameraEnabled,
    videoRef: camera.videoRef,
    overlayRef: camera.overlayRef,
    frameRef: camera.frameRef,
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

  const startLabel = camera.cameraEnabled ? 'Start run' : 'Enable camera';

  return (
    <main className="app-shell">
      <section className="workspace" aria-label="Motion game workspace">
        <section className="game-stage" aria-label="Main game">
          <GameScene
            canStart={!detector.isLoading}
            phase={gamePhase}
            playerPositions={detector.playerPositions}
            startLabel={detector.isLoading ? 'Loading model' : startLabel}
            onPause={handlePauseRun}
            onStart={handleStartRun}
          />
        </section>

        <aside className="control-panel" aria-label="Detection controls">
          <CameraFeedbackPanel
            cameraEnabled={camera.cameraEnabled}
            cameraMirrored={preferences.cameraMirrored}
            frameRef={camera.frameRef}
            overlayRef={camera.overlayRef}
            playerPositions={detector.playerPositions}
            selectedTrackerLabel={selectedTrackerLabel}
            videoRef={camera.videoRef}
            onLoadedMetadata={camera.syncCanvasSize}
          />

          <DetectionControls
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
            onCameraMirrorChange={(cameraMirrored) => setPreferences({ ...preferences, cameraMirrored })}
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
