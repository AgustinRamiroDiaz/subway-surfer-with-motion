import { useEffect, useRef, useState, type ReactElement } from 'react';
import * as THREE from 'three';
import { useI18n } from '../app/i18n';
import {
  createCalibrationRun,
  type CalibrationRun,
  type HorizontalAction,
  type JumpDuckCell,
  type JumpDuckGuide,
  type VerticalAction,
} from '../motion-mapping/jumpDuckActions';
import type { HandGestureDetection, PersonDetection } from '../pose-detection/detectionSchema';
import {
  COLLISION_RADIUS_X,
  COLLISION_RADIUS_Z,
  OBSTACLE_DESPAWN_Z,
  OBSTACLE_SPEED,
  PLAYER_BASE_Y,
  PLAYER_Z,
} from './gameConstants';
import {
  GAME_SELECTION_STORAGE_KEY,
  writeStoredRunnerGameId,
} from './gameStorage';
import type { GamePhase, GameStats, Obstacle, RunnerGameId } from './gameTypes';
import { SIDEWAYS_LEVEL_SPAWN_INTERVAL_MS, getSidewaysPlayerTargetX } from './levels/sidewaysLevel';
import {
  JUMP_DUCK_SPAWN_INTERVAL_MS,
  getInitialJumpDuckActions,
  getJumpDuckPlayerMotion,
  updateJumpDuckCalibration,
  type JumpDuckCalibrationState,
} from './levels/jumpDuckLevel';
import {
  type HandRhythmGridSize,
  HAND_RHYTHM_SPAWN_INTERVAL_MS,
  getHandRhythmPlayerMotion,
  GESTURE_TO_EMOJI,
} from './levels/handRhythmLevel';
import { createObstacleSystem } from './obstacles';
import { applyMarkerPose, disposeObject, getPoseAnimationState, updatePlayerGestureEmoji } from './playerAvatar';
import { createTrackWorld } from './trackWorld';

export { GAME_SELECTION_STORAGE_KEY };
export type { GamePhase };

type GameSceneProps = {
  phase: GamePhase;
  playerCount: number;
  handRhythmGridSize: HandRhythmGridSize;
  playerDetectionsRef: React.RefObject<Array<PersonDetection | HandGestureDetection | null>>;
  playerPositionsRef: React.RefObject<number[]>;
  selectedGameId: RunnerGameId;
  onJumpDuckGuidesChange: (guides: JumpDuckGuide[]) => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
};

function createDefaultStats(playerCount: number): GameStats {
  return {
    dodged: 0,
    hits: Array.from({ length: playerCount }, () => 0),
    status: 'running',
    hitPlayer: null,
  };
}

function getJumpDuckPieceHitCount(obstacle: Obstacle, playerIndex: number, cell: JumpDuckCell): number {
  const [verticalAction, horizontalAction] = cell.split('-') as [VerticalAction, HorizontalAction];
  let hitCount = 0;

  obstacle.pieces.forEach((piece) => {
    const hitKey = `${playerIndex}:${piece.cell}`;
    const isHit =
      !obstacle.hitPieces.has(hitKey) &&
      piece.blockedVerticals.includes(verticalAction) &&
      piece.blockedHorizontals.includes(horizontalAction);

    if (!isHit) {
      return;
    }

    obstacle.hitPieces.add(hitKey);
    piece.materials.forEach((material) => {
      material.color.set('#ffd166');
      material.emissive.set('#6b3e00');
      material.roughness = 0.34;
    });
    hitCount += 1;
  });

  return hitCount;
}

