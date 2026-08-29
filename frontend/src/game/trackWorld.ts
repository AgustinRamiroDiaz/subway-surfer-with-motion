import * as THREE from 'three';
import { PLAYER_BASE_Y, PLAYER_Z, TRACK_WIDTH } from './gameConstants';
import type { HandRhythmTrackWorld, PoseRunnerGameId, RunnerGameId, TrackWorld } from './gameTypes';
import type { CameraFraming } from './levelRegistry';
import type { HandRhythmCell, HandRhythmGridSize } from './levels/handRhythmLevel';
import { handRhythmPlayerWidth, HAND_RHYTHM_ROW_Y } from './levels/handRhythmLayout';
import {
  createHandRhythmCameraOverlay,
  type HandRhythmCameraOverlayOptions,
} from './handRhythmCameraOverlay';
import { createFallbackPlayer, disposeObject, loadPlayerModels } from './playerAvatar';
import { playerTrackWidth, playerTrackX, positionToWorldX } from './trackLayout';

function setObjectLayer(object: THREE.Object3D, layer: number): void {
  object.traverse((child) => child.layers.set(layer));
}

export function createTrackCameras(
  gameId: RunnerGameId,
  playerCount: number,
  cameraFraming: CameraFraming
): THREE.PerspectiveCamera[] {
  const cameraCount = gameId === 'hand-rhythm' ? Math.max(1, playerCount) : 1;

  return Array.from({ length: cameraCount }, (_, playerIndex) => {
    const camera = new THREE.PerspectiveCamera(54, 1, 0.1, 100);
    const centerX = cameraCount === 1 ? 0 : playerTrackX(playerIndex, playerCount);
    camera.name = cameraCount === 1 ? 'main-camera' : `player-${playerIndex + 1}-camera`;
    camera.userData.playableWidth = gameId === 'hand-rhythm'
      ? handRhythmPlayerWidth(playerCount)
      : TRACK_WIDTH;
    camera.position.set(centerX, cameraFraming.positionY, cameraFraming.positionZ);
    camera.lookAt(centerX, cameraFraming.positionY, cameraFraming.targetZ);
    if (cameraCount > 1) {
      camera.layers.enable(playerIndex + 1);
    }
    return camera;
  });
}

export function resizeTrackCameras(
  cameras: THREE.PerspectiveCamera[],
  width: number,
  height: number
): void {
  const fullAspect = width / height;
  const viewportAspect = fullAspect / Math.max(1, cameras.length);

  cameras.forEach((camera) => {
    camera.aspect = viewportAspect;
    camera.zoom = 1;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    const playableWidth = Number(camera.userData.playableWidth) || TRACK_WIDTH;
    const halfWidth = playableWidth / 2;
    const left = new THREE.Vector3(
      camera.position.x - halfWidth,
      PLAYER_BASE_Y,
      PLAYER_Z
    ).project(camera).x;
    const right = new THREE.Vector3(
      camera.position.x + halfWidth,
      PLAYER_BASE_Y,
      PLAYER_Z
    ).project(camera).x;
    const projectedHalfWidth = Math.max(Math.abs(left), Math.abs(right));
    camera.zoom = projectedHalfWidth > 0 ? 1 / projectedHalfWidth : 1;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  });
}

function createRailMaterial(color: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.58,
    metalness: 0.32,
  });
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

type HandRhythmGrid = {
  outlines: THREE.LineSegments[];
  activeGlows: THREE.LineSegments[];
  update: (cells: Array<HandRhythmCell[] | undefined>) => void;
  dispose: () => void;
};

