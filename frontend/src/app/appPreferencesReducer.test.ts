import { describe, expect, test } from 'vitest';
import { DEFAULT_APP_PREFERENCES } from './appPreferences';
import { appPreferencesReducer, getDetectorConfigurationKey } from './appPreferencesReducer';

describe('appPreferencesReducer', () => {
  test('applies game compatibility rules in one place', () => {
    const preferences = appPreferencesReducer(DEFAULT_APP_PREFERENCES, {
      type: 'gameSelected',
      gameId: 'hand-rhythm',
    });

    expect(preferences.selectedRunnerGameId).toBe('hand-rhythm');
    expect(preferences.selectedBackendId).toBe('mediapipe-gesture');
  });

  test('derives detector invalidation only from detector-affecting fields', () => {
    const initialKey = getDetectorConfigurationKey(DEFAULT_APP_PREFERENCES);
    const previewChanged = appPreferencesReducer(DEFAULT_APP_PREFERENCES, {
      type: 'cameraPreviewChanged',
      visible: false,
    });
    const playersChanged = appPreferencesReducer(DEFAULT_APP_PREFERENCES, {
      type: 'playerCountChanged',
      playerCount: 3,
    });

    expect(getDetectorConfigurationKey(previewChanged)).toBe(initialKey);
    expect(getDetectorConfigurationKey(playersChanged)).not.toBe(initialKey);
  });

  test('only invalidates for threshold changes on the remote backend', () => {
    const localChanged = appPreferencesReducer(DEFAULT_APP_PREFERENCES, {
      type: 'thresholdChanged',
      threshold: 0.7,
    });
    const remote = { ...DEFAULT_APP_PREFERENCES, selectedBackendId: 'python-webrtc' as const };
    const remoteChanged = appPreferencesReducer(remote, {
      type: 'thresholdChanged',
      threshold: 0.7,
    });

    expect(getDetectorConfigurationKey(localChanged)).toBe(getDetectorConfigurationKey(DEFAULT_APP_PREFERENCES));
    expect(getDetectorConfigurationKey(remoteChanged)).not.toBe(getDetectorConfigurationKey(remote));
  });
});