function setHandRhythmFeedback(obstacle: Obstacle, hit: boolean): void {
  const color = hit ? '#2fffb2' : '#ff4d6d';
  const emissive = hit ? '#0b5a3f' : '#6d1024';
  obstacle.feedbackMaterials.forEach((material) => {
    material.color.set(color);
    material.emissive.set(emissive);
    material.emissiveIntensity = 1.15;
  });
}
export function GameScene({
  phase,
  playerCount,
  handRhythmGridSize,
  playerDetectionsRef,
  playerPositionsRef,
  selectedGameId,
  onJumpDuckGuidesChange,
  videoRef,
}: GameSceneProps): ReactElement {
  const { t } = useI18n();
  const mountRef = useRef<HTMLDivElement | null>(null);
  const selectedGameIdRef = useRef<RunnerGameId>(selectedGameId);
  const gamePhaseRef = useRef<GamePhase>(phase);
  const calibrationRef = useRef<CalibrationRun>(createCalibrationRun(playerCount));
  const lastCalibrationProgressRef = useRef(-1);
  const jumpDuckActionsRef = useRef(getInitialJumpDuckActions(playerCount));
  const [calibrationState, setCalibrationState] = useState<JumpDuckCalibrationState>({
    calibrated: true,
    progress: 1,
  });
  const [stats, setStats] = useState<GameStats>(() => createDefaultStats(playerCount));

  useEffect(() => {
    selectedGameIdRef.current = selectedGameId;
    writeStoredRunnerGameId(selectedGameId);
    if (selectedGameId !== 'jump-duck') {
      onJumpDuckGuidesChange([]);
    }
  }, [onJumpDuckGuidesChange, selectedGameId]);

  useEffect(() => {
    setStats(createDefaultStats(playerCount));
    calibrationRef.current = createCalibrationRun(playerCount);
    jumpDuckActionsRef.current = getInitialJumpDuckActions(playerCount);
    lastCalibrationProgressRef.current = -1;
    setCalibrationState({
      calibrated: selectedGameId !== 'jump-duck',
      progress: selectedGameId !== 'jump-duck' ? 1 : 0,
    });
    onJumpDuckGuidesChange([]);
  }, [onJumpDuckGuidesChange, playerCount, selectedGameId]);

  useEffect(() => {
    gamePhaseRef.current = phase;
  }, [phase]);

  const isJumpDuckGame = selectedGameId === 'jump-duck';
  const isHandRhythmGame = selectedGameId === 'hand-rhythm';
  
  const statusLabel = phase === 'ready'
    ? isJumpDuckGame && !calibrationState.calibrated
      ? t('game.calibrationRequired')
      : t('game.ready')
    : phase === 'paused'
      ? t('game.paused')
      : isJumpDuckGame && !calibrationState.calibrated
        ? t('game.calibrating', { progress: Math.round(calibrationState.progress * 100) })
        : isHandRhythmGame
          ? t('game.running')
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
    let lastTime = performance.now();
    let lastSpawnAt = performance.now() - SIDEWAYS_LEVEL_SPAWN_INTERVAL_MS;
    let statusResetAt = 0;
    const world = createTrackWorld(mount, playerPositionsRef.current, selectedGameId, handRhythmGridSize);
    const obstacleSystem = createObstacleSystem(
      world.scene,
      () => selectedGameIdRef.current,
      () => playerPositionsRef.current.length,
      () => handRhythmGridSize
    );

    const resize = (): void => {
      const { clientWidth, clientHeight } = mount;
      const width = Math.max(1, clientWidth);
      const height = Math.max(1, clientHeight);
      world.camera.aspect = width / height;
      world.camera.zoom = world.camera.aspect < 1 ? world.camera.aspect : 1;
      world.camera.updateProjectionMatrix();
      world.renderer.setSize(width, height, false);
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();

    const animate = (now: number): void => {
      const delta = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      const isRunning = gamePhaseRef.current === 'running';
      const activeGameId = selectedGameIdRef.current;

      if (!isRunning) {
        world.renderer.render(world.scene, world.camera);
        animationFrame = window.requestAnimationFrame(animate);
        return;
      }

      const calibration = calibrationRef.current;
      const isCalibrating = activeGameId === 'jump-duck' && calibration.players === null;

      world.players.forEach((player, index) => {
        const detection = playerDetectionsRef.current[index] ?? null;
        const isHandRhythm = activeGameId === 'hand-rhythm';

        // Toggle visibility based on game mode
        if (player.gestureSprite) {
          player.gestureSprite.visible = isHandRhythm;
        }
        player.fallback.visible = !isHandRhythm && !player.rig;
        if (player.rig) {
          // Find the 3D model (children with pose-driven-player prefix)
          player.root.children.forEach((child) => {
            if (child.name.startsWith('pose-driven-player')) {
              child.visible = !isHandRhythm;
            }
          });
        }

        const poseState = getPoseAnimationState(detection as PersonDetection | null);
        const jumpDuckMotion = getJumpDuckPlayerMotion(
          detection as PersonDetection | null,
          calibration.players?.[index],
          index,
          world.players.length
        );
        const handRhythmMotion = getHandRhythmPlayerMotion(
          detection as HandGestureDetection | null,
          index,
          world.players.length,
          videoRef.current?.videoWidth ?? 640,
          videoRef.current?.videoHeight ?? 480,
          handRhythmGridSize
        );
        jumpDuckActionsRef.current[index] = jumpDuckMotion.cell;

        const targetX = isHandRhythm
          ? handRhythmMotion.targetX
          : activeGameId === 'jump-duck'
            ? jumpDuckMotion.targetX
            : getSidewaysPlayerTargetX(playerPositionsRef.current[index] ?? playerPositionsRef.current[0] ?? 0.5);
        const targetY = isHandRhythm
          ? handRhythmMotion.targetY
          : PLAYER_BASE_Y + (activeGameId === 'jump-duck' ? jumpDuckMotion.actionOffsetY : 0);
        const targetScaleY = activeGameId === 'jump-duck' ? jumpDuckMotion.scaleY : 1;

        if (isHandRhythm) {
          const emoji = GESTURE_TO_EMOJI[handRhythmMotion.gesture] ?? GESTURE_TO_EMOJI['None'];
          updatePlayerGestureEmoji(player, emoji);
        }

        player.poseEnergy = THREE.MathUtils.lerp(player.poseEnergy, poseState.energy, 0.18);
        player.root.position.x = THREE.MathUtils.lerp(player.root.position.x, targetX, 0.22);
        player.root.position.y = THREE.MathUtils.lerp(
          player.root.position.y,
          targetY + (isHandRhythm ? 0 : Math.sin(now * 0.012 + index) * 0.045 * player.poseEnergy),
          0.28
        );
        player.root.scale.y = THREE.MathUtils.lerp(player.root.scale.y, targetScaleY, 0.24);
        player.root.rotation.z = THREE.MathUtils.lerp(player.root.rotation.z, -poseState.lean * 0.5, 0.2);
        player.root.rotation.y = THREE.MathUtils.lerp(player.root.rotation.y, poseState.turn * 0.45, 0.16);
        player.fallback.rotation.y += delta * (2 + index * 0.35);
        
        if (!isHandRhythm) {
          applyMarkerPose(player, detection as PersonDetection | null);
        }
      });

      if (isCalibrating) {
        const calibrationUpdate = updateJumpDuckCalibration(
          calibration,
          playerDetectionsRef.current,
          now,
          lastCalibrationProgressRef.current
        );

        if (calibrationUpdate.status === 'calibrating') {
          lastCalibrationProgressRef.current = Math.round(calibrationUpdate.progress * 100) / 100;
          setCalibrationState({ calibrated: false, progress: calibrationUpdate.progress });
        } else if (calibrationUpdate.status === 'calibrated') {
          setCalibrationState({ calibrated: true, progress: 1 });
          onJumpDuckGuidesChange(calibrationUpdate.guides);
          lastSpawnAt = now;
        }

        world.renderer.render(world.scene, world.camera);
        animationFrame = window.requestAnimationFrame(animate);
        return;
      }

      const spawnInterval = activeGameId === 'hand-rhythm'
        ? HAND_RHYTHM_SPAWN_INTERVAL_MS
        : activeGameId === 'jump-duck'
          ? JUMP_DUCK_SPAWN_INTERVAL_MS
          : SIDEWAYS_LEVEL_SPAWN_INTERVAL_MS;
      if (now - lastSpawnAt > spawnInterval) {
        obstacleSystem.spawnObstacle();
        lastSpawnAt = now;
      }

      for (let index = obstacleSystem.obstacles.length - 1; index >= 0; index -= 1) {
        const obstacle = obstacleSystem.obstacles[index];
        obstacle.root.position.z += OBSTACLE_SPEED * delta;
        if (obstacle.kind === 'sideways') {
          obstacle.root.rotation.x += delta * 2.8;
          obstacle.root.rotation.z += delta * 1.5;
        } else {
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
          const canHitPlayer = obstacle.kind === 'jump-duck' || obstacle.kind === 'hand-rhythm' || !obstacle.hitBy[playerIndex];
          const isInCollisionRange =
            canHitPlayer &&
            Math.abs(obstacle.x - player.root.position.x) < (obstacle.kind === 'hand-rhythm' ? 0.6 : COLLISION_RADIUS_X) &&
            Math.abs(obstacle.root.position.y - player.root.position.y) < (obstacle.kind === 'hand-rhythm' ? 0.6 : 100) &&
            Math.abs(obstacle.root.position.z - PLAYER_Z) < COLLISION_RADIUS_Z;
          
          let hitCount = 0;
          if (obstacle.kind === 'hand-rhythm') {
            const isHandHitZone = obstacle.targetPlayerIndex === playerIndex &&
              Math.abs(obstacle.root.position.z - PLAYER_Z) < COLLISION_RADIUS_Z;
            if (isHandHitZone && obstacle.handResult === 'pending') {
              const detection = playerDetectionsRef.current[playerIndex] as HandGestureDetection | null;
              const motion = getHandRhythmPlayerMotion(
                detection,
                playerIndex,
                world.players.length,
                videoRef.current?.videoWidth ?? 640,
                videoRef.current?.videoHeight ?? 480,
                handRhythmGridSize
              );
              const isCorrectCell = motion.cell.row === obstacle.handCell?.row && motion.cell.column === obstacle.handCell?.column;
              const wasHit = detection?.gesture === obstacle.gesture && isCorrectCell;
              obstacle.handResult = wasHit ? 'hit' : 'missed';
              obstacle.hitBy[playerIndex] = true;
              setHandRhythmFeedback(obstacle, wasHit);
              if (wasHit) {
                hitCount = 1;
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
          statusResetAt = now + 650;
          setStats((current) => ({
            dodged: current.dodged,
            hits: current.hits.map((hits, index) => index === playerIndex ? hits + hitCount : hits),
            status: 'hit',
            hitPlayer: playerIndex + 1,
          }));
        }

        if (obstacle.root.position.z > OBSTACLE_DESPAWN_Z) {
          world.scene.remove(obstacle.root);
          disposeObject(obstacle.root);
          obstacleSystem.obstacles.splice(index, 1);
          if (!obstacle.hitBy.some(Boolean) && obstacle.hitPieces.size === 0) {
            setStats((current) => ({
              dodged: current.dodged + 1,
              hits: current.hits,
              status: current.status,
              hitPlayer: current.hitPlayer,
            }));
          }
        }
      }

      if (statusResetAt && now > statusResetAt) {
        statusResetAt = 0;
        setStats((current) => ({
          ...current,
          status: 'running',
          hitPlayer: null,
        }));
      }

      world.renderer.render(world.scene, world.camera);
      animationFrame = window.requestAnimationFrame(animate);
    };

    animationFrame = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      obstacleSystem.dispose();
      world.dispose();
    };
  }, [handRhythmGridSize, onJumpDuckGuidesChange, playerCount, playerDetectionsRef, playerPositionsRef, selectedGameId, videoRef]);

  return (
    <div className="game-scene" ref={mountRef}>
      <div className="stage-heading">
        <p className="eyebrow">{t('game.heading')}</p>
        <h1>
          {selectedGameId === 'sideways'
            ? t('game.sidewaysTitle')
            : selectedGameId === 'hand-rhythm'
              ? t('game.handRhythmTitle')
              : t('game.jumpDuckTitle')}
        </h1>
      </div>
      <div className="game-hud" aria-label={t('game.status')}>
        <span>{statusLabel}</span>
      </div>
      <dl className="game-stats" aria-label={t('game.stats')}>
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
      </dl>
    </div>
  );
}