function createHandRhythmGrid(scene: THREE.Scene, playerCount: number, gridSize: HandRhythmGridSize): HandRhythmGrid {
  const outlines: THREE.LineSegments[] = [];
  const activeGlows: THREE.LineSegments[] = [];
  const outlineMaterials: THREE.LineBasicMaterial[] = [];
  const activeGlowMaterials: THREE.LineBasicMaterial[] = [];
  const activeGlowLayers = 3;
  const cellWidth = handRhythmPlayerWidth(playerCount) / gridSize;
  const cellHeight = (HAND_RHYTHM_ROW_Y[0] - HAND_RHYTHM_ROW_Y[2]) / Math.max(1, gridSize - 1);

  for (let playerIndex = 0; playerIndex < playerCount; playerIndex += 1) {
    const centerX = playerTrackX(playerIndex, playerCount);
    for (let row = 0; row < gridSize; row += 1) {
      for (let column = 0; column < gridSize; column += 1) {
        const geometry = new THREE.PlaneGeometry(cellWidth, cellHeight);
        const sourceRow = Math.round(row * (HAND_RHYTHM_ROW_Y.length - 1) / (gridSize - 1));
        const position = new THREE.Vector3(
          centerX + (column - (gridSize - 1) / 2) * cellWidth,
          HAND_RHYTHM_ROW_Y[sourceRow] ?? HAND_RHYTHM_ROW_Y[1],
          PLAYER_Z - 0.08
        );
        const outlineMaterial = new THREE.LineBasicMaterial({
          color: playerIndex === 0 ? '#2fffb2' : '#66a3ff',
          transparent: true,
          opacity: 0.42,
        });
        const outline = new THREE.LineSegments(
          new THREE.EdgesGeometry(geometry),
          outlineMaterial
        );
        outline.position.copy(position);
        if (playerCount > 1) {
          outline.layers.set(playerIndex + 1);
        }
        scene.add(outline);
        outlines.push(outline);
        outlineMaterials.push(outlineMaterial);
        for (let glowLayer = 0; glowLayer < activeGlowLayers; glowLayer += 1) {
          const activeGlowMaterial = new THREE.LineBasicMaterial({
          color: playerIndex === 0 ? '#2fffb2' : '#66a3ff',
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          });
          const activeGlow = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), activeGlowMaterial);
          activeGlow.position.copy(position);
          activeGlow.scale.setScalar(1 + glowLayer * 0.035);
          if (playerCount > 1) {
            activeGlow.layers.set(playerIndex + 1);
          }
          scene.add(activeGlow);
          activeGlows.push(activeGlow);
          activeGlowMaterials.push(activeGlowMaterial);
        }
        geometry.dispose();
      }
    }
  }

  return {
    outlines,
    activeGlows,
    update: (cells) => {
      outlineMaterials.forEach((material, index) => {
        const playerIndex = Math.floor(index / (gridSize * gridSize));
        material.color.set(playerIndex === 0 ? '#2fffb2' : '#66a3ff');
        material.opacity = 0.42;
      });
      activeGlowMaterials.forEach((material) => { material.opacity = 0; });
      cells.forEach((playerCells, playerIndex) => {
        playerCells?.forEach((cell) => {
          const cellIndex = playerIndex * gridSize * gridSize + cell.row * gridSize + cell.column;
          const material = outlineMaterials[cellIndex];
          if (material) {
            material.color.set('#ffffff');
            material.opacity = 1;
          }
          for (let glowLayer = 0; glowLayer < activeGlowLayers; glowLayer += 1) {
            const activeMaterial = activeGlowMaterials[cellIndex * activeGlowLayers + glowLayer];
            if (activeMaterial) activeMaterial.opacity = [0.9, 0.28, 0.12][glowLayer] ?? 0.12;
          }
        });
      });
    },
    dispose: () => {
      outlines.forEach((outline) => {
        scene.remove(outline);
        outline.geometry.dispose();
        (Array.isArray(outline.material) ? outline.material : [outline.material]).forEach((material) => material.dispose());
      });
      activeGlows.forEach((glow) => {
        scene.remove(glow);
        glow.geometry.dispose();
        (Array.isArray(glow.material) ? glow.material : [glow.material]).forEach((material) => material.dispose());
      });
    },
  };
}

