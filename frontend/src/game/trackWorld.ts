import * as THREE from 'three';
import {
  PLAYER_BASE_Y,
  PLAYER_Z,
  TRACK_MAX_X,
  TRACK_MIN_X,
} from './gameConstants';
import type { TrackWorld } from './gameTypes';
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
  if (playerCount <= 1) {
    return 0;
  }

  return THREE.MathUtils.lerp(-2.2, 2.2, index / (playerCount - 1));
}

export function createTrackWorld(mount: HTMLDivElement, initialPlayerPositions: number[]): TrackWorld {
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
