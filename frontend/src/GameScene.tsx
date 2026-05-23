import { useEffect, useRef, useState, type ReactElement } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { PersonDetection, PoseKeypoint } from './aiDetector';
import { useI18n } from './i18n';

const TRACK_MIN_X = -3.15;
const TRACK_MAX_X = 3.15;
const TRACK_WIDTH = TRACK_MAX_X - TRACK_MIN_X;
const PLAYER_Z = 2.6;
const PLAYER_BASE_Y = 0.05;
const OBSTACLE_SPAWN_Z = -18;
const OBSTACLE_DESPAWN_Z = 5.2;
const OBSTACLE_SPEED = 7.2;
const SPAWN_INTERVAL_MS = 2000;
const COLLISION_RADIUS_X = 0.92;
const COLLISION_RADIUS_Z = 0.78;
const PLAYER_COLORS = ['#2fffb2', '#66a3ff', '#ffd166', '#ff6a85'] as const;
const PLAYER_EMISSIVE_COLORS = ['#0b5a3f', '#153766', '#6b3e00', '#5a0b1f'] as const;
const PLAYER_MODEL_PATH = '/models/RobotExpressive.glb';
const KEYPOINT_CONFIDENCE = 0.2;

type GameSceneProps = {
  canStart: boolean;
  phase: GamePhase;
  playerDetections: Array<PersonDetection | null>;
  playerPositions: number[];
  startLabel: string;
  onPause: () => void;
  onStart: () => void;
};

type Obstacle = {
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  x: number;
  hitBy: boolean[];
};

type GameStats = {
  dodged: number;
  hits: number[];
  status: 'running' | 'hit';
  hitPlayer: number | null;
};

export type GamePhase = 'ready' | 'running' | 'paused';

type PlayerRigBoneName =
  | 'Hips'
  | 'Torso_1'
  | 'Head'
  | 'UpperArmL'
  | 'LowerArmL'
  | 'UpperArmR'
  | 'LowerArmR'
  | 'UpperLegL'
  | 'LowerLegL'
  | 'UpperLegR'
  | 'LowerLegR';

type PlayerRig = {
  bones: Partial<Record<PlayerRigBoneName, THREE.Bone>>;
  restQuaternions: Map<PlayerRigBoneName, THREE.Quaternion>;
  restWorldDirections: Map<PlayerRigBoneName, THREE.Vector3>;
  restWorldQuaternions: Map<PlayerRigBoneName, THREE.Quaternion>;
};

type PlayerAvatar = {
  root: THREE.Group;
  fallback: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  rig: PlayerRig | null;
  poseEnergy: number;
};

type TrackWorld = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  players: PlayerAvatar[];
  dispose: () => void;
};

type ObstacleSystem = {
  obstacles: Obstacle[];
  spawnObstacle: () => void;
  dispose: () => void;
};

function createRailMaterial(color: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.58,
    metalness: 0.32,
  });
}

function positionToWorldX(position: number): number {
  return THREE.MathUtils.lerp(TRACK_MIN_X, TRACK_MAX_X, THREE.MathUtils.clamp(position, 0, 1));
}

function findKeypoint(detection: PersonDetection | null, label: string): PoseKeypoint | null {
  const keypoint = detection?.keypoints?.find((item) => item.label === label);
  if (!keypoint || keypoint.score < KEYPOINT_CONFIDENCE) {
    return null;
  }
  return keypoint;
}

function distanceBetween(left: PoseKeypoint, right: PoseKeypoint): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function markerSegmentDirection(
  detection: PersonDetection,
  from: PoseKeypoint | null,
  to: PoseKeypoint | null
): THREE.Vector3 | null {
  if (!from || !to) {
    return null;
  }

  const boxWidth = Math.max(1, detection.box.xmax - detection.box.xmin);
  const boxHeight = Math.max(1, detection.box.ymax - detection.box.ymin);
  const direction = new THREE.Vector3(
    (to.x - from.x) / boxWidth,
    -(to.y - from.y) / boxHeight,
    0
  );

  if (direction.lengthSq() < 0.0001) {
    return null;
  }

  return direction.normalize();
}

