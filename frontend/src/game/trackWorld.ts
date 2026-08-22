import * as THREE from 'three';
import { PLAYER_BASE_Y, PLAYER_Z, TRACK_MAX_X, TRACK_MIN_X, TRACK_WIDTH } from './gameConstants';
import type { RunnerGameId, TrackWorld } from './gameTypes';
import type { HandRhythmGridSize } from './levels/handRhythmLevel';
import { handRhythmPlayerWidth, HAND_RHYTHM_ROW_Y } from './levels/handRhythmLayout';
import { createFallbackPlayer, disposeObject, loadPlayerModels } from './playerAvatar';

function createRailMaterial(color: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.58,
    metalness: 0.32,
  });
}

export function positionToWorldX(position: number): number {
  return THREE.MathUtils.lerp(TRACK_MIN_X, TRACK_MAX_X, THREE.MathUtils.clamp(position, 0, 1));
}

export function playerTrackX(index: number, playerCount: number): number {
  const normalizedPlayerCount = Math.max(1, playerCount);

  if (normalizedPlayerCount <= 1) {
    return 0;
  }

  const clampedIndex = THREE.MathUtils.clamp(index, 0, normalizedPlayerCount - 1);
  const segmentWidth = TRACK_WIDTH / normalizedPlayerCount;
  return TRACK_MIN_X + segmentWidth * (clampedIndex + 0.5);
}

export function playerTrackWidth(playerCount: number): number {
  const normalizedPlayerCount = Math.max(1, playerCount);
  return normalizedPlayerCount <= 1 ? 4.6 : TRACK_WIDTH / normalizedPlayerCount;
}

function createPlayerLaneMarkers(scene: THREE.Scene, playerCount: number): () => void {
  const laneObjects: THREE.Object3D[] = [];
  const zoneWidth = playerTrackWidth(playerCount);
  const laneWidth = zoneWidth / 2;
  const laneDepth = 38;
  const laneColors = ['#263235', '#20292d'] as const;
  const boundaryMaterial = new THREE.MeshStandardMaterial({
    color: '#e6f3ea',
    emissive: '#2b5d47',
    roughness: 0.58,
    transparent: true,
    opacity: 0.58,
  });

  for (let playerIndex = 0; playerIndex < playerCount; playerIndex += 1) {
    const centerX = playerTrackX(playerIndex, playerCount);

    [-0.5, 0.5].forEach((laneOffset, laneIndex) => {
      const laneMaterial = new THREE.MeshStandardMaterial({
        color: laneColors[laneIndex],
        roughness: 0.86,
        metalness: 0.03,
        transparent: true,
        opacity: 0.72,
      });
      const lane = new THREE.Mesh(new THREE.PlaneGeometry(laneWidth - 0.06, laneDepth), laneMaterial);
      lane.rotation.x = -Math.PI / 2;
      lane.position.set(centerX + laneOffset * laneWidth, 0.014, -7);
      lane.receiveShadow = true;
      scene.add(lane);
      laneObjects.push(lane);
    });

    [-zoneWidth / 2, 0, zoneWidth / 2].forEach((offset, boundaryIndex) => {
      const boundary = new THREE.Mesh(
        new THREE.BoxGeometry(boundaryIndex === 1 ? 0.035 : 0.055, 0.035, laneDepth),
        boundaryMaterial.clone()
      );
      boundary.position.set(centerX + offset, 0.05, -7);
      boundary.receiveShadow = true;
      scene.add(boundary);
      laneObjects.push(boundary);
    });
  }

  return () => {
    laneObjects.forEach((object) => {
      scene.remove(object);
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) {
        return;
      }
      mesh.geometry.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((material) => material.dispose());
    });
  };
}

function createHandRhythmGrids(scene: THREE.Scene, playerCount: number, gridSize: HandRhythmGridSize): () => void {
  const objects: THREE.Object3D[] = [];
  const cellWidth = handRhythmPlayerWidth(playerCount) / gridSize;
  const cellHeight = (HAND_RHYTHM_ROW_Y[0] - HAND_RHYTHM_ROW_Y[2]) / Math.max(1, gridSize - 1);

  for (let playerIndex = 0; playerIndex < playerCount; playerIndex += 1) {
    const centerX = playerTrackX(playerIndex, playerCount);
    for (let row = 0; row < gridSize; row += 1) {
      for (let column = 0; column < gridSize; column += 1) {
        const isCenter = row === Math.floor(gridSize / 2) && column === Math.floor(gridSize / 2);
        const material = new THREE.MeshBasicMaterial({
          color: isCenter ? '#17463e' : '#102d2a',
          transparent: true,
          opacity: isCenter ? 0.88 : 0.76,
          side: THREE.DoubleSide,
        });
        const cell = new THREE.Mesh(new THREE.PlaneGeometry(cellWidth * 0.93, cellHeight * 0.88), material);
        const sourceRow = Math.round(row * (HAND_RHYTHM_ROW_Y.length - 1) / (gridSize - 1));
        cell.position.set(centerX + (column - (gridSize - 1) / 2) * cellWidth, HAND_RHYTHM_ROW_Y[sourceRow] ?? HAND_RHYTHM_ROW_Y[1], PLAYER_Z - 0.08);
        scene.add(cell);
        objects.push(cell);

        const outline = new THREE.LineSegments(
          new THREE.EdgesGeometry(cell.geometry),
          new THREE.LineBasicMaterial({ color: playerIndex === 0 ? '#2fffb2' : '#66a3ff', transparent: true, opacity: 0.48 })
        );
        outline.position.copy(cell.position);
        outline.position.z += 0.01;
        scene.add(outline);
        objects.push(outline);
      }
    }
  }

  return () => {
    objects.forEach((object) => {
      scene.remove(object);
      const renderable = object as THREE.Mesh | THREE.LineSegments;
      renderable.geometry.dispose();
      (Array.isArray(renderable.material) ? renderable.material : [renderable.material]).forEach((material) => material.dispose());
    });
  };
}

