import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import type { AppPreferences } from './appPreferences';
import { useCameraStream } from './useCameraStream';

export type CameraControlOption = {
  value: string;
  label: string;
};

type CameraControllerOptions = {
  preferences: AppPreferences;
  setPreferences: Dispatch<SetStateAction<AppPreferences>>;
  onCameraRestart: () => void;
};

type CameraController = ReturnType<typeof useCameraStream> & {
  error: string | null;
  selectedCameraValue: string;
  cameraOptions: CameraControlOption[];
  clearError: () => void;
  startCameraWithPreferences: () => Promise<MediaStream>;
  changeCamera: (value: string | null) => void;
  changeDevCameraMultiplier: (value: boolean) => void;
};

function getCameraValue(preferences: AppPreferences): string {
  return preferences.cameraDeviceId
    ? `device:${preferences.cameraDeviceId}`
    : `facing:${preferences.cameraFacingMode}`;
}

export function useCameraController({
  preferences,
  setPreferences,
  onCameraRestart,
}: CameraControllerOptions): CameraController {
  const stream = useCameraStream();
  const [error, setError] = useState<string | null>(null);
  const selectedCameraValue = getCameraValue(preferences);

  const cameraOptions = useMemo(() => {
    const selectedDeviceIsAvailable =
      preferences.cameraDeviceId === null ||
      stream.cameraDevices.some((device) => device.deviceId === preferences.cameraDeviceId);

    return [
      { value: 'facing:user', label: 'Front camera' },
      { value: 'facing:environment', label: 'Back camera' },
      ...(selectedDeviceIsAvailable
        ? []
        : [{ value: selectedCameraValue, label: 'Selected camera' }]),
      ...stream.cameraDevices.map((device) => ({
        value: `device:${device.deviceId}`,
        label: device.label,
      })),
    ];
  }, [preferences.cameraDeviceId, selectedCameraValue, stream.cameraDevices]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const startCameraWithPreferences = useCallback(() => {
    return stream.startCamera({
      facingMode: preferences.cameraFacingMode,
      deviceId: preferences.cameraDeviceId,
      devCameraMultiplierEnabled: preferences.devCameraMultiplierEnabled,
    });
  }, [preferences.cameraDeviceId, preferences.cameraFacingMode, preferences.devCameraMultiplierEnabled, stream]);

  const restartCameraIfEnabled = useCallback(async (nextPreferences: AppPreferences) => {
    if (!stream.cameraEnabled) {
      return;
    }

    onCameraRestart();
    setError(null);

    try {
      await stream.startCamera({
        facingMode: nextPreferences.cameraFacingMode,
        deviceId: nextPreferences.cameraDeviceId,
        devCameraMultiplierEnabled: nextPreferences.devCameraMultiplierEnabled,
      });
    } catch (cause: unknown) {
      stream.stopCamera();
      setError(cause instanceof Error ? cause.message : 'Unable to switch camera');
    }
  }, [onCameraRestart, stream]);

  const changeCamera = useCallback((value: string | null) => {
    if (!value) {
      return;
    }

    const nextPreferences: AppPreferences = value.startsWith('device:')
      ? { ...preferences, cameraDeviceId: value.slice('device:'.length) }
      : {
          ...preferences,
          cameraFacingMode: value === 'facing:environment' ? 'environment' : 'user',
          cameraDeviceId: null,
        };

    setPreferences(nextPreferences);
    void restartCameraIfEnabled(nextPreferences);
  }, [preferences, restartCameraIfEnabled, setPreferences]);

  const changeDevCameraMultiplier = useCallback((devCameraMultiplierEnabled: boolean) => {
    const nextPreferences: AppPreferences = {
      ...preferences,
      devCameraMultiplierEnabled,
    };

    setPreferences(nextPreferences);
    void restartCameraIfEnabled(nextPreferences);
  }, [preferences, restartCameraIfEnabled, setPreferences]);

  return {
    ...stream,
    error,
    selectedCameraValue,
    cameraOptions,
    clearError,
    startCameraWithPreferences,
    changeCamera,
    changeDevCameraMultiplier,
  };
}