function getPoseAnimationState(detection: PersonDetection | null): { lean: number; turn: number; energy: number } {
  if (!detection?.keypoints?.length) {
    return { lean: 0, turn: 0, energy: 0.55 };
  }

  const leftShoulder = findKeypoint(detection, 'Left Shoulder');
  const rightShoulder = findKeypoint(detection, 'Right Shoulder');
  const leftHip = findKeypoint(detection, 'Left Hip');
  const rightHip = findKeypoint(detection, 'Right Hip');
  const leftKnee = findKeypoint(detection, 'Left Knee');
  const rightKnee = findKeypoint(detection, 'Right Knee');
  const leftWrist = findKeypoint(detection, 'Left Wrist');
  const rightWrist = findKeypoint(detection, 'Right Wrist');

  const boxWidth = Math.max(1, detection.box.xmax - detection.box.xmin);
  const boxHeight = Math.max(1, detection.box.ymax - detection.box.ymin);
  const shoulderMidX = leftShoulder && rightShoulder ? (leftShoulder.x + rightShoulder.x) / 2 : null;
  const hipMidX = leftHip && rightHip ? (leftHip.x + rightHip.x) / 2 : null;
  const lean = shoulderMidX !== null && hipMidX !== null
    ? THREE.MathUtils.clamp((shoulderMidX - hipMidX) / boxWidth, -1, 1)
    : 0;

  const shoulderWidth = leftShoulder && rightShoulder ? distanceBetween(leftShoulder, rightShoulder) : boxWidth * 0.34;
  const hipWidth = leftHip && rightHip ? distanceBetween(leftHip, rightHip) : shoulderWidth;
  const turn = THREE.MathUtils.clamp((shoulderWidth - hipWidth) / boxWidth, -1, 1);
  const kneeStride = leftKnee && rightKnee ? Math.abs(leftKnee.y - rightKnee.y) / boxHeight : 0;
  const wristStride = leftWrist && rightWrist ? Math.abs(leftWrist.y - rightWrist.y) / boxHeight : 0;
  const energy = THREE.MathUtils.clamp(0.48 + kneeStride * 1.9 + wristStride * 0.9, 0.35, 1.8);

  return { lean, turn, energy };
}

function getRigBoneNames(): PlayerRigBoneName[] {
  return [
    'Hips',
    'Torso_1',
    'Head',
    'UpperArmL',
    'LowerArmL',
    'UpperArmR',
    'LowerArmR',
    'UpperLegL',
    'LowerLegL',
    'UpperLegR',
    'LowerLegR',
  ];
}

function createPlayerRig(model: THREE.Object3D): PlayerRig {
  const allBones = new Map<string, THREE.Bone>();
  const bones: Partial<Record<PlayerRigBoneName, THREE.Bone>> = {};
  const restQuaternions = new Map<PlayerRigBoneName, THREE.Quaternion>();
  const restWorldDirections = new Map<PlayerRigBoneName, THREE.Vector3>();
  const restWorldQuaternions = new Map<PlayerRigBoneName, THREE.Quaternion>();
  const expectedBoneNames = new Set(getRigBoneNames());

  model.updateMatrixWorld(true);
  model.traverse((child) => {
    const bone = child as THREE.Bone;
    if (!bone.isBone) {
      return;
    }

    allBones.set(bone.name, bone);
    if (!expectedBoneNames.has(bone.name as PlayerRigBoneName)) {
      return;
    }
    const boneName = bone.name as PlayerRigBoneName;
    bones[boneName] = bone;
    restQuaternions.set(boneName, bone.quaternion.clone());
    restWorldQuaternions.set(boneName, bone.getWorldQuaternion(new THREE.Quaternion()));
  });

  const directionTargets: Partial<Record<PlayerRigBoneName, string>> = {
    UpperArmL: 'LowerArmL',
    LowerArmL: 'Palm2L',
    UpperArmR: 'LowerArmR',
    LowerArmR: 'Palm2R',
    UpperLegL: 'LowerLegL',
    LowerLegL: 'FootL',
    UpperLegR: 'LowerLegR',
    LowerLegR: 'FootR',
  };

  Object.entries(directionTargets).forEach(([boneName, childName]) => {
    const bone = bones[boneName as PlayerRigBoneName];
    const child = allBones.get(childName);
    if (!bone || !child) {
      return;
    }

    const bonePosition = new THREE.Vector3();
    const childPosition = new THREE.Vector3();
    bone.getWorldPosition(bonePosition);
    child.getWorldPosition(childPosition);
    restWorldDirections.set(
      boneName as PlayerRigBoneName,
      childPosition.sub(bonePosition).normalize()
    );
  });

  return { bones, restQuaternions, restWorldDirections, restWorldQuaternions };
}

