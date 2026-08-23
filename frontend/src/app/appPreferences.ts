import {
  DEFAULT_POSE_BACKEND_ID,
  DEFAULT_DETECTOR_QUANTIZATION_ID,
  DEFAULT_DETECTOR_RUNTIME_ID,
  DEFAULT_MEDIAPIPE_DELEGATE_ID,
  DEFAULT_MEDIAPIPE_MODEL_ID,
  DEFAULT_YOLO_MODEL_ID,
  POSE_BACKENDS,
  GESTURE_BACKENDS,
  DETECTOR_RUNTIMES,
  MEDIAPIPE_DELEGATES,
  MEDIAPIPE_MODELS,
  YOLO_MODELS,
  type DetectorBackendId,
  type DetectorQuantizationId,
  type DetectorRuntimeId,
  type MediaPipeDelegateId,
  type MediaPipeModelId,
  type YoloModelId,
  getAvailableQuantizations,
  getDefaultQuantizationForRuntime,
  getQuantizationOption,
} from '../pose-detection/aiDetector';
import { DEFAULT_PLAYER_COUNT, normalizePlayerCount } from '../motion-mapping/playerPositions';
import type { RunnerGameId } from '../game/gameTypes';
import {
  DEFAULT_HAND_RHYTHM_GRID_SIZE,
  DEFAULT_HAND_RHYTHM_DOUBLE_TARGET_CHANCE,
  HAND_RHYTHM_GRID_SIZES,
  type HandRhythmGridSize,
} from '../game/levels/handRhythmLevel';

export const DEFAULT_THRESHOLD = 0.45;
export const DEFAULT_CAMERA_MIRRORED = true;
export const CAMERA_FACING_MODES = ['user', 'environment'] as const;
export const APP_PREFERENCES_STORAGE_KEY = 'motion-runner:detection-preferences:v1';
const RUNNER_GAME_IDS: readonly RunnerGameId[] = ['sideways', 'jump-duck', 'hand-rhythm'];

export type CameraFacingMode = (typeof CAMERA_FACING_MODES)[number];

function isRunnerGameId(value: unknown): value is RunnerGameId {
  return value === 'sideways' || value === 'jump-duck' || value === 'hand-rhythm';
}

export type AppPreferences = {
  selectedRunnerGameId: RunnerGameId;
  selectedBackendId: DetectorBackendId;
  selectedModelId: YoloModelId;
  selectedRuntimeId: DetectorRuntimeId;
  selectedQuantizationId: DetectorQuantizationId;
  selectedMediaPipeModelId: MediaPipeModelId;
  selectedMediaPipeDelegateId: MediaPipeDelegateId;
  playerCount: number;
  handRhythmGridSize: HandRhythmGridSize;
  handRhythmDoubleTargetChance: number;
  showHandRhythmFloor: boolean;
  threshold: number;
  cameraMirrored: boolean;
  cameraPreviewVisibility: Record<RunnerGameId, boolean>;
  detectionOverlayVisibility: Record<RunnerGameId, boolean>;
  cameraFacingMode: CameraFacingMode;
  cameraDeviceId: string | null;
  devCameraMultiplier: number;
};

type StoredAppPreferences = Partial<AppPreferences> & {
  devCameraMultiplierEnabled?: boolean;
  showCameraPreview?: boolean;
};

export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  selectedRunnerGameId: 'sideways',
  selectedBackendId: DEFAULT_POSE_BACKEND_ID,
  selectedModelId: DEFAULT_YOLO_MODEL_ID,
  selectedRuntimeId: DEFAULT_DETECTOR_RUNTIME_ID,
  selectedQuantizationId: DEFAULT_DETECTOR_QUANTIZATION_ID,
  selectedMediaPipeModelId: DEFAULT_MEDIAPIPE_MODEL_ID,
  selectedMediaPipeDelegateId: DEFAULT_MEDIAPIPE_DELEGATE_ID,
  playerCount: DEFAULT_PLAYER_COUNT,
  handRhythmGridSize: DEFAULT_HAND_RHYTHM_GRID_SIZE,
  handRhythmDoubleTargetChance: DEFAULT_HAND_RHYTHM_DOUBLE_TARGET_CHANCE,
  showHandRhythmFloor: true,
  threshold: DEFAULT_THRESHOLD,
  cameraMirrored: DEFAULT_CAMERA_MIRRORED,
  cameraPreviewVisibility: {
    sideways: true,
    'jump-duck': true,
    'hand-rhythm': true,
  },
  detectionOverlayVisibility: {
    sideways: true,
    'jump-duck': true,
    'hand-rhythm': true,
  },
  cameraFacingMode: 'user',
  cameraDeviceId: null,
  devCameraMultiplier: 1,
};

function isOptionId<T extends string>(value: unknown, options: ReadonlyArray<{ id: T }>): value is T {
  return typeof value === 'string' && options.some((option) => option.id === value);
}

function isQuantizationId(value: unknown): value is DetectorQuantizationId {
  return typeof value === 'string' && getQuantizationOption(value as DetectorQuantizationId).id === value;
}

function isCameraFacingMode(value: unknown): value is CameraFacingMode {
  return typeof value === 'string' && CAMERA_FACING_MODES.some((mode) => mode === value);
}

