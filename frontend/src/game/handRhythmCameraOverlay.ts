import * as THREE from 'three';
import type { HandRhythmGridSize } from './levels/handRhythmLevel';
import { getHandRhythmGridBounds } from './levels/handRhythmLayout';
import { PLAYER_Z } from './gameConstants';

export type PlayerTextureCrop = {
  offsetX: number;
  repeatX: number;
};

export type HandRhythmCameraOverlayOptions = {
  cameraMirrored: boolean;
  detectionCanvas: HTMLCanvasElement | null;
  showCameraPreview: boolean;
  showDetectionOverlay: boolean;
  video: HTMLVideoElement | null;
};

type HandRhythmCameraOverlay = {
  dispose: () => void;
  update: () => void;
};

export function getPlayerTextureCrop(
  playerIndex: number,
  playerCount: number,
  mirrored: boolean
): PlayerTextureCrop {
  const count = Math.max(1, playerCount);
  const index = THREE.MathUtils.clamp(playerIndex, 0, count - 1);
  return mirrored
    ? { offsetX: 1 - index / count, repeatX: -1 / count }
    : { offsetX: index / count, repeatX: 1 / count };
}

function configureSourceTexture(texture: THREE.Texture): void {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
}

function cropGeometryUvs(
  geometry: THREE.PlaneGeometry,
  playerIndex: number,
  playerCount: number,
  mirrored: boolean
): void {
  const crop = getPlayerTextureCrop(playerIndex, playerCount, mirrored);
  const uvs = geometry.getAttribute('uv');
  for (let index = 0; index < uvs.count; index += 1) {
    uvs.setX(index, crop.offsetX + uvs.getX(index) * crop.repeatX);
  }
  uvs.needsUpdate = true;
}

export function createHandRhythmCameraOverlay(
  scene: THREE.Scene,
  playerCount: number,
  gridSize: HandRhythmGridSize,
  options: HandRhythmCameraOverlayOptions
): HandRhythmCameraOverlay {
  const count = Math.max(1, playerCount);
  const meshes: THREE.Mesh[] = [];
  const geometries: THREE.PlaneGeometry[] = [];
  const materials: THREE.MeshBasicMaterial[] = [];
  const textures: THREE.Texture[] = [];
  const detectionTextures: THREE.CanvasTexture[] = [];
  const videoTexture = options.showCameraPreview && options.video
    ? new THREE.VideoTexture(options.video)
    : null;
  const detectionTexture = options.showDetectionOverlay && options.detectionCanvas
    ? new THREE.CanvasTexture(options.detectionCanvas)
    : null;

  if (videoTexture) {
    configureSourceTexture(videoTexture);
    textures.push(videoTexture);
  }
  if (detectionTexture) {
    configureSourceTexture(detectionTexture);
    detectionTextures.push(detectionTexture);
    textures.push(detectionTexture);
  }

  for (let playerIndex = 0; playerIndex < count; playerIndex += 1) {
    const bounds = getHandRhythmGridBounds(playerIndex, count, gridSize);
    const geometry = new THREE.PlaneGeometry(bounds.width, bounds.height);
    cropGeometryUvs(geometry, playerIndex, count, options.cameraMirrored);
    geometries.push(geometry);

    const addPlane = (
      texture: THREE.Texture,
      opacity: number,
      z: number,
      renderOrder: number
    ): void => {
      const material = new THREE.MeshBasicMaterial({
        depthWrite: false,
        map: texture,
        opacity,
        side: THREE.DoubleSide,
        toneMapped: false,
        transparent: true,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `player-${playerIndex + 1}-camera-overlay`;
      mesh.position.set(bounds.centerX, bounds.centerY, z);
      mesh.renderOrder = renderOrder;
      if (count > 1) {
        mesh.layers.set(playerIndex + 1);
      }
      scene.add(mesh);
      meshes.push(mesh);
      materials.push(material);
    };

    if (videoTexture) {
      addPlane(videoTexture, 0.16, PLAYER_Z - 0.12, -20);
    }

    if (detectionTexture) {
      addPlane(detectionTexture, 0.42, PLAYER_Z - 0.1, -19);
    }
  }

  return {
    update: () => {
      detectionTextures.forEach((texture) => {
        texture.needsUpdate = true;
      });
    },
    dispose: () => {
      meshes.forEach((mesh) => scene.remove(mesh));
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      textures.forEach((texture) => texture.dispose());
    },
  };
}
