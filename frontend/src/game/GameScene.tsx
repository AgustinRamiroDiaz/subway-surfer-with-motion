/* eslint-disable max-lines */
import { useEffect, useRef, useState, type ReactElement } from 'react';
import * as THREE from 'three';
import { useI18n } from '../app/i18n';
import {
  createCalibrationRun,
  type CalibrationRun,
  type JumpDuckCell,
  type JumpDuckGuide,
} from '../motion-mapping/jumpDuckActions';
import type { GameplayInputFrame } from '../motion-mapping/gameplayInput';
import { getDefaultPlayerPositions } from '../motion-mapping/playerPositions';
import {
  COLLISION_RADIUS_X,
  COLLISION_RADIUS_Z,
  OBSTACLE_DESPAWN_Z,
  OBSTACLE_SPAWN_Z,
  OBSTACLE_SPEED,
  PLAYER_BASE_Y,
  PLAYER_Z,
  TRACK_MAX_X,
  TRACK_MIN_X,
} from './gameConstants';
import type { GamePhase, GameStats, Obstacle, RunnerGameId } from './gameTypes';
import {
  advanceGameSimulation,
  clearHitStatus,
  createDefaultStats,
  createGameSimulationClock,
  delayNextSpawn,
  findJumpDuckPieceHits,
  isHandRhythmTargetMatch,
  isPlayerInCollisionRange,
  recordDodgedObstacle,
  recordPlayerHit,
  recordPlayerMiss,
  scheduleHitStatusReset,
} from './gameSimulation';
import {
  getInitialJumpDuckActions,
  updateJumpDuckCalibration,
  type JumpDuckCalibrationState,
} from './levels/jumpDuckLevel';
import {
  type HandRhythmCell,
  type HandRhythmGridSize,
  getHandRhythmPlayerMotion,
  GESTURE_TO_EMOJI,
  isHandRhythmPlayerReady,
} from './levels/handRhythmLevel';
import { getRunnerLevel } from './levelRegistry';
import { createObstacleSystem } from './obstacles';
import { applyMarkerPose, disposeObject, getPoseAnimationState, updatePlayerGestureEmoji, updatePlayerGestureEmojiPosition, updatePlayerGestureEmojiSize } from './playerAvatar';
import { createTrackWorld } from './trackWorld';
import { handRhythmPlayerWidth } from './levels/handRhythmLayout';
import { playerTrackX } from './trackLayout';
import { fitRhythmNoteToGrid, getCompanionRhythmNote, getHandRhythmSong } from './handRhythmSong';
import type { HandRhythmDifficulty } from './handRhythmDifficulty';
import type { RhythmMusicClock } from './rhythmMusicPlayer';
import { shouldAddCompanionTarget } from './rhythmChartGenerator';
import { getRhythmNoteTimes, getRhythmTargetZ, isRhythmNoteVisible } from './rhythmTiming';

export type { GamePhase };

type GameSceneProps = {
  cameraMirrored: boolean;
  detectionOverlayRef: React.RefObject<HTMLCanvasElement | null>;
  phase: GamePhase;
  playerCount: number;
  handRhythmDifficulty: HandRhythmDifficulty;
  handRhythmGridSize: HandRhythmGridSize;
  handRhythmDoubleTargetChance: number;
  handRhythmMusicClock: RhythmMusicClock;
  onHandRhythmPlayersReady: () => void;
  showHandRhythmFloor: boolean;
  gameplayInputRef: React.RefObject<GameplayInputFrame>;
  selectedGameId: RunnerGameId;
  onJumpDuckGuidesChange: (guides: JumpDuckGuide[]) => void;
  onWorldProjectionChange: (projection: WorldProjection) => void;
  showCameraPreview: boolean;
  showDetectionOverlay: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  videoAspectRatio: number;
};

export type WorldProjection = {
  bottom: number;
  left: number;
  right: number;
  top: number;
};

