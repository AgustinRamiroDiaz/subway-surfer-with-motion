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
import type { WorldProjection } from '../game/GameScene';
import { getRunnerLevel } from '../game/levelRegistry';
import { HAND_RHYTHM_PLAYBACK } from '../game/handRhythmSongMetadata';
import { createRhythmMusicPlayer } from '../game/rhythmMusicPlayer';
import { useI18n } from './i18n';
import { useCameraController } from '../hooks/useCameraController';
import { useMotionDetector } from '../hooks/useMotionDetector';
import '../App.css';

type LevelBoardMetadata = {
  id: RunnerGameId;
  boardTitleKey: 'home.sidewaysTitle' | 'home.jumpDuckTitle' | 'home.handRhythmTitle';
  boardBodyKey: 'home.sidewaysBody' | 'home.jumpDuckBody' | 'home.handRhythmBody';
  inputLabelKey: 'home.poseInput' | 'home.gestureInput';
  setupLabelKey: 'home.quickStart' | 'home.calibration';
  marker: string;
};

const LEVEL_BOARD_METADATA: readonly LevelBoardMetadata[] = [
  {
    id: 'sideways',
    boardTitleKey: 'home.sidewaysTitle',
    boardBodyKey: 'home.sidewaysBody',
    inputLabelKey: 'home.poseInput',
    setupLabelKey: 'home.quickStart',
    marker: '01',
  },
  {
    id: 'jump-duck',
    boardTitleKey: 'home.jumpDuckTitle',
    boardBodyKey: 'home.jumpDuckBody',
    inputLabelKey: 'home.poseInput',
    setupLabelKey: 'home.calibration',
    marker: '02',
  },
  {
    id: 'hand-rhythm',
    boardTitleKey: 'home.handRhythmTitle',
    boardBodyKey: 'home.handRhythmBody',
    inputLabelKey: 'home.gestureInput',
    setupLabelKey: 'home.quickStart',
    marker: '03',
  },
] as const;

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

