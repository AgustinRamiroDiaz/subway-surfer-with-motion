import { useEffect, useRef, useState, type ReactElement } from 'react';
import * as THREE from 'three';
import { useI18n } from '../../../app/i18n';
import { createCalibrationRun, type CalibrationRun, type JumpDuckCell, type JumpDuckGuide } from '../../../motion-mapping/jumpDuckActions';
import type { GameplayInputFrame } from '../../../motion-mapping/gameplayInput';
import {
  COLLISION_RADIUS_X,
  COLLISION_RADIUS_Z,
  OBSTACLE_DESPAWN_Z,
  OBSTACLE_SPEED,
  PLAYER_BASE_Y,
  PLAYER_Z,
  TRACK_MAX_X,
  TRACK_MIN_X,
} from '../../gameConstants';
import type { GamePhase, GameStats, Obstacle, PoseRunnerGameId } from '../../gameTypes';
import {
  advanceGameSimulation,
  clearHitStatus,
  createDefaultStats,
  createGameSimulationClock,
  delayNextSpawn,
  findJumpDuckPieceHits,
  isPlayerInCollisionRange,
  recordDodgedObstacle,
  recordPlayerHit,
  scheduleHitStatusReset,
} from '../../gameSimulation';
import { getInitialJumpDuckActions, updateJumpDuckCalibration, type JumpDuckCalibrationState } from '../../levels/jumpDuckLevel';
import { getPoseRunnerLevel } from '../../levelRegistry';
import { createObstacleSystem } from '../../obstacles';
import { applyMarkerPose, disposeObject, getPoseAnimationState } from '../../playerAvatar';
import { createPoseRunnerWorld } from '../../trackWorld';
import { projectWorldPoint, type WorldProjection } from '../../shared/worldProjection';
import { createRenderFrameLimiter } from '../../shared/renderFrameLimiter';

export type PoseRunnerSceneProps = {
  gameplayInputRef: React.RefObject<GameplayInputFrame>;
  onJumpDuckGuidesChange: (guides: JumpDuckGuide[]) => void;
  onWorldProjectionChange: (projection: WorldProjection) => void;
  phase: GamePhase;
  playerCount: number;
  renderFps: number;
  selectedGameId: PoseRunnerGameId;
  videoAspectRatio: number;
};

function getJumpDuckPieceHitCount(obstacle: Obstacle, playerIndex: number, cell: JumpDuckCell): number {
  const hits = findJumpDuckPieceHits(obstacle.pieces, obstacle.hitPieces, playerIndex, cell);
  hits.forEach(({ key, pieceIndex }) => {
    obstacle.hitPieces.add(key);
    obstacle.pieces[pieceIndex].materials.forEach((material) => {
      material.color.set('#ffd166');
      material.emissive.set('#6b3e00');
      material.roughness = 0.34;
    });
  });
  return hits.length;
}

