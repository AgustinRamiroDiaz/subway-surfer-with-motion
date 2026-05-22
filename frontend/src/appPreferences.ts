import {
  DEFAULT_DETECTOR_BACKEND_ID,
  DEFAULT_DETECTOR_QUANTIZATION_ID,
  DEFAULT_DETECTOR_RUNTIME_ID,
  DEFAULT_MEDIAPIPE_DELEGATE_ID,
  DEFAULT_MEDIAPIPE_MODEL_ID,
  DEFAULT_YOLO_MODEL_ID,
  DETECTOR_BACKENDS,
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
} from './aiDetector';
import { DEFAULT_PLAYER_COUNT, normalizePlayerCount } from './poseOverlay';

export const DEFAULT_THRESHOLD = 0.45;
export const DEFAULT_CAMERA_MIRRORED = true;
export const CAMERA_FACING_MODES = ['user', 'environment'] as const;
export const APP_PREFERENCES_STORAGE_KEY = 'motion-runner:detection-preferences:v1';

export type CameraFacingMode = (typeof CAMERA_FACING_MODES)[number];

export type AppPreferences = {
  selectedBackendId: DetectorBackendId;
  selectedModelId: YoloModelId;
  selectedRuntimeId: DetectorRuntimeId;
  selectedQuantizationId: DetectorQuantizationId;
  selectedMediaPipeModelId: MediaPipeModelId;
  selectedMediaPipeDelegateId: MediaPipeDelegateId;
  playerCount: number;
  threshold: number;
  cameraMirrored: boolean;
  cameraFacingMode: CameraFacingMode;
  cameraDeviceId: string | null;
};

type StoredAppPreferences = Partial<AppPreferences>;

export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  selectedBackendId: DEFAULT_DETECTOR_BACKEND_ID,
  selectedModelId: DEFAULT_YOLO_MODEL_ID,
  selectedRuntimeId: DEFAULT_DETECTOR_RUNTIME_ID,
  selectedQuantizationId: DEFAULT_DETECTOR_QUANTIZATION_ID,
  selectedMediaPipeModelId: DEFAULT_MEDIAPIPE_MODEL_ID,
  selectedMediaPipeDelegateId: DEFAULT_MEDIAPIPE_DELEGATE_ID,
  playerCount: DEFAULT_PLAYER_COUNT,
  threshold: DEFAULT_THRESHOLD,
  cameraMirrored: DEFAULT_CAMERA_MIRRORED,
  cameraFacingMode: 'user',
  cameraDeviceId: null,
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
      selectedBackendId: isOptionId(stored.selectedBackendId, DETECTOR_BACKENDS)
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
      threshold:
        typeof stored.threshold === 'number' && Number.isFinite(stored.threshold)
          ? Math.min(0.9, Math.max(0.1, stored.threshold))
          : defaults.threshold,
      cameraMirrored:
        typeof stored.cameraMirrored === 'boolean' ? stored.cameraMirrored : defaults.cameraMirrored,
      cameraFacingMode: isCameraFacingMode(stored.cameraFacingMode)
        ? stored.cameraFacingMode
        : defaults.cameraFacingMode,
      cameraDeviceId:
        typeof stored.cameraDeviceId === 'string' && stored.cameraDeviceId.length > 0
          ? stored.cameraDeviceId
          : defaults.cameraDeviceId,
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