function projectWorldPoint(
  camera: THREE.PerspectiveCamera,
  x: number,
  y: number,
  z: number,
  viewportIndex = 0,
  viewportCount = 1
): { x: number; y: number } {
  const projected = new THREE.Vector3(x, y, z).project(camera);
  const localX = THREE.MathUtils.clamp((projected.x + 1) / 2, 0, 1);
  return {
    x: (viewportIndex + localX) / viewportCount,
    y: THREE.MathUtils.clamp((1 - projected.y) / 2, 0, 1),
  };
}

function getJumpDuckPieceHitCount(obstacle: Obstacle, playerIndex: number, cell: JumpDuckCell): number {
  const hits = findJumpDuckPieceHits(obstacle.pieces, obstacle.hitPieces, playerIndex, cell);
  hits.forEach(({ key, pieceIndex }) => {
    obstacle.hitPieces.add(key);
    const piece = obstacle.pieces[pieceIndex];
    piece.materials.forEach((material) => {
      material.color.set('#ffd166');
      material.emissive.set('#6b3e00');
      material.roughness = 0.34;
    });
  });

  return hits.length;
}

function setHandRhythmFeedback(obstacle: Obstacle, hit: boolean): void {
  const color = hit ? '#2fffb2' : '#ff4d6d';
  const emissive = hit ? '#0b5a3f' : '#6d1024';
  obstacle.feedbackMaterials.forEach((material) => {
    material.color.set(color);
    material.emissive.set(emissive);
    material.emissiveIntensity = 1.5;
    material.opacity = 0.9;
  });
}
export function GameScene({
  cameraMirrored,
  detectionOverlayRef,
  phase,
  playerCount,
  handRhythmDifficulty,
  handRhythmGridSize,
  handRhythmDoubleTargetChance,
  handRhythmMusicClock,
  onHandRhythmPlayersReady,
  showHandRhythmFloor,
  gameplayInputRef,
  selectedGameId,
  onJumpDuckGuidesChange,
  onWorldProjectionChange,
  showCameraPreview,
  showDetectionOverlay,
  videoRef,
  videoAspectRatio,
}: GameSceneProps): ReactElement {
  const { t } = useI18n();
  const handRhythmSong = getHandRhythmSong(handRhythmDifficulty);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const selectedGameIdRef = useRef<RunnerGameId>(selectedGameId);
  const gamePhaseRef = useRef<GamePhase>(phase);
  const calibrationRef = useRef<CalibrationRun>(createCalibrationRun(playerCount));
  const lastCalibrationProgressRef = useRef(-1);
  const jumpDuckActionsRef = useRef(getInitialJumpDuckActions(playerCount));
  const handRhythmPreflightCompleteRef = useRef(false);
  const [calibrationState, setCalibrationState] = useState<JumpDuckCalibrationState>({
    calibrated: true,
    progress: 1,
  });
  const [stats, setStats] = useState<GameStats>(() => createDefaultStats(playerCount));
  const [countInBeat, setCountInBeat] = useState<number | null>(null);
  const [handRhythmPlayersReady, setHandRhythmPlayersReady] = useState<boolean[]>(
    () => Array.from({ length: playerCount }, () => false)
  );
  const [handRhythmPreflightComplete, setHandRhythmPreflightComplete] = useState(false);

  useEffect(() => {
    selectedGameIdRef.current = selectedGameId;
    if (selectedGameId !== 'jump-duck') {
      onJumpDuckGuidesChange([]);
    }
  }, [onJumpDuckGuidesChange, selectedGameId]);

  useEffect(() => {
    setStats(createDefaultStats(playerCount));
    handRhythmPreflightCompleteRef.current = false;
    setHandRhythmPreflightComplete(false);
    setHandRhythmPlayersReady(Array.from({ length: playerCount }, () => false));
    calibrationRef.current = createCalibrationRun(playerCount);
    jumpDuckActionsRef.current = getInitialJumpDuckActions(playerCount);
    lastCalibrationProgressRef.current = -1;
    setCalibrationState({
      calibrated: !getRunnerLevel(selectedGameId).requiresCalibration,
      progress: getRunnerLevel(selectedGameId).requiresCalibration ? 0 : 1,
    });
    onJumpDuckGuidesChange([]);
  }, [onJumpDuckGuidesChange, playerCount, selectedGameId]);

  useEffect(() => {
    gamePhaseRef.current = phase;
    if (phase === 'ready') {
      handRhythmPreflightCompleteRef.current = false;
      setHandRhythmPreflightComplete(false);
      setHandRhythmPlayersReady(Array.from({ length: playerCount }, () => false));
    }
  }, [phase, playerCount]);

  const selectedLevel = getRunnerLevel(selectedGameId);
  const isJumpDuckGame = selectedLevel.requiresCalibration;
  const isHandRhythmGame = selectedLevel.inputKind === 'gesture';
  
  const statusLabel = phase === 'ready'
    ? isJumpDuckGame && !calibrationState.calibrated
      ? t('game.calibrationRequired')
      : t('game.ready')
    : phase === 'paused'
      ? t('game.paused')
      : isJumpDuckGame && !calibrationState.calibrated
        ? t('game.calibrating', { progress: Math.round(calibrationState.progress * 100) })
        : isHandRhythmGame
          ? !handRhythmPreflightComplete
            ? t('game.handReady', {
                ready: handRhythmPlayersReady.filter(Boolean).length,
                total: playerCount,
              })
            : countInBeat === null
              ? t('game.running')
              : t('game.countIn', { beat: countInBeat })
          : stats.status === 'hit' && stats.hitPlayer !== null
            ? t('game.playerHit', { player: stats.hitPlayer })
            : t('game.running');

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return undefined;
    }

    if (import.meta.env.MODE === 'test') {
      return undefined;
    }

    let animationFrame = 0;
    const startedAt = performance.now();
    let simulationClock = createGameSimulationClock(startedAt, selectedLevel.spawnIntervalMs);
    const initialPositions = gameplayInputRef.current.kind === 'pose'
      ? gameplayInputRef.current.players.map((player) => player.normalizedX)
      : getDefaultPlayerPositions(playerCount);
    const world = createTrackWorld(
      mount,
      initialPositions,
      selectedGameId,
      selectedLevel.camera,
      handRhythmGridSize,
      showHandRhythmFloor,
      isHandRhythmGame
        ? {
            cameraMirrored,
            detectionCanvas: detectionOverlayRef.current,
            showCameraPreview,
            showDetectionOverlay,
            video: videoRef.current,
          }
        : undefined
    );
    const obstacleSystem = createObstacleSystem(
      world.scene,
      () => selectedGameIdRef.current,
      () => playerCount,
      () => handRhythmGridSize,
      () => handRhythmDoubleTargetChance
    );
    let nextRhythmNoteIndex = 0;
    let lastCountInBeat: number | null = null;
    let lastHandRhythmReadiness = Array.from({ length: playerCount }, () => false);
    let allPlayersReadySince: number | null = null;

    const resize = (): void => {
      const { clientWidth, clientHeight } = mount;
      const width = Math.max(1, clientWidth);
      const height = Math.max(1, clientHeight);
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
      const activeGameId = selectedGameIdRef.current;
      const activeLevel = getRunnerLevel(activeGameId);
      const calibration = calibrationRef.current;
      const isCalibrating = activeLevel.requiresCalibration && calibration.players === null;
      const simulationStep = advanceGameSimulation(
        simulationClock,
        now,
        gamePhaseRef.current,
        activeLevel.spawnIntervalMs,
        !isCalibrating
      );
      simulationClock = simulationStep.clock;

      if (gamePhaseRef.current !== 'running') {
        world.render();
        animationFrame = window.requestAnimationFrame(animate);
        return;
      }

      if (isHandRhythmGame && handRhythmMusicClock.isCountingIn()) {
        const nextCountInBeat = handRhythmMusicClock.getCountInBeat();
        if (nextCountInBeat !== lastCountInBeat) {
          lastCountInBeat = nextCountInBeat;
          setCountInBeat(nextCountInBeat);
        }
        world.render();
        animationFrame = window.requestAnimationFrame(animate);
        return;
      }
      if (lastCountInBeat !== null) {
        lastCountInBeat = null;
        setCountInBeat(null);
      }

      const delta = simulationStep.deltaSeconds;
      const inputFrame = gameplayInputRef.current;
      const handRhythmCells: Array<HandRhythmCell[] | undefined> = [];
      const isWaitingForHandRhythmPlayers = isHandRhythmGame && !handRhythmPreflightCompleteRef.current;
      if (isWaitingForHandRhythmPlayers) {
        const readiness = Array.from({ length: playerCount }, (_, playerIndex) => {
          if (inputFrame.kind !== 'gesture') {
            return false;
          }
          const playerInput = inputFrame.players[playerIndex];
          const hands = playerInput?.hands ?? [playerInput?.hand ?? null];
          return hands.some((hand) => isHandRhythmPlayerReady(hand, playerIndex, playerCount));
        });
        if (readiness.some((ready, index) => ready !== lastHandRhythmReadiness[index])) {
          lastHandRhythmReadiness = readiness;
          setHandRhythmPlayersReady(readiness);
        }
        allPlayersReadySince = readiness.every(Boolean)
          ? allPlayersReadySince ?? now
          : null;
      }

      world.players.forEach((player, index) => {
        const motion = activeLevel.getPlayerMotion({
          inputFrame,
          playerIndex: index,
          playerCount: world.players.length,
          calibration: calibration.players?.[index],
          handRhythmGridSize,
        });
        const isHandRhythm = activeLevel.inputKind === 'gesture';
        const playerHands = inputFrame.kind === 'gesture'
          ? inputFrame.players[index]?.hands ?? [inputFrame.players[index]?.hand ?? null]
          : [];
        if (isHandRhythm) {
          handRhythmCells[index] = playerHands
            .filter((hand): hand is NonNullable<typeof hand> => hand !== null)
            .map((hand) => getHandRhythmPlayerMotion(hand, index, world.players.length, handRhythmGridSize).cell);
        }
        player.gestureSprites?.forEach((sprite, handIndex) => {
          sprite.visible = isHandRhythm && playerHands[handIndex] !== null && playerHands[handIndex] !== undefined;
        });
        player.fallback.visible = !isHandRhythm && !player.rig;
        if (player.rig) {
          // Find the 3D model (children with pose-driven-player prefix)
          player.root.children.forEach((child) => {
            if (child.name.startsWith('pose-driven-player')) {
              child.visible = !isHandRhythm;
            }
          });
        }
        const poseState = getPoseAnimationState(motion.pose);
        if (motion.jumpDuckCell) {
          jumpDuckActionsRef.current[index] = motion.jumpDuckCell;
        }

        if (isHandRhythm) {
          playerHands.slice(0, player.gestureSprites?.length ?? 1).forEach((hand, handIndex) => {
            if (!hand) {
              return;
            }
            const handMotion = getHandRhythmPlayerMotion(
              hand,
              index,
              world.players.length,
              handRhythmGridSize
            );
            const emoji = GESTURE_TO_EMOJI[hand.gesture] ?? GESTURE_TO_EMOJI['None'];
            updatePlayerGestureEmoji(player, emoji, handIndex);
            updatePlayerGestureEmojiPosition(player, handMotion.emojiWorldX, handMotion.emojiWorldY, handIndex);
            updatePlayerGestureEmojiSize(player, handMotion.emojiWorldWidth, handMotion.emojiWorldHeight, handIndex);
          });
        } else if (motion.gesture) {
          const emoji = GESTURE_TO_EMOJI[motion.gesture] ?? GESTURE_TO_EMOJI['None'];
          updatePlayerGestureEmoji(player, emoji);
        }
        player.poseEnergy = THREE.MathUtils.lerp(player.poseEnergy, poseState.energy, 0.18);
        player.root.position.x = THREE.MathUtils.lerp(player.root.position.x, motion.targetX, 0.22);
        player.root.position.y = THREE.MathUtils.lerp(
          player.root.position.y,
          motion.targetY + (isHandRhythm ? 0 : Math.sin(now * 0.012 + index) * 0.045 * player.poseEnergy),
          0.28
        );
        player.root.scale.y = THREE.MathUtils.lerp(player.root.scale.y, motion.targetScaleY, 0.24);
        player.root.rotation.z = THREE.MathUtils.lerp(player.root.rotation.z, -poseState.lean * 0.5, 0.2);
        player.root.rotation.y = THREE.MathUtils.lerp(player.root.rotation.y, poseState.turn * 0.45, 0.16);
        player.fallback.rotation.y += delta * (2 + index * 0.35);

        if (!isHandRhythm) {
          applyMarkerPose(player, motion.pose);
        }
      });

      if (activeLevel.inputKind === 'gesture') {
        world.updateHandRhythmGrid(handRhythmCells);
      }

      if (isWaitingForHandRhythmPlayers) {
        if (allPlayersReadySince !== null && now - allPlayersReadySince >= 600) {
          handRhythmPreflightCompleteRef.current = true;
          setHandRhythmPreflightComplete(true);
          onHandRhythmPlayersReady();
        }
        world.render();
        animationFrame = window.requestAnimationFrame(animate);
        return;
      }

      if (isCalibrating) {
        const calibrationUpdate = updateJumpDuckCalibration(
          calibration,
          inputFrame.kind === 'pose' ? inputFrame.players.map((player) => player.pose) : [],
          now,
          lastCalibrationProgressRef.current
        );

        if (calibrationUpdate.status === 'calibrating') {
          lastCalibrationProgressRef.current = Math.round(calibrationUpdate.progress * 100) / 100;
          setCalibrationState({ calibrated: false, progress: calibrationUpdate.progress });
        } else if (calibrationUpdate.status === 'calibrated') {
          setCalibrationState({ calibrated: true, progress: 1 });
          onJumpDuckGuidesChange(calibrationUpdate.guides);
          simulationClock = delayNextSpawn(simulationClock, now);
        }

        world.render();
        animationFrame = window.requestAnimationFrame(animate);
        return;
      }

      if (isHandRhythmGame) {
        const songTime = handRhythmMusicClock.getSongTime();
        while (nextRhythmNoteIndex < handRhythmSong.notes.length) {
          const note = handRhythmSong.notes[nextRhythmNoteIndex];
          if (!note || songTime < getRhythmNoteTimes(handRhythmSong, note).spawnTimeSeconds) {
            break;
          }
          if (isRhythmNoteVisible(
            handRhythmSong,
            note,
            songTime,
            OBSTACLE_SPAWN_Z,
            PLAYER_Z,
            OBSTACLE_DESPAWN_Z
          )) {
            const gridNote = fitRhythmNoteToGrid(note, handRhythmGridSize);
            for (let playerIndex = 0; playerIndex < playerCount; playerIndex += 1) {
              obstacleSystem.spawnHandRhythmTarget(gridNote, playerIndex);
              if (shouldAddCompanionTarget(note, handRhythmDoubleTargetChance)) {
                obstacleSystem.spawnHandRhythmTarget(
                  getCompanionRhythmNote(gridNote, handRhythmGridSize),
                  playerIndex
                );
              }
            }
          }
          nextRhythmNoteIndex += 1;
        }
      } else if (simulationStep.shouldSpawn) {
        obstacleSystem.spawnObstacle();
      }

      for (let index = obstacleSystem.obstacles.length - 1; index >= 0; index -= 1) {
        const obstacle = obstacleSystem.obstacles[index];
        if (obstacle.kind === 'hand-rhythm' && obstacle.rhythmNote) {
          obstacle.root.position.z = getRhythmTargetZ(
            handRhythmSong,
            obstacle.rhythmNote,
            handRhythmMusicClock.getSongTime(),
            OBSTACLE_SPAWN_Z,
            PLAYER_Z
          );
        } else {
          obstacle.root.position.z += OBSTACLE_SPEED * delta;
        }
        if (obstacle.kind === 'sideways') {
          obstacle.root.rotation.x += delta * 2.8;
          obstacle.root.rotation.z += delta * 1.5;
        } else if (obstacle.kind === 'jump-duck') {
          obstacle.root.children.forEach((child, childIndex) => {
            if (child.position.y < 1) {
              child.rotation.x += delta * 4.2;
            } else {
              child.rotation.z = Math.sin(now * 0.014 + childIndex) * 0.28;
            }
          });
        }

        const firstPlayerIndex = obstacle.targetPlayerIndex ?? 0;
        const lastPlayerIndex = obstacle.targetPlayerIndex ?? world.players.length - 1;

        for (let playerIndex = firstPlayerIndex; playerIndex <= lastPlayerIndex; playerIndex += 1) {
          const player = world.players[playerIndex];
          const isInCollisionRange = isPlayerInCollisionRange({
            kind: obstacle.kind,
            obstacleX: obstacle.x,
            obstacleY: obstacle.root.position.y,
            obstacleZ: obstacle.root.position.z,
            playerX: player.root.position.x,
            playerY: player.root.position.y,
            playerZ: PLAYER_Z,
            alreadyHit: Boolean(obstacle.hitBy[playerIndex]),
            radiusX: COLLISION_RADIUS_X,
            radiusZ: COLLISION_RADIUS_Z,
          });
          
          let hitCount = 0;
          if (obstacle.kind === 'hand-rhythm') {
            const isHandHitZone = obstacle.targetPlayerIndex === playerIndex &&
              Math.abs(obstacle.root.position.z - PLAYER_Z) < COLLISION_RADIUS_Z;
            if (isHandHitZone && obstacle.handResult === 'pending') {
              const hands = inputFrame.kind === 'gesture'
                ? inputFrame.players[playerIndex]?.hands ?? [inputFrame.players[playerIndex]?.hand ?? null]
                : [null];
              const wasHit = hands.some((hand) => isHandRhythmTargetMatch(
                hand,
                getHandRhythmPlayerMotion(
                  hand,
                  playerIndex,
                  world.players.length,
                  handRhythmGridSize
                ).cell,
                obstacle.gesture,
                obstacle.handCell
              ));
              obstacle.handResult = wasHit ? 'hit' : 'missed';
              obstacle.hitBy[playerIndex] = true;
              setHandRhythmFeedback(obstacle, wasHit);
              if (wasHit) {
                hitCount = 1;
              } else {
                setStats((current) => recordPlayerMiss(current, playerIndex));
              }
            }
          } else if (isInCollisionRange) {
            if (obstacle.kind === 'jump-duck') {
              hitCount = getJumpDuckPieceHitCount(obstacle, playerIndex, jumpDuckActionsRef.current[playerIndex] ?? 'run-center');
            } else if (obstacle.kind === 'sideways') {
              hitCount = 1;
            }
          }

          if (!hitCount) {
            continue;
          }

          obstacle.hitBy[playerIndex] = true;
          if (obstacle.kind === 'sideways') {
            obstacle.hitMaterials.forEach((material) => {
              material.color.set('#ffd166');
              material.emissive.set('#6b3e00');
              material.roughness = 0.34;
            });
          }
          simulationClock = scheduleHitStatusReset(simulationClock, now, 650);
          setStats((current) => recordPlayerHit(current, playerIndex, hitCount));
        }

        if (obstacle.root.position.z > OBSTACLE_DESPAWN_Z) {
          world.scene.remove(obstacle.root);
          disposeObject(obstacle.root);
          obstacleSystem.obstacles.splice(index, 1);
          if (!obstacle.hitBy.some(Boolean) && obstacle.hitPieces.size === 0) {
            setStats(recordDodgedObstacle);
          }
        }
      }

      if (simulationStep.shouldClearHitStatus) {
        setStats(clearHitStatus);
      }

      world.render();
      animationFrame = window.requestAnimationFrame(animate);
    };

    animationFrame = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      obstacleSystem.dispose();
      world.dispose();
    };
  }, [cameraMirrored, detectionOverlayRef, gameplayInputRef, handRhythmDoubleTargetChance, handRhythmGridSize, handRhythmMusicClock, handRhythmSong, isHandRhythmGame, onHandRhythmPlayersReady, onJumpDuckGuidesChange, onWorldProjectionChange, playerCount, selectedGameId, selectedLevel.camera, selectedLevel.spawnIntervalMs, showCameraPreview, showDetectionOverlay, showHandRhythmFloor, videoAspectRatio, videoRef]);

  return (
    <div
      className={`game-scene${isHandRhythmGame ? ` hand-rhythm-scene players-${playerCount}` : ''}${phase === 'running' ? ' game-running' : ''}`}
      ref={mountRef}
    >
      <div className="stage-heading">
        <p className="eyebrow">{t('game.heading')}</p>
        <h1>{t(selectedLevel.titleKey)}</h1>
      </div>
      <div className="game-hud" aria-label={t('game.status')}>
        <span>{statusLabel}</span>
      </div>
      {!isHandRhythmGame ? <dl className="game-stats" aria-label={t('game.stats')}>
        <div>
          <dt>{t('game.dodged')}</dt>
          <dd>{stats.dodged}</dd>
        </div>
        <div>
          <dt>{t('game.hits')}</dt>
          <dd>{stats.hits.reduce((total, hits) => total + hits, 0)}</dd>
        </div>
        {stats.hits.map((hits, index) => (
          <div key={`player-hits-${index + 1}`}>
            <dt>{t('game.playerHits', { player: index + 1 })}</dt>
            <dd className={`player-${index + 1}`}>{hits}</dd>
          </div>
        ))}
      </dl> : null}
      {isHandRhythmGame ? (
        <div
          className="hand-rhythm-player-viewports"
          data-testid="hand-rhythm-player-viewports"
          style={{ gridTemplateColumns: `repeat(${playerCount}, minmax(0, 1fr))` }}
          aria-label={t('game.handRhythmScores')}
        >
          {Array.from({ length: playerCount }, (_, index) => (
            <div
              className={`hand-rhythm-player-viewport player-${index + 1}${handRhythmPlayersReady[index] ? ' ready' : ''}`}
              key={`player-viewport-${index + 1}`}
            >
              {!handRhythmPreflightComplete ? (
                <div className="hand-rhythm-ready-cue">
                  <span>🖐️</span>
                </div>
              ) : null}
              <div
                className="hand-rhythm-player-score"
                aria-label={t('game.playerScore', { player: index + 1 })}
                aria-live="polite"
              >
                <span className="hand-rhythm-player-label">{`P${index + 1}`}</span>
                <dl>
                  <div className="hit-score">
                    <dt>{t('game.rhythmHits')}</dt>
                    <dd>{stats.hits[index] ?? 0}</dd>
                  </div>
                  <div className="miss-score">
                    <dt>{t('game.misses')}</dt>
                    <dd>{stats.misses[index] ?? 0}</dd>
                  </div>
                </dl>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
