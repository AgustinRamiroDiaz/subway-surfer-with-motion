import { useEffect, useRef, useState, type ReactElement } from 'react';
import type { GameplayInputFrame } from '../../../motion-mapping/gameplayInput';
import { useI18n } from '../../../app/i18n';
import {
  COLLISION_RADIUS_Z,
  OBSTACLE_DESPAWN_Z,
  OBSTACLE_SPAWN_Z,
  PLAYER_Z,
} from '../../gameConstants';
import type { GamePhase } from '../../gameTypes';
import { recordPlayerHit, recordPlayerMiss, createDefaultStats } from '../../gameSimulation';
import type { HandRhythmDifficulty } from '../../handRhythmDifficulty';
import { fitRhythmNoteToGrid, getCompanionRhythmNote, getHandRhythmSong } from '../../handRhythmSong';
import type { RhythmMusicClock } from '../../rhythmMusicPlayer';
import { shouldAddCompanionTarget } from '../../rhythmChartGenerator';
import { getRhythmNoteTimes, getRhythmTargetZ, isRhythmNoteVisible } from '../../rhythmTiming';
import {
  getHandRhythmPlayerMotion,
  isHandRhythmPlayerReady,
  type HandRhythmGridSize,
} from '../../levels/handRhythmLevel';
import type { WorldProjection } from '../../shared/worldProjection';
import { isHandRhythmTargetMatch } from './handRhythmJudgment';
import { recordHandRhythmRender } from '../../../debug/handRhythmPerformanceProbe';
import { createRenderFrameLimiter } from '../../shared/renderFrameLimiter';
import { createThreeHandRhythmRenderer } from './threeHandRhythmRenderer';
import { createCanvas2dHandRhythmRenderer } from './canvas2dHandRhythmRenderer';
import type {
  HandRhythmRendererId,
  HandRhythmVisualState,
} from './handRhythmRendererTypes';

export type HandRhythmSceneProps = {
  cameraMirrored: boolean;
  detectionOverlayRef: React.RefObject<HTMLCanvasElement | null>;
  difficulty: HandRhythmDifficulty;
  doubleTargetChance: number;
  gameplayInputRef: React.RefObject<GameplayInputFrame>;
  gridSize: HandRhythmGridSize;
  musicClock: RhythmMusicClock;
  onPlayersReady: () => void;
  onWorldProjectionChange: (projection: WorldProjection) => void;
  phase: GamePhase;
  playerCount: number;
  renderFps: number;
  rendererId: HandRhythmRendererId;
  showCameraPreview: boolean;
  showDetectionOverlay: boolean;
  showFloor: boolean;
  videoAspectRatio: number;
  videoRef: React.RefObject<HTMLVideoElement | null>;
};