function rotateBoneFromRest(
  rig: PlayerRig,
  name: PlayerRigBoneName,
  rotation: THREE.Euler,
  alpha: number
): void {
  const bone = rig.bones[name];
  const restQuaternion = rig.restQuaternions.get(name);
  if (!bone || !restQuaternion) {
    return;
  }

  const targetQuaternion = restQuaternion.clone().multiply(new THREE.Quaternion().setFromEuler(rotation));
  bone.quaternion.slerp(targetQuaternion, alpha);
}

function pointBoneAtMarkerSegment(
  rig: PlayerRig,
  name: PlayerRigBoneName,
  direction: THREE.Vector3 | null,
  alpha: number
): void {
  const bone = rig.bones[name];
  const restWorldDirection = rig.restWorldDirections.get(name);
  const restWorldQuaternion = rig.restWorldQuaternions.get(name);
  const parent = bone?.parent;
  if (!bone || !parent || !restWorldDirection || !restWorldQuaternion || !direction) {
    return;
  }

  parent.updateWorldMatrix(true, false);
  const parentWorldQuaternion = parent.getWorldQuaternion(new THREE.Quaternion());
  const swing = new THREE.Quaternion().setFromUnitVectors(restWorldDirection, direction);
  const targetWorldQuaternion = swing.multiply(restWorldQuaternion);
  const targetQuaternion = parentWorldQuaternion.invert().multiply(targetWorldQuaternion);
  bone.quaternion.slerp(targetQuaternion, alpha);
}

function resetRigToRest(rig: PlayerRig, alpha: number): void {
  rig.restQuaternions.forEach((restQuaternion, boneName) => {
    const bone = rig.bones[boneName];
    bone?.quaternion.slerp(restQuaternion, alpha);
  });
}

function applyMarkerPose(player: PlayerAvatar, detection: PersonDetection | null): void {
  const rig = player.rig;
  if (!rig) {
    return;
  }

  resetRigToRest(rig, detection?.keypoints?.length ? 0.2 : 0.08);
  if (!detection?.keypoints?.length) {
    return;
  }

  const leftShoulder = findKeypoint(detection, 'Left Shoulder');
  const rightShoulder = findKeypoint(detection, 'Right Shoulder');
  const leftElbow = findKeypoint(detection, 'Left Elbow');
  const rightElbow = findKeypoint(detection, 'Right Elbow');
  const leftWrist = findKeypoint(detection, 'Left Wrist');
  const rightWrist = findKeypoint(detection, 'Right Wrist');
  const leftHip = findKeypoint(detection, 'Left Hip');
  const rightHip = findKeypoint(detection, 'Right Hip');
  const leftKnee = findKeypoint(detection, 'Left Knee');
  const rightKnee = findKeypoint(detection, 'Right Knee');
  const leftAnkle = findKeypoint(detection, 'Left Ankle');
  const rightAnkle = findKeypoint(detection, 'Right Ankle');
  const nose = findKeypoint(detection, 'Nose');

  const poseState = getPoseAnimationState(detection);
  const leftUpperArm = markerSegmentDirection(detection, leftShoulder, leftElbow);
  const rightUpperArm = markerSegmentDirection(detection, rightShoulder, rightElbow);
  const leftLowerArm = markerSegmentDirection(detection, leftElbow, leftWrist);
  const rightLowerArm = markerSegmentDirection(detection, rightElbow, rightWrist);
  const leftUpperLeg = markerSegmentDirection(detection, leftHip, leftKnee);
  const rightUpperLeg = markerSegmentDirection(detection, rightHip, rightKnee);
  const leftLowerLeg = markerSegmentDirection(detection, leftKnee, leftAnkle);
  const rightLowerLeg = markerSegmentDirection(detection, rightKnee, rightAnkle);
  const shoulderLine = leftShoulder && rightShoulder
    ? THREE.MathUtils.clamp((rightShoulder.y - leftShoulder.y) / Math.max(1, distanceBetween(leftShoulder, rightShoulder)), -0.8, 0.8)
    : 0;
  const headTilt = nose && leftShoulder && rightShoulder
    ? THREE.MathUtils.clamp((nose.x - (leftShoulder.x + rightShoulder.x) / 2) / Math.max(1, distanceBetween(leftShoulder, rightShoulder)), -0.7, 0.7)
    : 0;

  rotateBoneFromRest(rig, 'Hips', new THREE.Euler(0, poseState.turn * 0.25, -poseState.lean * 0.35), 0.35);
  rotateBoneFromRest(rig, 'Torso_1', new THREE.Euler(0, -poseState.turn * 0.2, shoulderLine * 0.55), 0.35);
  rotateBoneFromRest(rig, 'Head', new THREE.Euler(0, headTilt * 0.5, -headTilt * 0.25), 0.3);

  pointBoneAtMarkerSegment(rig, 'UpperArmL', leftUpperArm, 0.46);
  pointBoneAtMarkerSegment(rig, 'LowerArmL', leftLowerArm, 0.46);
  pointBoneAtMarkerSegment(rig, 'UpperArmR', rightUpperArm, 0.46);
  pointBoneAtMarkerSegment(rig, 'LowerArmR', rightLowerArm, 0.46);
  pointBoneAtMarkerSegment(rig, 'UpperLegL', leftUpperLeg, 0.35);
  pointBoneAtMarkerSegment(rig, 'LowerLegL', leftLowerLeg, 0.35);
  pointBoneAtMarkerSegment(rig, 'UpperLegR', rightUpperLeg, 0.35);
  pointBoneAtMarkerSegment(rig, 'LowerLegR', rightLowerLeg, 0.35);
}

