import {
  getAvailableQuantizations,
  getDefaultQuantizationForRuntime,
  type DetectorBackendId,
  type DetectorQuantizationId,
  type DetectorRuntimeId,
  type MediaPipeDelegateId,
  type MediaPipeModelId,
  type YoloModelId,
} from '../pose-detection/aiDetector';
import { getGameDescriptor } from '../game/levelRegistry';
import type { HandRhythmGridSize } from '../game/levels/handRhythmLevel';
import type { HandRhythmDifficulty } from '../game/handRhythmDifficulty';
import type { RunnerGameId } from '../game/gameTypes';
import { normalizeGameRenderFps } from '../game/shared/renderFrameLimiter';
import type { AppPreferences } from './appPreferences';
import type { HandRhythmRendererId } from '../game/games/hand-rhythm/handRhythmRendererTypes';

export type AppPreferencesAction =
  | { type: 'replace'; preferences: AppPreferences }
  | { type: 'gameSelected'; gameId: RunnerGameId }
  | { type: 'songSelected'; songId: AppPreferences['selectedSongId'] }
  | { type: 'backendSelected'; backendId: DetectorBackendId }
  | { type: 'yoloModelSelected'; modelId: YoloModelId }
  | { type: 'mediaPipeModelSelected'; modelId: MediaPipeModelId }
  | { type: 'mediaPipeDelegateSelected'; delegateId: MediaPipeDelegateId }
  | { type: 'runtimeSelected'; runtimeId: DetectorRuntimeId }
  | { type: 'quantizationSelected'; quantizationId: DetectorQuantizationId }
  | { type: 'playerCountChanged'; playerCount: number }
  | { type: 'thresholdChanged'; threshold: number }
  | { type: 'cameraMirrorChanged'; mirrored: boolean }
  | { type: 'cameraPreviewChanged'; visible: boolean }
  | { type: 'detectionOverlayChanged'; visible: boolean }
  | { type: 'handRhythmDifficultyChanged'; difficulty: HandRhythmDifficulty }
  | { type: 'handRhythmGridChanged'; gridSize: HandRhythmGridSize }
  | { type: 'handRhythmDoubleTargetChanceChanged'; chance: number }
  | { type: 'handRhythmFloorChanged'; visible: boolean }
  | { type: 'handRhythmRendererChanged'; renderer: HandRhythmRendererId }
  | { type: 'gameRenderFpsChanged'; fps: number };

export function appPreferencesReducer(
  preferences: AppPreferences,
  action: AppPreferencesAction
): AppPreferences {
  switch (action.type) {
    case 'replace':
      return action.preferences;
    case 'gameSelected':
      return action.gameId === preferences.selectedRunnerGameId
        ? preferences
        : {
            ...preferences,
            selectedRunnerGameId: action.gameId,
            selectedBackendId: getGameDescriptor(action.gameId).defaultBackend,
          };
    case 'songSelected':
      return action.songId === preferences.selectedSongId
        ? preferences
        : { ...preferences, selectedSongId: action.songId };
    case 'backendSelected':
      return action.backendId === preferences.selectedBackendId
        ? preferences
        : { ...preferences, selectedBackendId: action.backendId };
    case 'yoloModelSelected': {
      if (action.modelId === preferences.selectedModelId) {
        return preferences;
      }
      const quantizations = getAvailableQuantizations(action.modelId);
      const selectedQuantizationId = quantizations.some(
        (quantization) => quantization.dtype === preferences.selectedQuantizationId
      )
        ? preferences.selectedQuantizationId
        : getDefaultQuantizationForRuntime(preferences.selectedRuntimeId);
      return { ...preferences, selectedModelId: action.modelId, selectedQuantizationId };
    }
    case 'mediaPipeModelSelected':
      return action.modelId === preferences.selectedMediaPipeModelId
        ? preferences
        : { ...preferences, selectedMediaPipeModelId: action.modelId };
    case 'mediaPipeDelegateSelected':
      return action.delegateId === preferences.selectedMediaPipeDelegateId
        ? preferences
        : { ...preferences, selectedMediaPipeDelegateId: action.delegateId };
    case 'runtimeSelected':
      return action.runtimeId === preferences.selectedRuntimeId
        ? preferences
        : {
            ...preferences,
            selectedRuntimeId: action.runtimeId,
            selectedQuantizationId: getDefaultQuantizationForRuntime(action.runtimeId),
          };
    case 'quantizationSelected':
      return action.quantizationId === preferences.selectedQuantizationId
        ? preferences
        : { ...preferences, selectedQuantizationId: action.quantizationId };
    case 'playerCountChanged':
      return action.playerCount === preferences.playerCount
        ? preferences
        : { ...preferences, playerCount: action.playerCount };
    case 'thresholdChanged':
      return { ...preferences, threshold: action.threshold };
    case 'cameraMirrorChanged':
      return { ...preferences, cameraMirrored: action.mirrored };
    case 'cameraPreviewChanged':
      return {
        ...preferences,
        cameraPreviewVisibility: {
          ...preferences.cameraPreviewVisibility,
          [preferences.selectedRunnerGameId]: action.visible,
        },
      };
    case 'detectionOverlayChanged':
      return {
        ...preferences,
        detectionOverlayVisibility: {
          ...preferences.detectionOverlayVisibility,
          [preferences.selectedRunnerGameId]: action.visible,
        },
      };
    case 'handRhythmDifficultyChanged':
      return action.difficulty === preferences.handRhythmDifficulty
        ? preferences
        : { ...preferences, handRhythmDifficulty: action.difficulty };
    case 'handRhythmGridChanged':
      return action.gridSize === preferences.handRhythmGridSize
        ? preferences
        : { ...preferences, handRhythmGridSize: action.gridSize };
    case 'handRhythmDoubleTargetChanceChanged':
      return {
        ...preferences,
        handRhythmDoubleTargetChance: Math.min(1, Math.max(0, action.chance)),
      };
    case 'handRhythmFloorChanged':
      return action.visible === preferences.showHandRhythmFloor
        ? preferences
        : { ...preferences, showHandRhythmFloor: action.visible };
    case 'handRhythmRendererChanged':
      return action.renderer === preferences.handRhythmRenderer
        ? preferences
        : { ...preferences, handRhythmRenderer: action.renderer };
    case 'gameRenderFpsChanged': {
      const gameRenderFps = normalizeGameRenderFps(action.fps);
      return gameRenderFps === preferences.gameRenderFps
        ? preferences
        : { ...preferences, gameRenderFps };
    }
  }
}

export function getDetectorConfigurationKey(preferences: AppPreferences): string {
  const level = getGameDescriptor(preferences.selectedRunnerGameId);
  return JSON.stringify({
    task: level.detectorTask,
    backend: preferences.selectedBackendId,
    yoloModel: preferences.selectedModelId,
    runtime: preferences.selectedRuntimeId,
    quantization: preferences.selectedQuantizationId,
    mediaPipeModel: preferences.selectedMediaPipeModelId,
    mediaPipeDelegate: preferences.selectedMediaPipeDelegateId,
    playerCount: preferences.playerCount,
    remoteThreshold: preferences.selectedBackendId === 'python-webrtc'
      ? preferences.threshold
      : null,
  });
}
