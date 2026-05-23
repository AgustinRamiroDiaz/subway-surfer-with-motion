import { useEffect, useRef, useState, type ReactElement } from 'react';
import * as THREE from 'three';
import { useI18n } from '../app/i18n';
import { createCalibrationRun, type CalibrationRun, type JumpDuckGuide } from '../motion-mapping/jumpDuckActions';
import type { PersonDetection } from '../pose-detection/detectionSchema';
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
  readStoredRunnerGameId,
  writeStoredRunnerGameId,
} from './gameStorage';
import type { GamePhase, GameStats, RunnerGameId } from './gameTypes';
import { SIDEWAYS_LEVEL_SPAWN_INTERVAL_MS, getSidewaysPlayerTargetX } from './levels/sidewaysLevel';
import {
  JUMP_DUCK_SPAWN_INTERVAL_MS,
  getInitialJumpDuckActions,
  getJumpDuckPlayerMotion,
  updateJumpDuckCalibration,
  type JumpDuckCalibrationState,
} from './levels/jumpDuckLevel';
import { createObstacleSystem } from './obstacles';
import { applyMarkerPose, getPoseAnimationState } from './playerAvatar';
import { createTrackWorld } from './trackWorld';

export { GAME_SELECTION_STORAGE_KEY };
export type { GamePhase };

type GameSceneProps = {
  canStart: boolean;
  phase: GamePhase;
  playerDetections: Array<PersonDetection | null>;
  playerPositions: number[];
  startLabel: string;
  onPause: () => void;
  onStart: () => void;
  onJumpDuckGuidesChange: (guides: JumpDuckGuide[]) => void;
};

function createDefaultStats(playerCount: number): GameStats {
  return {
    dodged: 0,
    hits: Array.from({ length: playerCount }, () => 0),
    status: 'running',
    hitPlayer: null,
  };
}

