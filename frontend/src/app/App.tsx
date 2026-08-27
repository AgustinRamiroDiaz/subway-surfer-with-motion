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
import { LevelBoard } from '../ui/LevelBoard';
import { PauseOverlay } from '../ui/PauseOverlay';
import { MenuIcon, PanelToggleIcon } from '../ui/icons';
import type { GamePhase, RunnerGameId } from '../game/gameTypes';
import type { WorldProjection } from '../game/shared/worldProjection';
import { getGameDescriptor } from '../game/levelRegistry';
import { PoseRunnerScene } from '../game/games/pose-runner/PoseRunnerScene';
import { HandRhythmScene } from '../game/games/hand-rhythm/HandRhythmScene';
import { useHandRhythmMusic } from '../game/games/hand-rhythm/useHandRhythmMusic';
import { useI18n } from './i18n';
import { useCameraController } from '../hooks/useCameraController';
import { useMotionDetector } from '../hooks/useMotionDetector';
import '../App.css';

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
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [jumpDuckGuides, setJumpDuckGuides] = useState<JumpDuckGuide[]>([]);
  const [worldProjection, setWorldProjection] = useState<WorldProjection | null>(null);
  const [videoAspectRatio, setVideoAspectRatio] = useState(4 / 3);
  const detectorConfigurationKey = getDetectorConfigurationKey(preferences);
  const previousDetectorConfigurationKeyRef = useRef(detectorConfigurationKey);
  const handRhythmMusic = useHandRhythmMusic();

  const detectorTask = useMemo(() => {
    return getGameDescriptor(preferences.selectedRunnerGameId).detectorTask;
  }, [preferences.selectedRunnerGameId]);
  const handlePreferencesReplacement = useCallback((nextPreferences: typeof preferences) => {
    dispatchPreferences({ type: 'replace', preferences: nextPreferences });
  }, []);

  const camera = useCameraController({
    preferences,
    onPreferencesChange: handlePreferencesReplacement,
    onCameraRestart: () => {
      handRhythmMusic.stop();
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
    handRhythmMusic.stop();
    detector.resetDetector();
    setGamePhase('ready');
  }, [detector, detectorConfigurationKey, handRhythmMusic]);

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

  const handleGameRenderFpsChange = useCallback((fps: number) => {
    dispatchPreferences({ type: 'gameRenderFpsChanged', fps });
  }, []);

  const handleStopCamera = useCallback(() => {
    handRhythmMusic.stop();
    detector.stopDetection();
    camera.stopCamera();
    detector.clearDetectionState();
    camera.clearError();
    setGamePhase('ready');
  }, [camera, detector, handRhythmMusic]);

  const handleStartRun = useCallback(async () => {
    camera.clearError();
    const isHandRhythm = preferences.selectedRunnerGameId === 'hand-rhythm';
    const isResuming = gamePhase === 'paused';
    if (isHandRhythm) {
      await handRhythmMusic.unlock();
    }
    const started = await detector.startDetection();
    if (started) {
      if (isHandRhythm && isResuming) {
        await handRhythmMusic.playWithCountIn();
      } else {
        handRhythmMusic.stop();
      }
      setGamePhase('running');
    }
  }, [camera, detector, gamePhase, handRhythmMusic, preferences.selectedRunnerGameId]);

  const handleHandRhythmPlayersReady = useCallback(() => {
    void handRhythmMusic.playWithCountIn();
  }, [handRhythmMusic]);

  const handlePauseRun = useCallback(() => {
    handRhythmMusic.pause();
    detector.stopDetection();
    setGamePhase('paused');
  }, [detector, handRhythmMusic]);

  const handleOpenMenu = useCallback(() => {
    handlePauseRun();
    setMenuOpen(true);
  }, [handlePauseRun]);

  const handleResumeFromMenu = useCallback(async () => {
    await handleStartRun();
    setMenuOpen(false);
  }, [handleStartRun]);

  const handleResumeClick = useCallback((): void => {
    void handleResumeFromMenu();
  }, [handleResumeFromMenu]);

  const handleChangeLevelFromMenu = useCallback(() => {
    setMenuOpen(false);
  }, []);

  const handleExitFromMenu = useCallback(() => {
    setMenuOpen(false);
    handleStopCamera();
  }, [handleStopCamera]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') {
        return;
      }
      if (menuOpen) {
        event.preventDefault();
        void handleResumeFromMenu();
      } else if (gamePhase === 'running') {
        event.preventDefault();
        handleOpenMenu();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gamePhase, handleOpenMenu, handleResumeFromMenu, menuOpen]);

  const handleGameSelection = useCallback((selectedRunnerGameId: RunnerGameId) => {
    if (gamePhase === 'running') {
      handlePauseRun();
    }
    if (selectedRunnerGameId !== preferences.selectedRunnerGameId) {
      handRhythmMusic.stop();
    }
    handleGameIdChange(selectedRunnerGameId);
  }, [gamePhase, handRhythmMusic, handleGameIdChange, handlePauseRun, preferences.selectedRunnerGameId]);

  const handleJumpDuckGuidesChange = useCallback((guides: JumpDuckGuide[]) => {
    setJumpDuckGuides(guides);
  }, []);

  const handleCameraMetadata = useCallback(() => {
    camera.syncCanvasSize();
    const video = camera.videoRef.current;
    if (video?.videoWidth && video.videoHeight) {
      setVideoAspectRatio(video.videoWidth / video.videoHeight);
    }
  }, [camera]);

  const startLabel = camera.cameraEnabled ? t('app.startRun') : t('app.enableCamera');
  const showLevelBoard = gamePhase === 'ready' || (gamePhase === 'paused' && !menuOpen);
  const cameraReadiness = !camera.cameraEnabled
    ? { label: t('camera.readinessOff'), tone: 'off' }
    : detector.isLoading
      ? { label: t('camera.readinessLoading'), tone: 'loading' }
      : detector.isDetecting
        ? { label: t('camera.readinessActive'), tone: 'active' }
      : { label: t('camera.readinessReady'), tone: 'ready' };

  return (
    <main className="app-shell">
      <section className="workspace" aria-label={t('app.workspace')}>
        <section
          className={`game-stage${showLevelBoard ? ' game-stage-home' : ''}`}
          aria-label={t('app.mainGame')}
        >
          <Suspense fallback={<LoadingRegion />}>
            {preferences.selectedRunnerGameId === 'hand-rhythm' ? (
              <HandRhythmScene
                cameraMirrored={preferences.cameraMirrored}
                detectionOverlayRef={camera.overlayRef}
                difficulty={preferences.handRhythmDifficulty}
                doubleTargetChance={preferences.handRhythmDoubleTargetChance}
                gameplayInputRef={detector.gameplayInputRef}
                gridSize={preferences.handRhythmGridSize}
                musicClock={handRhythmMusic}
                onPlayersReady={handleHandRhythmPlayersReady}
                onWorldProjectionChange={setWorldProjection}
                phase={gamePhase}
                playerCount={preferences.playerCount}
                renderFps={preferences.gameRenderFps}
                showCameraPreview={preferences.cameraPreviewVisibility['hand-rhythm']}
                showDetectionOverlay={preferences.detectionOverlayVisibility['hand-rhythm']}
                showFloor={preferences.showHandRhythmFloor}
                videoAspectRatio={videoAspectRatio}
                videoRef={camera.videoRef}
              />
            ) : (
              <PoseRunnerScene
                gameplayInputRef={detector.gameplayInputRef}
                onJumpDuckGuidesChange={handleJumpDuckGuidesChange}
                onWorldProjectionChange={setWorldProjection}
                phase={gamePhase}
                playerCount={preferences.playerCount}
                renderFps={preferences.gameRenderFps}
                selectedGameId={preferences.selectedRunnerGameId}
                videoAspectRatio={videoAspectRatio}
              />
            )}
          </Suspense>
          {showLevelBoard ? (
            <LevelBoard
              disabled={detector.isLoading}
              isLoading={detector.isLoading}
              preferences={preferences}
              selectedGameId={preferences.selectedRunnerGameId}
              startLabel={startLabel}
              onSelectGame={handleGameSelection}
              onStartRun={handleStartRun}
              onPlayerCountChange={handlePlayerCountChange}
              onHandRhythmDifficultyChange={(difficulty) => dispatchPreferences({ type: 'handRhythmDifficultyChanged', difficulty })}
              onHandRhythmGridSizeChange={(gridSize) => dispatchPreferences({ type: 'handRhythmGridChanged', gridSize })}
              onHandRhythmDoubleTargetChanceChange={(chance) => dispatchPreferences({ type: 'handRhythmDoubleTargetChanceChanged', chance })}
              onHandRhythmFloorChange={(visible) => dispatchPreferences({ type: 'handRhythmFloorChanged', visible })}
            />
          ) : null}
          <div className="stage-hud">
            <div className={`stage-monitor camera-readiness-${cameraReadiness.tone}`} role="status" aria-live="polite">
              <span className="camera-readiness-dot" aria-hidden="true" />
              <span>{cameraReadiness.label}</span>
              {detector.lastInferenceMs !== null ? (
                <span className="stage-monitor-ms">{detector.lastInferenceMs}ms</span>
              ) : null}
            </div>
            {gamePhase === 'running' ? (
              <button type="button" className="menu-trigger" onClick={handleOpenMenu}>
                <MenuIcon />
                {t('controls.menu')}
                <kbd aria-hidden="true">Esc</kbd>
              </button>
            ) : null}
          </div>
          {menuOpen ? (
            <PauseOverlay
              isLoading={detector.isLoading}
              onResume={handleResumeClick}
              onChangeLevel={handleChangeLevelFromMenu}
              onExit={handleExitFromMenu}
            />
          ) : null}
          <CameraFeedbackPanel
            cameraEnabled={camera.cameraEnabled}
            cameraMirrored={preferences.cameraMirrored}
            showCameraPreview={preferences.cameraPreviewVisibility[preferences.selectedRunnerGameId]}
            showDetectionOverlay={preferences.detectionOverlayVisibility[preferences.selectedRunnerGameId]}
            frameRef={camera.frameRef}
            jumpDuckGuides={jumpDuckGuides}
            handRhythmGridSize={preferences.handRhythmGridSize}
            showHandRhythmGrid={preferences.selectedRunnerGameId === 'hand-rhythm'}
            overlayRef={camera.overlayRef}
            playerPositions={detector.playerPositions}
            presentation="game-overlay"
            renderInWorld={preferences.selectedRunnerGameId === 'hand-rhythm'}
            selectedTrackerLabel={selectedTrackerLabel}
            videoRef={camera.videoRef}
            worldProjection={worldProjection}
            onLoadedMetadata={handleCameraMetadata}
          />
        </section>

        <aside className={`control-panel${sidebarCollapsed ? ' collapsed' : ''}`} aria-label={t('app.detectionControls')}>
          <button
            type="button"
            className="panel-toggle"
            aria-label={sidebarCollapsed ? t('controls.showPanel') : t('controls.hidePanel')}
            aria-expanded={!sidebarCollapsed}
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
          >
            <PanelToggleIcon />
          </button>

          {!sidebarCollapsed && (
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
              onDetectionOverlayChange={(visible) => dispatchPreferences({ type: 'detectionOverlayChanged', visible })}
              onGameRenderFpsChange={handleGameRenderFpsChange}
              onMediaPipeDelegateChange={handleMediaPipeDelegateChange}
              onMediaPipeModelChange={handleMediaPipeModelChange}
              onModelChange={handleModelChange}
              onQuantizationChange={handleQuantizationChange}
              onRuntimeChange={handleRuntimeChange}
              onStopCamera={handleStopCamera}
              onThresholdChange={handleThresholdChange}
            />
          )}
        </aside>
      </section>
    </main>
  );
}

export default App;