function LevelBoard({
  disabled,
  isLoading,
  selectedGameId,
  startLabel,
  onSelectGame,
  onStartRun,
}: {
  disabled: boolean;
  isLoading: boolean;
  selectedGameId: RunnerGameId;
  startLabel: string;
  onSelectGame: (gameId: RunnerGameId) => void;
  onStartRun: () => void;
}): ReactElement {
  const { t } = useI18n();
  const selectedMetadata = LEVEL_BOARD_METADATA.find((item) => item.id === selectedGameId) ?? LEVEL_BOARD_METADATA[0];

  return (
    <section className="home-board" aria-label={t('home.menu')}>
      <div className="home-board-header">
        <p className="eyebrow">{t('home.eyebrow')}</p>
        <h1>{t('home.title')}</h1>
        <p>{t('home.subtitle')}</p>
      </div>

      <div className="level-card-grid" aria-label={t('game.modeSelector')}>
        {LEVEL_BOARD_METADATA.map((level) => {
          const selected = level.id === selectedGameId;
          return (
            <button
              key={level.id}
              type="button"
              className={`level-card level-card-${level.id}${selected ? ' selected' : ''}`}
              aria-label={t(getRunnerLevel(level.id).modeLabelKey)}
              aria-current={selected ? 'true' : undefined}
              aria-pressed={selected}
              onClick={() => onSelectGame(level.id)}
            >
              <span className="level-card-marker" aria-hidden="true">{level.marker}</span>
              <span className="level-card-art" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              <span className="level-card-copy">
                <span className="level-card-kicker">{t(level.inputLabelKey)}</span>
                <strong>{t(level.boardTitleKey)}</strong>
                <span>{t(level.boardBodyKey)}</span>
              </span>
              <span className="level-card-footer">
                <span>{t(level.setupLabelKey)}</span>
                <span>{selected ? t('home.selected') : t('home.select')}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="home-board-actions">
        <div>
          <span>{t('home.selectedLevel')}</span>
          <strong>{t(selectedMetadata.boardTitleKey)}</strong>
        </div>
        <button
          className="primary-action"
          type="button"
          disabled={disabled}
          onClick={onStartRun}
        >
          {isLoading ? t('app.loadingModel') : startLabel}
        </button>
      </div>
    </section>
  );
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
  const [worldProjection, setWorldProjection] = useState<WorldProjection | null>(null);
  const [videoAspectRatio, setVideoAspectRatio] = useState(4 / 3);
  const detectorConfigurationKey = getDetectorConfigurationKey(preferences);
  const previousDetectorConfigurationKeyRef = useRef(detectorConfigurationKey);
  const handRhythmMusic = useMemo(() => createRhythmMusicPlayer(HAND_RHYTHM_PLAYBACK), []);

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
    void handRhythmMusic.preload().catch(() => undefined);
    return () => handRhythmMusic.dispose();
  }, [handRhythmMusic]);

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
          className={`game-stage${gamePhase !== 'running' ? ' game-stage-home' : ''}`}
          aria-label={t('app.mainGame')}
        >
          <Suspense fallback={<LoadingRegion />}>
            <GameScene
              cameraMirrored={preferences.cameraMirrored}
              detectionOverlayRef={camera.overlayRef}
              phase={gamePhase}
              playerCount={preferences.playerCount}
              handRhythmDifficulty={preferences.handRhythmDifficulty}
              handRhythmGridSize={preferences.handRhythmGridSize}
              handRhythmDoubleTargetChance={preferences.handRhythmDoubleTargetChance}
              handRhythmMusicClock={handRhythmMusic}
              onHandRhythmPlayersReady={handleHandRhythmPlayersReady}
              showHandRhythmFloor={preferences.showHandRhythmFloor}
              gameplayInputRef={detector.gameplayInputRef}
              selectedGameId={preferences.selectedRunnerGameId}
              showCameraPreview={preferences.cameraPreviewVisibility[preferences.selectedRunnerGameId]}
              showDetectionOverlay={preferences.detectionOverlayVisibility[preferences.selectedRunnerGameId]}
              videoRef={camera.videoRef}
              videoAspectRatio={videoAspectRatio}
              onJumpDuckGuidesChange={handleJumpDuckGuidesChange}
              onWorldProjectionChange={setWorldProjection}
            />
          </Suspense>
          {gamePhase !== 'running' ? (
            <LevelBoard
              disabled={detector.isLoading}
              isLoading={detector.isLoading}
              selectedGameId={preferences.selectedRunnerGameId}
              startLabel={startLabel}
              onSelectGame={handleGameSelection}
              onStartRun={handleStartRun}
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

        <aside className="control-panel" aria-label={t('app.detectionControls')}>
          <section className="run-panel" aria-label={t('game.controls')}>
            <div className={`camera-readiness camera-readiness-${cameraReadiness.tone}`} role="status" aria-live="polite">
              <span className="camera-readiness-dot" aria-hidden="true" />
              <span>{cameraReadiness.label}</span>
            </div>
            <div className="selected-level-summary">
              <span>{t('home.selectedLevel')}</span>
              <strong>{t(getRunnerLevel(preferences.selectedRunnerGameId).titleKey)}</strong>
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
            onDetectionOverlayChange={(visible) => dispatchPreferences({ type: 'detectionOverlayChanged', visible })}
            onMediaPipeDelegateChange={handleMediaPipeDelegateChange}
            onMediaPipeModelChange={handleMediaPipeModelChange}
            onModelChange={handleModelChange}
            onPlayerCountChange={handlePlayerCountChange}
            onHandRhythmDifficultyChange={(difficulty) => dispatchPreferences({ type: 'handRhythmDifficultyChanged', difficulty })}
            onHandRhythmGridSizeChange={(gridSize) => dispatchPreferences({ type: 'handRhythmGridChanged', gridSize })}
            onHandRhythmDoubleTargetChanceChange={(chance) => dispatchPreferences({ type: 'handRhythmDoubleTargetChanceChanged', chance })}
            onHandRhythmFloorChange={(visible) => dispatchPreferences({ type: 'handRhythmFloorChanged', visible })}
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
