import { useEffect, useRef, useState, type ReactElement } from 'react';
import * as THREE from 'three';
import { useI18n } from '../../../app/i18n';
import type { GameplayInputFrame, HandInput } from '../../../motion-mapping/gameplayInput';
import type { GamePhase } from '../../gameTypes';
import { disposeObject } from '../../playerAvatar';
import type { WorldProjection } from '../../shared/worldProjection';
import {
  CLIMBER_KNOBS,
  CLIMBER_MAX_SCROLL,
  CLIMBER_VIEW_HEIGHT,
  CLIMBER_WALL_HEIGHT,
  createClimberState,
  mapHandToClimbingViewport,
  updateClimberFromHands,
  type ClimberFeedback,
  type ClimberState,
} from './climberSimulation';

type ClimberSceneProps = {
  gameplayInputRef: React.RefObject<GameplayInputFrame>;
  onWorldProjectionChange: (projection: WorldProjection) => void;
  phase: GamePhase;
  playerCount: number;
};

type ClimberVisual = {
  wall: THREE.Group;
  cursors: THREE.Mesh[];
  knobs: Map<string, THREE.Mesh>;
};

type PlayerStatus = {
  completed: boolean;
  feedback: ClimberFeedback;
  grabbed: number;
  progress: number;
};

const PLAYER_WALL_WIDTH = 4.72;
const PLAYER_SPACING = 5.08;

function playerCenterX(playerIndex: number, playerCount: number): number {
  return (playerIndex - (playerCount - 1) / 2) * PLAYER_SPACING;
}

function createClimberVisual(scene: THREE.Scene, centerX: number, playerIndex: number): ClimberVisual {
  const wall = new THREE.Group();
  wall.position.x = centerX;
  scene.add(wall);

  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(PLAYER_WALL_WIDTH, CLIMBER_WALL_HEIGHT),
    new THREE.MeshStandardMaterial({
      color: playerIndex % 2 === 0 ? '#26343b' : '#202d34',
      roughness: 0.98,
    })
  );
  face.position.set(0, CLIMBER_WALL_HEIGHT / 2, 0);
  wall.add(face);

  for (let y = 1.5; y < CLIMBER_WALL_HEIGHT; y += 2.25) {
    const seam = new THREE.Mesh(
      new THREE.PlaneGeometry(PLAYER_WALL_WIDTH - 0.15, 0.025),
      new THREE.MeshBasicMaterial({ color: '#3a4850', transparent: true, opacity: 0.48 })
    );
    seam.position.set(0, y, 0.04);
    wall.add(seam);
  }

  const goal = new THREE.Mesh(
    new THREE.PlaneGeometry(PLAYER_WALL_WIDTH - 0.24, 0.22),
    new THREE.MeshBasicMaterial({ color: '#2fffb2', transparent: true, opacity: 0.9 })
  );
  goal.position.set(0, CLIMBER_WALL_HEIGHT - 0.22, 0.09);
  wall.add(goal);

  const knobs = new Map<string, THREE.Mesh>();
  CLIMBER_KNOBS.forEach((knob, index) => {
    const material = new THREE.MeshStandardMaterial({
      color: knob.color,
      emissive: '#100d08',
      emissiveIntensity: 0.3,
      roughness: 0.62,
    });
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(knob.size, 18), material);
    mesh.scale.y = 0.72 + (index % 4) * 0.1;
    mesh.rotation.z = index * 0.67;
    mesh.position.set(knob.position.x, knob.position.y, 0.18);
    wall.add(mesh);
    knobs.set(knob.id, mesh);
  });

  const cursors = Array.from({ length: 2 }, (_, index) => {
    const cursor = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 0.29, 28),
      new THREE.MeshBasicMaterial({
        color: index === 0 ? '#ffffff' : '#b9dbff',
        transparent: true,
        opacity: 0.95,
      })
    );
    cursor.position.z = 0.65;
    cursor.visible = false;
    scene.add(cursor);
    return cursor;
  });
  return { wall, cursors, knobs };
}