export function GameScene({
  canStart,
  phase,
  playerDetections,
  playerPositions,
  startLabel,
  onPause,
  onStart,
  onJumpDuckGuidesChange,
}: GameSceneProps): ReactElement {
  const { t } = useI18n();
  const mountRef = useRef<HTMLDivElement | null>(null);
  const playerCount = playerPositions.length;
  const [selectedGameId, setSelectedGameId] = useState<RunnerGameId>(readStoredRunnerGameId);
  const selectedGameIdRef = useRef<RunnerGameId>(selectedGameId);
  const playerPositionsRef = useRef(playerPositions);
  const playerDetectionsRef = useRef(playerDetections);
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
    playerPositionsRef.current = playerPositions;
  }, [playerPositions]);

  useEffect(() => {
    selectedGameIdRef.current = selectedGameId;
    if (selectedGameId !== 'jump-duck') {
      onJumpDuckGuidesChange([]);
    }
  }, [onJumpDuckGuidesChange, selectedGameId]);

  useEffect(() => {
    playerDetectionsRef.current = playerDetections;
  }, [playerDetections]);

  useEffect(() => {
    setStats(createDefaultStats(playerCount));
    calibrationRef.current = createCalibrationRun(playerCount);
    jumpDuckActionsRef.current = getInitialJumpDuckActions(playerCount);
    lastCalibrationProgressRef.current = -1;
    setCalibrationState({
      calibrated: selectedGameId === 'sideways',
      progress: selectedGameId === 'sideways' ? 1 : 0,
    });
    onJumpDuckGuidesChange([]);
  }, [onJumpDuckGuidesChange, playerCount, selectedGameId]);

  useEffect(() => {
    gamePhaseRef.current = phase;
  }, [phase]);

  const handleGameSelection = (gameId: RunnerGameId): void => {
    if (gameId === selectedGameId) {
      return;
    }

    if (phase === 'running') {
      onPause();
    }

    setSelectedGameId(gameId);
    writeStoredRunnerGameId(gameId);
  };

  const isJumpDuckGame = selectedGameId === 'jump-duck';
  const statusLabel = phase === 'ready'
    ? isJumpDuckGame && !calibrationState.calibrated
      ? t('game.calibrationRequired')
      : t('game.ready')
    : phase === 'paused'
      ? t('game.paused')
      : isJumpDuckGame && !calibrationState.calibrated
        ? t('game.calibrating', { progress: Math.round(calibrationState.progress * 100) })
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
    const world = createTrackWorld(mount, playerPositionsRef.current);
    const obstacleSystem = createObstacleSystem(
      world.scene,
      () => selectedGameIdRef.current,
      () => playerPositionsRef.current.length
    );

    const resize = (): void => {
      const { clientWidth, clientHeight } = mount;
      const width = Math.max(1, clientWidth);
      const height = Math.max(1, clientHeight);
      world.camera.aspect = width / height;
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
        const poseState = getPoseAnimationState(detection);
        const jumpDuckMotion = getJumpDuckPlayerMotion(
          detection,
          calibration.players?.[index],
          index,
          world.players.length
        );
        jumpDuckActionsRef.current[index] = jumpDuckMotion.cell;
        const targetX = activeGameId === 'jump-duck'
          ? jumpDuckMotion.targetX
          : getSidewaysPlayerTargetX(playerPositionsRef.current[index] ?? playerPositionsRef.current[0] ?? 0.5);
        const actionOffsetY = activeGameId === 'jump-duck' ? jumpDuckMotion.actionOffsetY : 0;
        const targetScaleY = activeGameId === 'jump-duck' ? jumpDuckMotion.scaleY : 1;

        player.poseEnergy = THREE.MathUtils.lerp(player.poseEnergy, poseState.energy, 0.18);
        player.root.position.x = THREE.MathUtils.lerp(player.root.position.x, targetX, 0.22);
        player.root.position.y = THREE.MathUtils.lerp(
          player.root.position.y,
          PLAYER_BASE_Y + actionOffsetY + Math.sin(now * 0.012 + index) * 0.045 * player.poseEnergy,
          0.28
        );
        player.root.scale.y = THREE.MathUtils.lerp(player.root.scale.y, targetScaleY, 0.24);
        player.root.rotation.z = THREE.MathUtils.lerp(player.root.rotation.z, -poseState.lean * 0.5, 0.2);
        player.root.rotation.y = THREE.MathUtils.lerp(player.root.rotation.y, poseState.turn * 0.45, 0.16);
        player.fallback.rotation.y += delta * (2 + index * 0.35);
        applyMarkerPose(player, detection);
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

      const spawnInterval = activeGameId === 'jump-duck'
        ? JUMP_DUCK_SPAWN_INTERVAL_MS
        : SIDEWAYS_LEVEL_SPAWN_INTERVAL_MS;
      if (now - lastSpawnAt > spawnInterval) {
        obstacleSystem.spawnObstacle();
        lastSpawnAt = now;
      }

      for (let index = obstacleSystem.obstacles.length - 1; index >= 0; index -= 1) {
        const obstacle = obstacleSystem.obstacles[index];
        obstacle.mesh.position.z += OBSTACLE_SPEED * delta;
        obstacle.mesh.rotation.x += delta * 2.8;
        obstacle.mesh.rotation.z += delta * 1.5;

        const firstPlayerIndex = obstacle.targetPlayerIndex ?? 0;
        const lastPlayerIndex = obstacle.targetPlayerIndex ?? world.players.length - 1;

        for (let playerIndex = firstPlayerIndex; playerIndex <= lastPlayerIndex; playerIndex += 1) {
          const player = world.players[playerIndex];
          const isInCollisionRange =
            !obstacle.hitBy[playerIndex] &&
            Math.abs(obstacle.x - player.root.position.x) < COLLISION_RADIUS_X &&
            Math.abs(obstacle.mesh.position.z - PLAYER_Z) < COLLISION_RADIUS_Z;
          const blockedJumpDuckCell =
            obstacle.kind === 'jump-duck' && obstacle.blockedCells.includes(jumpDuckActionsRef.current[playerIndex] ?? 'run-center');
          const isCollision = isInCollisionRange && (obstacle.kind === 'sideways' || blockedJumpDuckCell);

          if (!isCollision) {
            continue;
          }

          obstacle.hitBy[playerIndex] = true;
          obstacle.mesh.material.color.set('#ffd166');
          obstacle.mesh.material.emissive.set('#6b3e00');
          obstacle.mesh.material.roughness = 0.34;
          statusResetAt = now + 650;
          setStats((current) => ({
            dodged: current.dodged,
            hits: current.hits.map((hits, index) => index === playerIndex ? hits + 1 : hits),
            status: 'hit',
            hitPlayer: playerIndex + 1,
          }));
        }

        if (obstacle.mesh.position.z > OBSTACLE_DESPAWN_Z) {
          world.scene.remove(obstacle.mesh);
          obstacle.mesh.geometry.dispose();
          obstacle.mesh.material.dispose();
          obstacleSystem.obstacles.splice(index, 1);
          if (!obstacle.hitBy.some(Boolean)) {
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
  }, [onJumpDuckGuidesChange, playerCount]);

  return (
    <div className="game-scene" ref={mountRef}>
      <div className="stage-heading">
        <p className="eyebrow">{t('game.heading')}</p>
        <h1>{selectedGameId === 'sideways' ? t('game.sidewaysTitle') : t('game.jumpDuckTitle')}</h1>
        <div className="game-mode-selector" aria-label={t('game.modeSelector')}>
          <button
            type="button"
            className={selectedGameId === 'sideways' ? 'active' : ''}
            aria-pressed={selectedGameId === 'sideways'}
            onClick={() => handleGameSelection('sideways')}
          >
            {t('game.sidewaysMode')}
          </button>
          <button
            type="button"
            className={selectedGameId === 'jump-duck' ? 'active' : ''}
            aria-pressed={selectedGameId === 'jump-duck'}
            onClick={() => handleGameSelection('jump-duck')}
          >
            {t('game.jumpDuckMode')}
          </button>
        </div>
      </div>
      <div className="game-hud" aria-label={t('game.status')}>
        <span>{statusLabel}</span>
      </div>
      <div className="game-controls" aria-label={t('game.controls')}>
        <button
          className="primary-action"
          type="button"
          disabled={!canStart || phase === 'running'}
          onClick={onStart}
        >
          {startLabel}
        </button>
        <button type="button" disabled={phase !== 'running'} onClick={onPause}>
          {t('game.pause')}
        </button>
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
