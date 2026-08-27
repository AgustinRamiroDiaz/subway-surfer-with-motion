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
    expect(previewChanged.cameraPreviewVisibility.sideways).toBe(false);
    expect(previewChanged.cameraPreviewVisibility['jump-duck']).toBe(true);
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

  test('stores and clamps the Hand Rhythm double-target chance', () => {
    expect(DEFAULT_APP_PREFERENCES.handRhythmDoubleTargetChance).toBe(0.1);
    expect(appPreferencesReducer(DEFAULT_APP_PREFERENCES, {
      type: 'handRhythmDoubleTargetChanceChanged',
      chance: 0.35,
    }).handRhythmDoubleTargetChance).toBe(0.35);
    expect(appPreferencesReducer(DEFAULT_APP_PREFERENCES, {
      type: 'handRhythmDoubleTargetChanceChanged',
      chance: 2,
    }).handRhythmDoubleTargetChance).toBe(1);
  });

  test('defaults to Medium and stores the Hand Rhythm difficulty without reloading the detector', () => {
    expect(DEFAULT_APP_PREFERENCES.handRhythmDifficulty).toBe('medium');
    const changed = appPreferencesReducer(DEFAULT_APP_PREFERENCES, {
      type: 'handRhythmDifficultyChanged',
      difficulty: 'hard',
    });

    expect(changed.handRhythmDifficulty).toBe('hard');
    expect(getDetectorConfigurationKey(changed)).toBe(getDetectorConfigurationKey(DEFAULT_APP_PREFERENCES));
  });

  test('stores a normalized render FPS without reloading the detector', () => {
    expect(DEFAULT_APP_PREFERENCES.gameRenderFps).toBe(60);
    const changed = appPreferencesReducer(DEFAULT_APP_PREFERENCES, {
      type: 'gameRenderFpsChanged',
      fps: 62,
    });

    expect(changed.gameRenderFps).toBe(60);
    expect(getDetectorConfigurationKey(changed)).toBe(getDetectorConfigurationKey(DEFAULT_APP_PREFERENCES));
  });
});