function updateVisual(visual: ClimberVisual, state: ClimberState): void {
  visual.wall.position.y = -state.scrollY;
  const grabbed = new Set(state.grabbedKnobByHand.filter((id): id is string => Boolean(id)));
  visual.knobs.forEach((mesh, knobId) => {
    const isGrabbed = grabbed.has(knobId);
    const material = mesh.material as THREE.MeshStandardMaterial;
    material.emissive.set(isGrabbed ? '#ff8a18' : '#100d08');
    material.emissiveIntensity = isGrabbed ? 1.8 : 0.3;
    mesh.scale.z = isGrabbed ? 1.3 : 1;
    const baseScale = isGrabbed ? 1.28 : 1;
    mesh.scale.x = baseScale;
    mesh.scale.y = (0.72 + (CLIMBER_KNOBS.findIndex((knob) => knob.id === knobId) % 4) * 0.1) * baseScale;
  });
}

function updateCursors(
  visual: ClimberVisual,
  state: ClimberState,
  hands: Array<HandInput | null>,
  playerIndex: number,
  playerCount: number,
  centerX: number
): void {
  visual.cursors.forEach((cursor, handIndex) => {
    const hand = hands[handIndex];
    cursor.visible = Boolean(hand);
    if (!hand) return;
    const point = mapHandToClimbingViewport(hand, playerIndex, playerCount);
    cursor.position.set(centerX + point.x, point.y, 0.65);
    const attached = Boolean(state.grabbedKnobByHand[handIndex]);
    const material = cursor.material as THREE.MeshBasicMaterial;
    material.color.set(attached ? '#ff9f1c' : hand.gesture === 'Closed_Fist' ? '#ffd166' : hand.gesture === 'Open_Palm' ? '#2fffb2' : '#ffffff');
    cursor.scale.setScalar(attached ? 0.82 : 1);
  });
}