export function PoseRunnerScene({
  gameplayInputRef,
  onJumpDuckGuidesChange,
  onWorldProjectionChange,
  phase,
  playerCount,
  renderFps,
  selectedGameId,
  videoAspectRatio,
}: PoseRunnerSceneProps): ReactElement {
  const { t } = useI18n();
  const mountRef = useRef<HTMLDivElement | null>(null);
  const phaseRef = useRef<GamePhase>(phase);
  const renderFpsRef = useRef(renderFps);
  renderFpsRef.current = renderFps;
  const calibrationRef = useRef<CalibrationRun>(createCalibrationRun(playerCount));
  const lastCalibrationProgressRef = useRef(-1);
  const jumpDuckActionsRef = useRef(getInitialJumpDuckActions(playerCount));
  const level = getPoseRunnerLevel(selectedGameId);
  const [stats, setStats] = useState<GameStats>(() => createDefaultStats(playerCount));
  const [calibrationState, setCalibrationState] = useState<JumpDuckCalibrationState>({
    calibrated: !level.requiresCalibration,
    progress: level.requiresCalibration ? 0 : 1,
  });

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    setStats(createDefaultStats(playerCount));
    calibrationRef.current = createCalibrationRun(playerCount);
    jumpDuckActionsRef.current = getInitialJumpDuckActions(playerCount);
    lastCalibrationProgressRef.current = -1;
    setCalibrationState({
      calibrated: !level.requiresCalibration,
      progress: level.requiresCalibration ? 0 : 1,
    });
    onJumpDuckGuidesChange([]);
  }, [level.requiresCalibration, onJumpDuckGuidesChange, playerCount, selectedGameId]);

  const statusLabel = phase === 'ready'
    ? level.requiresCalibration && !calibrationState.calibrated
      ? t('game.calibrationRequired')
      : t('game.ready')
    : phase === 'paused'
      ? t('game.paused')
      : level.requiresCalibration && !calibrationState.calibrated
        ? t('game.calibrating', { progress: Math.round(calibrationState.progress * 100) })
        : stats.status === 'hit' && stats.hitPlayer !== null
          ? t('game.playerHit', { player: stats.hitPlayer })
          : t('game.running');

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || import.meta.env.MODE === 'test') return undefined;

    let animationFrame = 0;
    const startedAt = performance.now();
    let simulationClock = createGameSimulationClock(startedAt, level.spawnIntervalMs);
    const initialPositions = gameplayInputRef.current.kind === 'pose'
      ? gameplayInputRef.current.players.map((player) => player.normalizedX)
      : Array.from({ length: playerCount }, (_, index) => (index + 1) / (playerCount + 1));
    const world = createPoseRunnerWorld(mount, initialPositions, selectedGameId, level.camera);
    const obstacleSystem = createObstacleSystem(
      world.scene,
      () => selectedGameId,
      () => playerCount
    );
    const renderFrameLimiter = createRenderFrameLimiter();
    const renderWorld = (nowMs: number): void => {
      if (renderFrameLimiter.shouldRender(nowMs, renderFpsRef.current)) {
        world.render();
      }
    };

    const resize = (): void => {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      world.resize(width, height);
      const projectionHeight = (TRACK_MAX_X - TRACK_MIN_X) / Math.max(0.1, videoAspectRatio);
      const corners = [
        projectWorldPoint(world.camera, TRACK_MIN_X, PLAYER_BASE_Y, PLAYER_Z),
        projectWorldPoint(world.camera, TRACK_MAX_X, PLAYER_BASE_Y, PLAYER_Z),
        projectWorldPoint(world.camera, TRACK_MIN_X, PLAYER_BASE_Y + projectionHeight, PLAYER_Z),
        projectWorldPoint(world.camera, TRACK_MAX_X, PLAYER_BASE_Y + projectionHeight, PLAYER_Z),
      ];
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
      const calibration = calibrationRef.current;
      const isCalibrating = level.requiresCalibration && calibration.players === null;
      const step = advanceGameSimulation(
        simulationClock,
        now,
        phaseRef.current,
        level.spawnIntervalMs,
        !isCalibrating
      );
      simulationClock = step.clock;

      if (phaseRef.current !== 'running') {
        renderWorld(now);
        animationFrame = window.requestAnimationFrame(animate);
        return;
      }

      const inputFrame = gameplayInputRef.current;
      world.players.forEach((player, playerIndex) => {
        const motion = level.getPlayerMotion({
          inputFrame,
          playerIndex,
          playerCount: world.players.length,
          calibration: calibration.players?.[playerIndex],
        });
        const poseState = getPoseAnimationState(motion.pose);
        if (motion.jumpDuckCell) jumpDuckActionsRef.current[playerIndex] = motion.jumpDuckCell;
        player.poseEnergy = THREE.MathUtils.lerp(player.poseEnergy, poseState.energy, 0.18);
        player.root.position.x = THREE.MathUtils.lerp(player.root.position.x, motion.targetX, 0.22);
        player.root.position.y = THREE.MathUtils.lerp(
          player.root.position.y,
          motion.targetY + Math.sin(now * 0.012 + playerIndex) * 0.045 * player.poseEnergy,
          0.28
        );
        player.root.scale.y = THREE.MathUtils.lerp(player.root.scale.y, motion.targetScaleY, 0.24);
        player.root.rotation.z = THREE.MathUtils.lerp(player.root.rotation.z, -poseState.lean * 0.5, 0.2);
        player.root.rotation.y = THREE.MathUtils.lerp(player.root.rotation.y, poseState.turn * 0.45, 0.16);
        player.fallback.rotation.y += step.deltaSeconds * (2 + playerIndex * 0.35);
        applyMarkerPose(player, motion.pose);
      });

      if (isCalibrating) {
        const update = updateJumpDuckCalibration(
          calibration,
          inputFrame.kind === 'pose' ? inputFrame.players.map((player) => player.pose) : [],
          now,
          lastCalibrationProgressRef.current
        );
        if (update.status === 'calibrating') {
          lastCalibrationProgressRef.current = Math.round(update.progress * 100) / 100;
          setCalibrationState({ calibrated: false, progress: update.progress });
        } else if (update.status === 'calibrated') {
          setCalibrationState({ calibrated: true, progress: 1 });
          onJumpDuckGuidesChange(update.guides);
          simulationClock = delayNextSpawn(simulationClock, now);
        }
        renderWorld(now);
        animationFrame = window.requestAnimationFrame(animate);
        return;
      }

      if (step.shouldSpawn) obstacleSystem.spawnObstacle();

      for (let index = obstacleSystem.obstacles.length - 1; index >= 0; index -= 1) {
        const obstacle = obstacleSystem.obstacles[index];
        obstacle.root.position.z += OBSTACLE_SPEED * step.deltaSeconds;
        if (obstacle.kind === 'sideways') {
          obstacle.root.rotation.x += step.deltaSeconds * 2.8;
          obstacle.root.rotation.z += step.deltaSeconds * 1.5;
        } else {
          obstacle.root.children.forEach((child, childIndex) => {
            if (child.position.y < 1) child.rotation.x += step.deltaSeconds * 4.2;
            else child.rotation.z = Math.sin(now * 0.014 + childIndex) * 0.28;
          });
        }

        const firstPlayerIndex = obstacle.targetPlayerIndex ?? 0;
        const lastPlayerIndex = obstacle.targetPlayerIndex ?? world.players.length - 1;
        for (let playerIndex = firstPlayerIndex; playerIndex <= lastPlayerIndex; playerIndex += 1) {
          const player = world.players[playerIndex];
          const inRange = isPlayerInCollisionRange({
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
          if (!inRange) continue;
          const hitCount = obstacle.kind === 'jump-duck'
            ? getJumpDuckPieceHitCount(obstacle, playerIndex, jumpDuckActionsRef.current[playerIndex] ?? 'run-center')
            : 1;
          if (!hitCount) continue;
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
          if (!obstacle.hitBy.some(Boolean) && obstacle.hitPieces.size === 0) setStats(recordDodgedObstacle);
        }
      }
      if (step.shouldClearHitStatus) setStats(clearHitStatus);
      renderWorld(now);
      animationFrame = window.requestAnimationFrame(animate);
    };

    animationFrame = window.requestAnimationFrame(animate);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      obstacleSystem.dispose();
      world.dispose();
    };
  }, [gameplayInputRef, level, onJumpDuckGuidesChange, onWorldProjectionChange, playerCount, selectedGameId, videoAspectRatio]);

  return (
    <div className={`game-scene${phase === 'running' ? ' game-running' : ''}`} ref={mountRef}>
      <div className="stage-heading"><p className="eyebrow">{t('game.heading')}</p><h1>{t(level.titleKey)}</h1></div>
      <div className="game-hud" aria-label={t('game.status')}><span>{statusLabel}</span></div>
      <dl className="game-stats" aria-label={t('game.stats')}>
        <div><dt>{t('game.dodged')}</dt><dd>{stats.dodged}</dd></div>
        <div><dt>{t('game.hits')}</dt><dd>{stats.hits.reduce((total, hits) => total + hits, 0)}</dd></div>
        {stats.hits.map((hits, index) => (
          <div key={`player-hits-${index + 1}`}><dt>{t('game.playerHits', { player: index + 1 })}</dt><dd className={`player-${index + 1}`}>{hits}</dd></div>
        ))}
      </dl>
    </div>
  );
}