function createFallbackPlayer(index: number): PlayerAvatar {
  const root = new THREE.Group();
  const fallback = new THREE.Mesh(
    new THREE.SphereGeometry(0.48, 32, 32),
    new THREE.MeshStandardMaterial({
      color: PLAYER_COLORS[index % PLAYER_COLORS.length],
      emissive: PLAYER_EMISSIVE_COLORS[index % PLAYER_EMISSIVE_COLORS.length],
      roughness: 0.38,
      metalness: 0.12,
    })
  );
  fallback.position.y = 0.57;
  fallback.castShadow = true;
  root.add(fallback);

  return {
    root,
    fallback,
    rig: null,
    poseEnergy: 0.55,
  };
}

function tintPlayerModel(model: THREE.Object3D, index: number): void {
  const tint = new THREE.Color(PLAYER_COLORS[index % PLAYER_COLORS.length]);

  model.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) {
      return;
    }

    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const clonedMaterials = materials.map((material) => {
      const clone = material.clone();
      if ('color' in clone && clone.color instanceof THREE.Color) {
        clone.color.lerp(tint, 0.28);
      }
      return clone;
    });
    mesh.material = Array.isArray(mesh.material) ? clonedMaterials : clonedMaterials[0];
  });
}

async function loadPlayerModels(players: PlayerAvatar[], isDisposed: () => boolean): Promise<void> {
  const loader = new GLTFLoader();
  const model = await loader.loadAsync(PLAYER_MODEL_PATH);
  if (isDisposed()) {
    disposeObject(model.scene);
    return;
  }

  players.forEach((player, index) => {
    if (isDisposed()) {
      return;
    }

    const clone = SkeletonUtils.clone(model.scene);
    clone.name = `pose-driven-player-${index + 1}`;
    clone.scale.setScalar(0.42);
    clone.rotation.y = Math.PI;
    tintPlayerModel(clone, index);
    player.rig = createPlayerRig(clone);
    player.fallback.visible = false;
    player.root.add(clone);
  });
}

function disposeObject(object: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();

  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) {
      return;
    }

    geometries.add(mesh.geometry);
    const meshMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    meshMaterials.forEach((material) => materials.add(material));
  });

  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