function createTrackWorldInternal(
  mount: HTMLDivElement,
  initialPlayerPositions: number[],
  gameId: RunnerGameId,
  cameraFraming: CameraFraming,
  handRhythmGridSize: HandRhythmGridSize = 3,
  showHandRhythmFloor = true,
  cameraOverlayOptions?: HandRhythmCameraOverlayOptions
): HandRhythmTrackWorld {
  let disposed = false;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#101416');
  scene.fog = new THREE.Fog('#101416', 10, 30);

  const playerCount = initialPlayerPositions.length;
  const isJumpDuck = gameId === 'jump-duck';
  const isHandRhythm = gameId === 'hand-rhythm';
  const isLaneBased = isJumpDuck || isHandRhythm;
  const showTrackSurface = !isHandRhythm || showHandRhythmFloor;
  const handRhythmGrid = isHandRhythm ? createHandRhythmGrid(scene, playerCount, handRhythmGridSize) : null;
  const handRhythmCameraOverlay = isHandRhythm && cameraOverlayOptions
    ? createHandRhythmCameraOverlay(scene, playerCount, handRhythmGridSize, cameraOverlayOptions)
    : null;

  const cameras = createTrackCameras(gameId, playerCount, cameraFraming);
  const camera = cameras[0];

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.BasicShadowMap;
  renderer.domElement.className = 'game-canvas';
  mount.appendChild(renderer.domElement);
  let renderWidth = 1;
  let renderHeight = 1;

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

  const disposePlayerLaneMarkers = showTrackSurface
    ? createPlayerLaneMarkers(scene, playerCount)
    : () => {};

  const playerZoneWidth = playerTrackWidth(playerCount);
  const sleeperWidth = isLaneBased ? playerZoneWidth : 7.6;
  const sleeperGeometry = new THREE.BoxGeometry(sleeperWidth, 0.08, 0.14);
  const sideRailGeometry = new THREE.BoxGeometry(0.18, 0.14, 42);
  const guideGeometry = new THREE.BoxGeometry(0.035, 0.04, 42);
  const floorGeometry = new THREE.PlaneGeometry(isLaneBased ? playerZoneWidth : 9.2, 44);

  const trackCenters = isLaneBased
    ? Array.from({ length: playerCount }, (_, i) => playerTrackX(i, playerCount))
    : [0];

  if (showTrackSurface) {
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
  }

  const players = initialPlayerPositions.map((initialPlayerPosition, index) => {
    const player = createFallbackPlayer(index);
    const targetX = isLaneBased
      ? playerTrackX(index, playerCount)
      : positionToWorldX(initialPlayerPosition);
    player.root.position.set(targetX, PLAYER_BASE_Y, PLAYER_Z);
    if (isHandRhythm && playerCount > 1) {
      setObjectLayer(player.root, index + 1);
    }
    scene.add(player.root);
    return player;
  });

  void loadPlayerModels(players, () => disposed)
    .then(() => {
      if (isHandRhythm && playerCount > 1) {
        players.forEach((player, index) => setObjectLayer(player.root, index + 1));
      }
    })
    .catch(() => {
      players.forEach((player) => {
        player.fallback.visible = true;
      });
    });

  return {
    scene,
    camera,
    cameras,
    renderer,
    players,
    render: () => {
      handRhythmCameraOverlay?.update();
      if (cameras.length === 1) {
        renderer.setScissorTest(false);
        renderer.setViewport(0, 0, renderWidth, renderHeight);
        renderer.render(scene, camera);
        return;
      }

      renderer.setScissorTest(true);
      cameras.forEach((playerCamera, playerIndex) => {
        const left = Math.floor(renderWidth * playerIndex / cameras.length);
        const right = Math.floor(renderWidth * (playerIndex + 1) / cameras.length);
        const viewportWidth = Math.max(1, right - left);
        renderer.setViewport(left, 0, viewportWidth, renderHeight);
        renderer.setScissor(left, 0, viewportWidth, renderHeight);
        renderer.render(scene, playerCamera);
      });
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, renderWidth, renderHeight);
    },
    resize: (width, height) => {
      renderWidth = Math.max(1, width);
      renderHeight = Math.max(1, height);
      resizeTrackCameras(cameras, renderWidth, renderHeight);
      renderer.setSize(renderWidth, renderHeight, false);
    },
    updateHandRhythmGrid: (cells) => handRhythmGrid?.update(cells),
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
      handRhythmGrid?.dispose();
      handRhythmCameraOverlay?.dispose();
      players.forEach((player) => {
        disposeObject(player.root);
      });
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

export function createPoseRunnerWorld(
  mount: HTMLDivElement,
  initialPlayerPositions: number[],
  gameId: PoseRunnerGameId,
  cameraFraming: CameraFraming
): TrackWorld {
  return createTrackWorldInternal(mount, initialPlayerPositions, gameId, cameraFraming);
}

export function createHandRhythmWorld(
  mount: HTMLDivElement,
  playerCount: number,
  cameraFraming: CameraFraming,
  gridSize: HandRhythmGridSize,
  showFloor: boolean,
  cameraOverlayOptions: HandRhythmCameraOverlayOptions
): HandRhythmTrackWorld {
  const initialPlayerPositions = Array.from(
    { length: Math.max(1, playerCount) },
    (_, index) => (index + 1) / (Math.max(1, playerCount) + 1)
  );
  return createTrackWorldInternal(
    mount,
    initialPlayerPositions,
    'hand-rhythm',
    cameraFraming,
    gridSize,
    showFloor,
    cameraOverlayOptions
  );
}
