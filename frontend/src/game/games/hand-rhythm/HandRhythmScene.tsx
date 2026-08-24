import { useEffect, useRef, useState, type ReactElement } from 'react';
import type { GameplayInputFrame } from '../../../motion-mapping/gameplayInput';
import { useI18n } from '../../../app/i18n';
import {
  COLLISION_RADIUS_Z,
  OBSTACLE_DESPAWN_Z,
  OBSTACLE_SPAWN_Z,
  PLAYER_BASE_Y,
  PLAYER_Z,
  TRACK_MAX_X,
  TRACK_MIN_X,
} from '../../gameConstants';
import type { GamePhase } from '../../gameTypes';
import { recordPlayerHit, recordPlayerMiss, createDefaultStats } from '../../gameSimulation';
import type { HandRhythmDifficulty } from '../../handRhythmDifficulty';
import { fitRhythmNoteToGrid, getCompanionRhythmNote, getHandRhythmSong } from '../../handRhythmSong';
import type { RhythmMusicClock } from '../../rhythmMusicPlayer';
import { shouldAddCompanionTarget } from '../../rhythmChartGenerator';
import { getRhythmNoteTimes, getRhythmTargetZ, isRhythmNoteVisible } from '../../rhythmTiming';
import { handRhythmPlayerWidth } from '../../levels/handRhythmLayout';
import {
  GESTURE_TO_EMOJI,
  getHandRhythmPlayerMotion,
  isHandRhythmPlayerReady,
  type HandRhythmCell,
  type HandRhythmGridSize,
} from '../../levels/handRhythmLevel';
import {
  updatePlayerGestureEmoji,
  updatePlayerGestureEmojiPosition,
  updatePlayerGestureEmojiSize,
} from '../../playerAvatar';
import { playerTrackX } from '../../trackLayout';
import { createHandRhythmWorld } from '../../trackWorld';
import { projectWorldPoint, type WorldProjection } from '../../shared/worldProjection';
import {
  createHandRhythmTargetSystem,
  setHandRhythmTargetFeedback,
} from './handRhythmTargets';
import { isHandRhythmTargetMatch } from './handRhythmJudgment';