export function ClimberScene({
  gameplayInputRef,
  onWorldProjectionChange,
  phase,
  playerCount,
}: ClimberSceneProps): ReactElement {
  const { t } = useI18n();
  const mountRef = useRef<HTMLDivElement | null>(null);
  const phaseRef = useRef(phase);
  const resetRef = useRef(false);
  const [statuses, setStatuses] = useState<PlayerStatus[]>(() => Array.from({ length: playerCount }, () => ({
    completed: false, feedback: 'none', grabbed: 0, progress: 0,
  })));
  const statusesRef = useRef(statuses);

  useEffect(() => {
    statusesRef.current = statuses;
  }, [statuses]);

  useEffect(() => {
    phaseRef.current = phase;
    if (phase === 'ready') resetRef.current = true;
  }, [phase]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || import.meta.env.MODE === 'test') return undefined;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#10171b');
    const camera = new THREE.OrthographicCamera(-4, 4, 4.5, -4.5, 0.1, 30);
    camera.position.set(0, CLIMBER_VIEW_HEIGHT / 2, 12);
    camera.lookAt(0, CLIMBER_VIEW_HEIGHT / 2, 0);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.className = 'game-canvas';
    mount.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight('#dfffee', '#11191d', 1.8));
    const light = new THREE.DirectionalLight('#ffffff', 2.5);
    light.position.set(-4, 9, 8);
    scene.add(light);

    let states = Array.from({ length: playerCount }, () => createClimberState());
    const visuals = states.map((_, index) => createClimberVisual(scene, playerCenterX(index, playerCount), index));
    let animationFrame = 0;

    const resize = (): void => {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      const aspect = width / height;
      const requiredWidth = playerCount * PLAYER_SPACING + 0.2;
      const visibleHeight = Math.max(CLIMBER_VIEW_HEIGHT + 0.55, requiredWidth / Math.max(0.25, aspect));
      const visibleWidth = visibleHeight * aspect;
      camera.left = -visibleWidth / 2;
      camera.right = visibleWidth / 2;
      camera.top = CLIMBER_VIEW_HEIGHT / 2 + visibleHeight / 2;
      camera.bottom = CLIMBER_VIEW_HEIGHT / 2 - visibleHeight / 2;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      onWorldProjectionChange({ left: 0, right: 1, top: 0, bottom: 1 });
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    const animate = (): void => {
      if (resetRef.current) {
        states = Array.from({ length: playerCount }, () => createClimberState());
        const resetStatuses = Array.from({ length: playerCount }, () => ({
          completed: false, feedback: 'none' as const, grabbed: 0, progress: 0,
        }));
        statusesRef.current = resetStatuses;
        setStatuses(resetStatuses);
        resetRef.current = false;
      }
      const input = gameplayInputRef.current;
      const nextStatuses: PlayerStatus[] = [];
      states = states.map((state, playerIndex) => {
        const hands = input.kind === 'gesture'
          ? input.players[playerIndex]?.hands ?? [input.players[playerIndex]?.hand ?? null]
          : [null, null];
        const next = phaseRef.current === 'running'
          ? updateClimberFromHands(state, hands, playerIndex, playerCount)
          : state;
        const visual = visuals[playerIndex];
        updateVisual(visual, next);
        updateCursors(visual, next, hands, playerIndex, playerCount, playerCenterX(playerIndex, playerCount));
        nextStatuses.push({
          completed: next.completed,
          feedback: next.feedback === 'none' ? statusesRef.current[playerIndex]?.feedback ?? 'none' : next.feedback,
          grabbed: next.grabbedKnobByHand.filter(Boolean).length,
          progress: Math.round(next.scrollY / CLIMBER_MAX_SCROLL * 100),
        });
        return next;
      });
      setStatuses((current) => nextStatuses.some((status, index) => (
        status.completed !== current[index]?.completed
        || status.feedback !== current[index]?.feedback
        || status.grabbed !== current[index]?.grabbed
        || status.progress !== current[index]?.progress
      )) ? nextStatuses : current);
      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(animate);
    };
    animationFrame = window.requestAnimationFrame(animate);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      observer.disconnect();
      scene.children.slice().forEach((child) => disposeObject(child));
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [gameplayInputRef, onWorldProjectionChange, playerCount]);

  const completedCount = statuses.filter((status) => status.completed).length;
  const statusLabel = phase === 'ready'
    ? t('game.ready')
    : phase === 'paused'
      ? t('game.paused')
      : completedCount === playerCount
        ? t('game.climberComplete')
        : t('game.climberInstruction');

  return (
    <div className={`game-scene climber-scene players-${playerCount}${phase === 'running' ? ' game-running' : ''}`} ref={mountRef}>
      <div className="stage-heading"><p className="eyebrow">{t('game.heading')}</p><h1>{t('game.climberTitle')}</h1></div>
      <div className="game-hud" aria-label={t('game.status')}><span>{statusLabel}</span></div>
      <div className="climber-player-statuses" style={{ gridTemplateColumns: `repeat(${playerCount}, minmax(0, 1fr))` }}>
        {statuses.map((status, index) => (
          <div className={`climber-player-status player-${index + 1}${status.completed ? ' complete' : ''}`} key={`climber-status-${index + 1}`}>
            <strong>{`P${index + 1}`}</strong>
            <span>{status.completed ? t('game.climberAtTop') : t('game.climberProgress', { progress: status.progress })}</span>
            <span>{status.completed
              ? t('game.climberAtTop')
              : status.feedback === 'occupied'
                ? t('game.climberOccupied')
                : status.feedback === 'no-knob'
                  ? t('game.climberNoRock')
                  : status.grabbed === 2
                    ? t('game.climberPulling')
                    : t('game.climberHolding', { hands: status.grabbed })}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