function normalizeHandRhythmGridSize(value: unknown): HandRhythmGridSize {
  return HAND_RHYTHM_GRID_SIZES.includes(value as HandRhythmGridSize)
    ? value as HandRhythmGridSize
    : DEFAULT_HAND_RHYTHM_GRID_SIZE;
}

function normalizeProbability(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : fallback;
}

function normalizeCameraPreviewVisibility(
  value: unknown,
  legacyVisibility: unknown
): Record<RunnerGameId, boolean> {
  const storedVisibility = value && typeof value === 'object'
    ? value as Partial<Record<RunnerGameId, unknown>>
    : {};
  const fallback = typeof legacyVisibility === 'boolean' ? legacyVisibility : true;

  return Object.fromEntries(
    RUNNER_GAME_IDS.map((gameId) => [
      gameId,
      typeof storedVisibility[gameId] === 'boolean' ? storedVisibility[gameId] : fallback,
    ])
  ) as Record<RunnerGameId, boolean>;
}

function normalizeDetectionOverlayVisibility(value: unknown): Record<RunnerGameId, boolean> {
  const storedVisibility = value && typeof value === 'object'
    ? value as Partial<Record<RunnerGameId, unknown>>
    : {};

  return Object.fromEntries(
    RUNNER_GAME_IDS.map((gameId) => [gameId, storedVisibility[gameId] !== false])
  ) as Record<RunnerGameId, boolean>;
}

export function readStoredAppPreferences(): AppPreferences {
  const defaults = DEFAULT_APP_PREFERENCES;

  if (typeof window === 'undefined') {
    return defaults;
  }

  try {
    const rawPreferences = window.localStorage.getItem(APP_PREFERENCES_STORAGE_KEY);
    if (!rawPreferences) {
      return defaults;
    }

    const stored = JSON.parse(rawPreferences) as StoredAppPreferences;
    const selectedModelId = isOptionId(stored.selectedModelId, YOLO_MODELS)
      ? stored.selectedModelId
      : defaults.selectedModelId;
    const selectedRuntimeId = isOptionId(stored.selectedRuntimeId, DETECTOR_RUNTIMES)
      ? stored.selectedRuntimeId
      : defaults.selectedRuntimeId;
    const availableQuantizations = getAvailableQuantizations(selectedModelId);
    const selectedQuantizationId =
      isQuantizationId(stored.selectedQuantizationId) &&
      availableQuantizations.some((quantization) => quantization.dtype === stored.selectedQuantizationId)
        ? stored.selectedQuantizationId
        : getDefaultQuantizationForRuntime(selectedRuntimeId);

    return {
      selectedRunnerGameId: isRunnerGameId(stored.selectedRunnerGameId)
        ? stored.selectedRunnerGameId
        : defaults.selectedRunnerGameId,
      selectedBackendId:
        isOptionId(stored.selectedBackendId, POSE_BACKENDS) || isOptionId(stored.selectedBackendId, GESTURE_BACKENDS)
          ? stored.selectedBackendId
          : defaults.selectedBackendId,
      selectedModelId,
      selectedRuntimeId,
      selectedQuantizationId,
      selectedMediaPipeModelId: isOptionId(stored.selectedMediaPipeModelId, MEDIAPIPE_MODELS)
        ? stored.selectedMediaPipeModelId
        : defaults.selectedMediaPipeModelId,
      selectedMediaPipeDelegateId: isOptionId(stored.selectedMediaPipeDelegateId, MEDIAPIPE_DELEGATES)
        ? stored.selectedMediaPipeDelegateId
        : defaults.selectedMediaPipeDelegateId,
      playerCount: normalizePlayerCount(stored.playerCount),
      handRhythmGridSize: normalizeHandRhythmGridSize(stored.handRhythmGridSize),
      handRhythmDoubleTargetChance: normalizeProbability(
        stored.handRhythmDoubleTargetChance,
        defaults.handRhythmDoubleTargetChance
      ),
      showHandRhythmFloor:
        typeof stored.showHandRhythmFloor === 'boolean' ? stored.showHandRhythmFloor : defaults.showHandRhythmFloor,
      threshold:
        typeof stored.threshold === 'number' && Number.isFinite(stored.threshold)
          ? Math.min(0.9, Math.max(0.1, stored.threshold))
          : defaults.threshold,
      cameraMirrored:
        typeof stored.cameraMirrored === 'boolean' ? stored.cameraMirrored : defaults.cameraMirrored,
      cameraPreviewVisibility: normalizeCameraPreviewVisibility(
        stored.cameraPreviewVisibility,
        stored.showCameraPreview
      ),
      detectionOverlayVisibility: normalizeDetectionOverlayVisibility(stored.detectionOverlayVisibility),
      cameraFacingMode: isCameraFacingMode(stored.cameraFacingMode)
        ? stored.cameraFacingMode
        : defaults.cameraFacingMode,
      cameraDeviceId:
        typeof stored.cameraDeviceId === 'string' && stored.cameraDeviceId.length > 0
          ? stored.cameraDeviceId
          : defaults.cameraDeviceId,
      devCameraMultiplier:
        typeof stored.devCameraMultiplier === 'number'
          ? stored.devCameraMultiplier
          : stored.devCameraMultiplierEnabled === true ? 2 : defaults.devCameraMultiplier,
    };
  } catch {
    return defaults;
  }
}

export function writeStoredAppPreferences(preferences: AppPreferences): void {
  try {
    window.localStorage.setItem(APP_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Preferences are helpful, not required for the detector to run.
  }
}