const HAND_RHYTHM_CAMERA = {
  positionY: 2.45,
  positionZ: 10.6,
  targetZ: 0,
} as const;

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
    const world = createHandRhythmWorld(
      mount,
      playerCount,
      HAND_RHYTHM_CAMERA,
      gridSize,
      showFloor,
      {
        cameraMirrored,
        detectionCanvas: detectionOverlayRef.current,
        showCameraPreview,
        showDetectionOverlay,
        video: videoRef.current,
      }
    );
    const targets = createHandRhythmTargetSystem(world.scene, playerCount, gridSize);

    const resize = (): void => {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      world.resize(width, height);
      const projectionHeight = (TRACK_MAX_X - TRACK_MIN_X) / Math.max(0.1, videoAspectRatio);
      const corners = world.cameras.flatMap((camera, viewportIndex) => {
        const centerX = world.cameras.length === 1 ? 0 : playerTrackX(viewportIndex, playerCount);
        const viewWidth = world.cameras.length === 1
          ? TRACK_MAX_X - TRACK_MIN_X
          : handRhythmPlayerWidth(playerCount);
        const leftX = centerX - viewWidth / 2;
        const rightX = centerX + viewWidth / 2;
        return [
          projectWorldPoint(camera, leftX, PLAYER_BASE_Y, PLAYER_Z, viewportIndex, world.cameras.length),
          projectWorldPoint(camera, rightX, PLAYER_BASE_Y, PLAYER_Z, viewportIndex, world.cameras.length),
          projectWorldPoint(camera, leftX, PLAYER_BASE_Y + projectionHeight, PLAYER_Z, viewportIndex, world.cameras.length),
          projectWorldPoint(camera, rightX, PLAYER_BASE_Y + projectionHeight, PLAYER_Z, viewportIndex, world.cameras.length),
        ];
      });
      onWorldProjectionChange({
        left: Math.min(...corners.map((corner) => corner.x)),
        right: Math.max(...corners.map((corner) => corner.x)),
        top: Math.min(...corners.map((corner) => corner.y)),
        bottom: Math.max(...corners.map((corner) => corner.y)),
      });
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
        world.render();
        animationFrame = window.requestAnimationFrame(animate);
        return;
      }

      if (musicClock.isCountingIn()) {
        const nextBeat = musicClock.getCountInBeat();
        if (nextBeat !== lastCountInBeat) {
          lastCountInBeat = nextBeat;
          setCountInBeat(nextBeat);
        }
        world.render();
        animationFrame = window.requestAnimationFrame(animate);
        return;
      }
      if (lastCountInBeat !== null) {
        lastCountInBeat = null;
        setCountInBeat(null);
      }

      const inputFrame = gameplayInputRef.current;
      const activeCells: Array<HandRhythmCell[] | undefined> = [];
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

      world.players.forEach((player, playerIndex) => {
        const hands = inputFrame.kind === 'gesture'
          ? inputFrame.players[playerIndex]?.hands ?? [inputFrame.players[playerIndex]?.hand ?? null]
          : [];
        activeCells[playerIndex] = hands
          .filter((hand): hand is NonNullable<typeof hand> => hand !== null)
          .map((hand) => getHandRhythmPlayerMotion(hand, playerIndex, playerCount, gridSize).cell);
        player.gestureSprites?.forEach((sprite, handIndex) => {
          sprite.visible = hands[handIndex] !== null && hands[handIndex] !== undefined;
        });
        player.fallback.visible = false;
        player.root.children.forEach((child) => {
          if (child.name.startsWith('pose-driven-player')) child.visible = false;
        });
        hands.slice(0, player.gestureSprites?.length ?? 1).forEach((hand, handIndex) => {
          if (!hand) return;
          const motion = getHandRhythmPlayerMotion(hand, playerIndex, playerCount, gridSize);
          updatePlayerGestureEmoji(player, GESTURE_TO_EMOJI[hand.gesture] ?? GESTURE_TO_EMOJI.None, handIndex);
          updatePlayerGestureEmojiPosition(player, motion.emojiWorldX, motion.emojiWorldY, delta, handIndex);
          updatePlayerGestureEmojiSize(player, motion.emojiWorldWidth, motion.emojiWorldHeight, delta, handIndex);
        });
      });
      world.updateHandRhythmGrid(activeCells);

      if (waitingForPlayers) {
        if (allPlayersReadySince !== null && now - allPlayersReadySince >= 600) {
          preflightCompleteRef.current = true;
          setPreflightComplete(true);
          onPlayersReady();
        }
        world.render();
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
            targets.spawn(gridNote, playerIndex);
            if (shouldAddCompanionTarget(note, doubleTargetChance)) {
              targets.spawn(getCompanionRhythmNote(gridNote, gridSize), playerIndex);
            }
          }
        }
        nextNoteIndex += 1;
      }

      for (let index = targets.targets.length - 1; index >= 0; index -= 1) {
        const target = targets.targets[index];
        target.root.position.z = getRhythmTargetZ(song, target.note, songTime, OBSTACLE_SPAWN_Z, PLAYER_Z);
        const inHitZone = Math.abs(target.root.position.z - PLAYER_Z) < COLLISION_RADIUS_Z;
        if (inHitZone && target.result === 'pending') {
          const hands = inputFrame.kind === 'gesture'
            ? inputFrame.players[target.targetPlayerIndex]?.hands ?? [inputFrame.players[target.targetPlayerIndex]?.hand ?? null]
            : [null];
          const hit = hands.some((hand) => {
            const cell = getHandRhythmPlayerMotion(hand, target.targetPlayerIndex, playerCount, gridSize).cell;
            return isHandRhythmTargetMatch(hand, cell, target.gesture, target.cell);
          });
          target.result = hit ? 'hit' : 'missed';
          setHandRhythmTargetFeedback(target, hit);
          setStats((current) => hit
            ? recordPlayerHit(current, target.targetPlayerIndex, 1)
            : recordPlayerMiss(current, target.targetPlayerIndex));
        }
        if (target.root.position.z > OBSTACLE_DESPAWN_Z) targets.remove(target);
      }

      world.render();
      animationFrame = window.requestAnimationFrame(animate);
    };

    animationFrame = window.requestAnimationFrame(animate);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      targets.dispose();
      world.dispose();
    };
  }, [cameraMirrored, detectionOverlayRef, doubleTargetChance, gameplayInputRef, gridSize, musicClock, onPlayersReady, onWorldProjectionChange, playerCount, showCameraPreview, showDetectionOverlay, showFloor, song, videoAspectRatio, videoRef]);

  return (
    <div className={`game-scene hand-rhythm-scene players-${playerCount}${phase === 'running' ? ' game-running' : ''}`} ref={mountRef}>
      <div className="stage-heading">
        <p className="eyebrow">{t('game.heading')}</p>
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