function createTrackWorld(mount: HTMLDivElement, initialPlayerPositions: number[]): TrackWorld {
  let disposed = false;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#101416');
  scene.fog = new THREE.Fog('#101416', 10, 30);

  const camera = new THREE.PerspectiveCamera(54, 1, 0.1, 100);
  camera.position.set(0, 4.4, 7.2);
  camera.lookAt(0, 0.2, -5);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.BasicShadowMap;
  renderer.domElement.className = 'game-canvas';
  mount.appendChild(renderer.domElement);

  const ambient = new THREE.HemisphereLight('#dfffee', '#101416', 1.6);
  scene.add(ambient);

  const keyLight = new THREE.DirectionalLight('#ffffff', 2.6);
  keyLight.position.set(-4, 8, 5);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  scene.add(keyLight);

  const floorGeometry = new THREE.PlaneGeometry(9.2, 44);
  const floorMaterial = new THREE.MeshStandardMaterial({
    color: '#171d20',
    roughness: 0.82,
    metalness: 0.05,
  });
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = -7;
  floor.receiveShadow = true;
  scene.add(floor);

  const railMaterial = createRailMaterial('#2fffb2');
  const dividerMaterial = createRailMaterial('#dce7df');
  const sleeperMaterial = new THREE.MeshStandardMaterial({
    color: '#2b3337',
    roughness: 0.74,
  });

  const sideRailGeometry = new THREE.BoxGeometry(0.18, 0.14, 42);
  [TRACK_MIN_X - 0.54, TRACK_MAX_X + 0.54].forEach((x) => {
    const rail = new THREE.Mesh(sideRailGeometry, railMaterial);
    rail.position.set(x, 0.08, -7);
    rail.castShadow = true;
    rail.receiveShadow = true;
    scene.add(rail);
  });

  const guideGeometry = new THREE.BoxGeometry(0.035, 0.04, 42);
  [-2.1, -1.05, 0, 1.05, 2.1].forEach((x) => {
    const divider = new THREE.Mesh(guideGeometry, dividerMaterial);
    divider.position.set(x, 0.08, -7);
    divider.receiveShadow = true;
    scene.add(divider);
  });

  const sleeperGeometry = new THREE.BoxGeometry(7.6, 0.08, 0.14);
  for (let z = -26; z < 6; z += 1.45) {
    const sleeper = new THREE.Mesh(sleeperGeometry, sleeperMaterial);
    sleeper.position.set(0, 0.11, z);
    sleeper.receiveShadow = true;
    scene.add(sleeper);
  }

  const players = initialPlayerPositions.map((initialPlayerPosition, index) => {
    const player = createFallbackPlayer(index);
    player.root.position.set(positionToWorldX(initialPlayerPosition), PLAYER_BASE_Y, PLAYER_Z);
    scene.add(player.root);
    return player;
  });

  void loadPlayerModels(players, () => disposed).catch(() => {
    players.forEach((player) => {
      player.fallback.visible = true;
    });
  });

  return {
    scene,
    camera,
    renderer,
    players,
    dispose: () => {
      disposed = true;
      floorGeometry.dispose();
      floorMaterial.dispose();
      railMaterial.dispose();
      dividerMaterial.dispose();
      sleeperGeometry.dispose();
      sleeperMaterial.dispose();
      sideRailGeometry.dispose();
      guideGeometry.dispose();
      players.forEach((player) => {
        disposeObject(player.root);
      });
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

function createObstacleSystem(scene: THREE.Scene): ObstacleSystem {
  const obstacles: Obstacle[] = [];
  const obstacleGeometry = new THREE.SphereGeometry(0.74, 36, 36);
  const obstacleMaterial = new THREE.MeshStandardMaterial({
    color: '#ff5f7a',
    emissive: '#5a0b18',
    roughness: 0.42,
    metalness: 0.08,
  });

  return {
    obstacles,
    spawnObstacle: () => {
      const x = TRACK_MIN_X + Math.random() * TRACK_WIDTH;
      const mesh = new THREE.Mesh(obstacleGeometry, obstacleMaterial.clone());
      mesh.position.set(x, 0.82, OBSTACLE_SPAWN_Z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      obstacles.push({ mesh, x, hitBy: [] });
    },
    dispose: () => {
      obstacles.forEach((obstacle) => {
        scene.remove(obstacle.mesh);
        obstacle.mesh.material.dispose();
      });
      obstacleGeometry.dispose();
      obstacleMaterial.dispose();
    },
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
}: GameSceneProps): ReactElement {
  const { t } = useI18n();
  const mountRef = useRef<HTMLDivElement | null>(null);
  const playerCount = playerPositions.length;
  const playerPositionsRef = useRef(playerPositions);
  const playerDetectionsRef = useRef(playerDetections);
  const gamePhaseRef = useRef<GamePhase>(phase);
  const [stats, setStats] = useState<GameStats>({
    dodged: 0,
    hits: playerPositions.map(() => 0),
    status: 'running',
    hitPlayer: null,
  });

  useEffect(() => {
    playerPositionsRef.current = playerPositions;
  }, [playerPositions]);

  useEffect(() => {
    playerDetectionsRef.current = playerDetections;
  }, [playerDetections]);

  useEffect(() => {
    setStats({
      dodged: 0,
      hits: Array.from({ length: playerCount }, () => 0),
      status: 'running',
      hitPlayer: null,
    });
  }, [playerCount]);

  useEffect(() => {
    gamePhaseRef.current = phase;
  }, [phase]);

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
    let lastSpawnAt = performance.now() - SPAWN_INTERVAL_MS;
    let statusResetAt = 0;
    const world = createTrackWorld(mount, playerPositionsRef.current);
    const obstacleSystem = createObstacleSystem(world.scene);

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

      if (!isRunning) {
        world.renderer.render(world.scene, world.camera);
        animationFrame = window.requestAnimationFrame(animate);
        return;
      }

      if (now - lastSpawnAt > SPAWN_INTERVAL_MS) {
        obstacleSystem.spawnObstacle();
        lastSpawnAt = now;
      }

      world.players.forEach((player, index) => {
        const targetX = positionToWorldX(playerPositionsRef.current[index] ?? playerPositionsRef.current[0] ?? 0.5);
        const poseState = getPoseAnimationState(playerDetectionsRef.current[index] ?? null);
        player.poseEnergy = THREE.MathUtils.lerp(player.poseEnergy, poseState.energy, 0.18);
        player.root.position.x = THREE.MathUtils.lerp(player.root.position.x, targetX, 0.22);
        player.root.position.y = PLAYER_BASE_Y + Math.sin(now * 0.012 + index) * 0.045 * player.poseEnergy;
        player.root.rotation.z = THREE.MathUtils.lerp(player.root.rotation.z, -poseState.lean * 0.5, 0.2);
        player.root.rotation.y = THREE.MathUtils.lerp(player.root.rotation.y, poseState.turn * 0.45, 0.16);
        player.fallback.rotation.y += delta * (2 + index * 0.35);
        applyMarkerPose(player, playerDetectionsRef.current[index] ?? null);
      });

      for (let index = obstacleSystem.obstacles.length - 1; index >= 0; index -= 1) {
        const obstacle = obstacleSystem.obstacles[index];
        obstacle.mesh.position.z += OBSTACLE_SPEED * delta;
        obstacle.mesh.rotation.x += delta * 2.8;
        obstacle.mesh.rotation.z += delta * 1.5;

        for (let playerIndex = 0; playerIndex < world.players.length; playerIndex += 1) {
          const player = world.players[playerIndex];
          const isCollision =
            !obstacle.hitBy[playerIndex] &&
            Math.abs(obstacle.x - player.root.position.x) < COLLISION_RADIUS_X &&
            Math.abs(obstacle.mesh.position.z - PLAYER_Z) < COLLISION_RADIUS_Z;

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
  }, [playerCount]);

  return (
    <div className="game-scene" ref={mountRef}>
      <div className="stage-heading">
        <p className="eyebrow">{t('game.heading')}</p>
        <h1>{t('game.title')}</h1>
      </div>
      <div className="game-hud" aria-label={t('game.status')}>
        <span>
          {phase === 'ready'
            ? t('game.ready')
            : phase === 'paused'
              ? t('game.paused')
              : stats.status === 'hit' && stats.hitPlayer !== null
                ? t('game.playerHit', { player: stats.hitPlayer })
                : t('game.running')}
        </span>
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