export function createTrackWorld(
  mount: HTMLDivElement,
  initialPlayerPositions: number[],
  gameId: RunnerGameId,
  handRhythmGridSize: HandRhythmGridSize = 3
): TrackWorld {
  let disposed = false;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#101416');
  scene.fog = new THREE.Fog('#101416', 10, 30);

  const playerCount = initialPlayerPositions.length;
  const isJumpDuck = gameId === 'jump-duck';
  const isHandRhythm = gameId === 'hand-rhythm';
  const isLaneBased = isJumpDuck || isHandRhythm;

  const camera = new THREE.PerspectiveCamera(54, 1, 0.1, 100);
  camera.position.set(0, isHandRhythm ? 4.4 : 5.2, isHandRhythm ? 10.6 : 9.6);
  camera.lookAt(0, isHandRhythm ? 1.85 : 0.2, isHandRhythm ? 0 : -5);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
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

  const floorMaterial = new THREE.MeshStandardMaterial({
    color: '#171d20',
    roughness: 0.82,
    metalness: 0.05,
  });

  const railMaterial = createRailMaterial('#2fffb2');
  const dividerMaterial = createRailMaterial('#dce7df');
  const sleeperMaterial = new THREE.MeshStandardMaterial({
    color: '#2b3337',
    roughness: 0.74,
  });

  const disposePlayerLaneMarkers = createPlayerLaneMarkers(scene, playerCount);
  const disposeHandRhythmGrids = isHandRhythm ? createHandRhythmGrids(scene, playerCount, handRhythmGridSize) : () => undefined;

  const playerZoneWidth = playerTrackWidth(playerCount);
  const sleeperWidth = isLaneBased ? playerZoneWidth : 7.6;
  const sleeperGeometry = new THREE.BoxGeometry(sleeperWidth, 0.08, 0.14);
  const sideRailGeometry = new THREE.BoxGeometry(0.18, 0.14, 42);
  const guideGeometry = new THREE.BoxGeometry(0.035, 0.04, 42);
  const floorGeometry = new THREE.PlaneGeometry(isLaneBased ? playerZoneWidth : 9.2, 44);

  const trackCenters = isLaneBased
    ? Array.from({ length: playerCount }, (_, i) => playerTrackX(i, playerCount))
    : [0];

  trackCenters.forEach((centerX) => {
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(centerX, 0, -7);
    floor.receiveShadow = true;
    scene.add(floor);

    const railOffset = sleeperWidth / 2 + 0.09;
    [centerX - railOffset, centerX + railOffset].forEach((x) => {
      const rail = new THREE.Mesh(sideRailGeometry, railMaterial);
      rail.position.set(x, 0.08, -7);
      rail.castShadow = true;
      rail.receiveShadow = true;
      scene.add(rail);
    });

    const dividerOffsets = isLaneBased ? [-1.05, 0, 1.05] : [-2.1, -1.05, 0, 1.05, 2.1];
    dividerOffsets.forEach((offset) => {
      const divider = new THREE.Mesh(guideGeometry, dividerMaterial);
      divider.position.set(centerX + offset, 0.08, -7);
      divider.receiveShadow = true;
      scene.add(divider);
    });

    for (let z = -26; z < 6; z += 1.45) {
      const sleeper = new THREE.Mesh(sleeperGeometry, sleeperMaterial);
      sleeper.position.set(centerX, 0.11, z);
      sleeper.receiveShadow = true;
      scene.add(sleeper);
    }
  });

  const players = initialPlayerPositions.map((initialPlayerPosition, index) => {
    const player = createFallbackPlayer(index);
    const targetX = isLaneBased
      ? playerTrackX(index, playerCount)
      : positionToWorldX(initialPlayerPosition);
    player.root.position.set(targetX, PLAYER_BASE_Y, PLAYER_Z);
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
      disposePlayerLaneMarkers();
      disposeHandRhythmGrids();
      players.forEach((player) => {
        disposeObject(player.root);
      });
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