export function HandRhythmScene({
  cameraMirrored,
  detectionOverlayRef,
  difficulty,
  doubleTargetChance,
  gameplayInputRef,
  gridSize,
  musicClock,
  onPlayersReady,
  onWorldProjectionChange,
  phase,
  playerCount,
  renderFps,
  rendererId,
  showCameraPreview,
  showDetectionOverlay,
  showFloor,
  videoAspectRatio,
  videoRef,
}: HandRhythmSceneProps): ReactElement {
  const { t } = useI18n();
  const song = getHandRhythmSong(difficulty);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const phaseRef = useRef<GamePhase>(phase);
  const renderFpsRef = useRef(renderFps);
  renderFpsRef.current = renderFps;
  const preflightCompleteRef = useRef(false);
  const [stats, setStats] = useState(() => createDefaultStats(playerCount));
  const [countInBeat, setCountInBeat] = useState<number | null>(null);
  const [playersReady, setPlayersReady] = useState<boolean[]>(
    () => Array.from({ length: playerCount }, () => false)
  );
  const [preflightComplete, setPreflightComplete] = useState(false);

  useEffect(() => {
    phaseRef.current = phase;
    if (phase === 'ready') {
      preflightCompleteRef.current = false;
      setPreflightComplete(false);
      setPlayersReady(Array.from({ length: playerCount }, () => false));
      setStats(createDefaultStats(playerCount));
    }
  }, [phase, playerCount]);

  const statusLabel = phase === 'ready'
    ? t('game.ready')
    : phase === 'paused'
      ? t('game.paused')
      : !preflightComplete
        ? t('game.handReady', {
            ready: playersReady.filter(Boolean).length,
            total: playerCount,
          })
        : countInBeat === null
          ? t('game.running')
          : t('game.countIn', { beat: countInBeat });

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || import.meta.env.MODE === 'test') return undefined;

    let animationFrame = 0;
    let lastFrameAt = performance.now();
    let nextNoteIndex = 0;
    let lastCountInBeat: number | null = null;
    let lastReadiness = Array.from({ length: playerCount }, () => false);
    let allPlayersReadySince: number | null = null;
    let nextTargetId = 1;
    const visualState: HandRhythmVisualState = {
      hands: Array.from({ length: playerCount }, () => []),
      targets: [],
    };
    const cameraOptions = {
      cameraMirrored,
      detectionCanvas: detectionOverlayRef.current,
      showCameraPreview,
      showDetectionOverlay,
      video: videoRef.current,
    };
    const renderer = rendererId === 'canvas2d'
      ? createCanvas2dHandRhythmRenderer(mount, playerCount, gridSize, showFloor, cameraOptions)
      : createThreeHandRhythmRenderer(mount, playerCount, gridSize, showFloor, cameraOptions);
    const renderFrameLimiter = createRenderFrameLimiter();
    const renderWorld = (frameStartedAtMs: number, deltaSeconds = 0): void => {
      if (!renderFrameLimiter.shouldRender(frameStartedAtMs, renderFpsRef.current)) return;
      const renderStartedAtMs = performance.now();
      renderer.render(visualState, deltaSeconds);
      recordHandRhythmRender(frameStartedAtMs, renderStartedAtMs, performance.now());
    };

    const resize = (): void => {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      onWorldProjectionChange(renderer.resize(width, height, videoAspectRatio));
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();

    const animate = (now: number): void => {
      const delta = phaseRef.current === 'running'
        ? Math.min(0.05, Math.max(0, now - lastFrameAt) / 1_000)
        : 0;
      lastFrameAt = now;

      if (phaseRef.current !== 'running') {
        renderWorld(now);
        animationFrame = window.requestAnimationFrame(animate);
        return;
      }

      if (musicClock.isCountingIn()) {
        const nextBeat = musicClock.getCountInBeat();
        if (nextBeat !== lastCountInBeat) {
          lastCountInBeat = nextBeat;
          setCountInBeat(nextBeat);
        }
        renderWorld(now);
        animationFrame = window.requestAnimationFrame(animate);
        return;
      }
      if (lastCountInBeat !== null) {
        lastCountInBeat = null;
        setCountInBeat(null);
      }

      const inputFrame = gameplayInputRef.current;
      const waitingForPlayers = !preflightCompleteRef.current;
      if (waitingForPlayers) {
        const readiness = Array.from({ length: playerCount }, (_, playerIndex) => {
          if (inputFrame.kind !== 'gesture') return false;
          const input = inputFrame.players[playerIndex];
          const hands = input?.hands ?? [input?.hand ?? null];
          return hands.some((hand) => isHandRhythmPlayerReady(hand, playerIndex, playerCount));
        });
        if (readiness.some((ready, index) => ready !== lastReadiness[index])) {
          lastReadiness = readiness;
          setPlayersReady(readiness);
        }
        allPlayersReadySince = readiness.every(Boolean) ? allPlayersReadySince ?? now : null;
      }

      visualState.hands = Array.from({ length: playerCount }, (_, playerIndex) => {
        const hands = inputFrame.kind === 'gesture'
          ? inputFrame.players[playerIndex]?.hands ?? [inputFrame.players[playerIndex]?.hand ?? null]
          : [];
        return hands.filter((hand): hand is NonNullable<typeof hand> => hand !== null);
      });

      if (waitingForPlayers) {
        if (allPlayersReadySince !== null && now - allPlayersReadySince >= 600) {
          preflightCompleteRef.current = true;
          setPreflightComplete(true);
          onPlayersReady();
        }
        renderWorld(now, delta);
        animationFrame = window.requestAnimationFrame(animate);
        return;
      }

      const songTime = musicClock.getSongTime();
      while (nextNoteIndex < song.notes.length) {
        const note = song.notes[nextNoteIndex];
        if (!note || songTime < getRhythmNoteTimes(song, note).spawnTimeSeconds) break;
        if (isRhythmNoteVisible(song, note, songTime, OBSTACLE_SPAWN_Z, PLAYER_Z, OBSTACLE_DESPAWN_Z)) {
          const gridNote = fitRhythmNoteToGrid(note, gridSize);
          for (let playerIndex = 0; playerIndex < playerCount; playerIndex += 1) {
            visualState.targets.push({
              id: nextTargetId++,
              cell: gridNote.cell,
              gesture: gridNote.gesture,
              note: gridNote,
              result: 'pending',
              strength: gridNote.strength,
              targetPlayerIndex: playerIndex,
              z: OBSTACLE_SPAWN_Z,
            });
            if (shouldAddCompanionTarget(note, doubleTargetChance)) {
              const companion = getCompanionRhythmNote(gridNote, gridSize);
              visualState.targets.push({
                id: nextTargetId++,
                cell: companion.cell,
                gesture: companion.gesture,
                note: companion,
                result: 'pending',
                strength: companion.strength,
                targetPlayerIndex: playerIndex,
                z: OBSTACLE_SPAWN_Z,
              });
            }
          }
        }
        nextNoteIndex += 1;
      }

      for (let index = visualState.targets.length - 1; index >= 0; index -= 1) {
        const target = visualState.targets[index];
        target.z = getRhythmTargetZ(song, target.note, songTime, OBSTACLE_SPAWN_Z, PLAYER_Z);
        const inHitZone = Math.abs(target.z - PLAYER_Z) < COLLISION_RADIUS_Z;
        if (inHitZone && target.result === 'pending') {
          const hands = inputFrame.kind === 'gesture'
            ? inputFrame.players[target.targetPlayerIndex]?.hands ?? [inputFrame.players[target.targetPlayerIndex]?.hand ?? null]
            : [null];
          const hit = hands.some((hand) => {
            const cell = getHandRhythmPlayerMotion(hand, target.targetPlayerIndex, playerCount, gridSize).cell;
            return isHandRhythmTargetMatch(hand, cell, target.gesture, target.cell);
          });
          target.result = hit ? 'hit' : 'missed';
          setStats((current) => hit
            ? recordPlayerHit(current, target.targetPlayerIndex, 1)
            : recordPlayerMiss(current, target.targetPlayerIndex));
        }
        if (target.z > OBSTACLE_DESPAWN_Z) visualState.targets.splice(index, 1);
      }

      renderWorld(now, delta);
      animationFrame = window.requestAnimationFrame(animate);
    };

    animationFrame = window.requestAnimationFrame(animate);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      renderer.dispose();
    };
  }, [cameraMirrored, detectionOverlayRef, doubleTargetChance, gameplayInputRef, gridSize, musicClock, onPlayersReady, onWorldProjectionChange, playerCount, rendererId, showCameraPreview, showDetectionOverlay, showFloor, song, videoAspectRatio, videoRef]);

  return (
    <div className={`game-scene hand-rhythm-scene renderer-${rendererId} players-${playerCount}${phase === 'running' ? ' game-running' : ''}`} data-renderer={rendererId} data-testid="hand-rhythm-scene" ref={mountRef}>
      <div className="stage-heading">
        <h1>{t('game.handRhythmTitle')}</h1>
      </div>
      <div className="game-hud" aria-label={t('game.status')}><span>{statusLabel}</span></div>
      <div
        className="hand-rhythm-player-viewports"
        data-testid="hand-rhythm-player-viewports"
        style={{ gridTemplateColumns: `repeat(${playerCount}, minmax(0, 1fr))` }}
        aria-label={t('game.handRhythmScores')}
      >
        {Array.from({ length: playerCount }, (_, index) => (
          <div className={`hand-rhythm-player-viewport player-${index + 1}${playersReady[index] ? ' ready' : ''}`} key={`player-viewport-${index + 1}`}>
            {!preflightComplete ? <div className="hand-rhythm-ready-cue"><span>🖐️</span></div> : null}
            <div className="hand-rhythm-player-score" aria-label={t('game.playerScore', { player: index + 1 })} aria-live="polite">
              <span className="hand-rhythm-player-label">{`P${index + 1}`}</span>
              <dl>
                <div className="hit-score"><dt>{t('game.rhythmHits')}</dt><dd>{stats.hits[index] ?? 0}</dd></div>
                <div className="miss-score"><dt>{t('game.misses')}</dt><dd>{stats.misses[index] ?? 0}</dd></div>
              </dl>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
