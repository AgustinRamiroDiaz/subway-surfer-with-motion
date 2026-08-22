import { MantineProvider } from '@mantine/core';
import { act, renderHook } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { DEFAULT_APP_PREFERENCES } from '../app/appPreferences';
import { I18nProvider } from '../app/i18n';
import { loadDetectorClient } from '../pose-detection/detectorClient';
import type { DetectorResult } from '../pose-detection/aiDetector';
import { useDetectorSession } from './useDetectorSession';

vi.mock('../pose-detection/detectorClient', () => ({
  loadDetectorClient: vi.fn(),
}));

const mockedLoadDetectorClient = vi.mocked(loadDetectorClient);

function wrapper({ children }: { children: ReactNode }): ReactElement {
  return (
    <MantineProvider>
      <I18nProvider>{children}</I18nProvider>
    </MantineProvider>
  );
}

describe('useDetectorSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('loads once and disposes the active detector', async () => {
    const detector = vi.fn();
    const dispose = vi.fn();
    mockedLoadDetectorClient.mockResolvedValue({
      detector,
      runtime: 'MediaPipe GPU',
      dispose,
    });
    const { result } = renderHook(() => useDetectorSession({
      task: 'pose',
      preferencesRef: { current: DEFAULT_APP_PREFERENCES },
      streamRef: { current: null },
      onStreamResult: vi.fn(),
      onStreamError: vi.fn(),
    }), { wrapper });

    await act(async () => {
      expect(await result.current.loadDetector()).toBe(detector);
      expect(await result.current.loadDetector()).toBe(detector);
    });
    expect(mockedLoadDetectorClient).toHaveBeenCalledTimes(1);

    act(() => result.current.disposeDetector());
    expect(dispose).toHaveBeenCalledOnce();
    expect(result.current.detectorRef.current).toBeNull();
  });

  test('forwards streamed results and errors through current callbacks', async () => {
    const onStreamResult = vi.fn();
    const onStreamError = vi.fn();
    let emitResult: ((prediction: DetectorResult) => void) | undefined;
    let emitError: ((error: Error) => void) | undefined;
    mockedLoadDetectorClient.mockImplementation((options) => {
      emitResult = options.onResult;
      emitError = options.onError;
      return Promise.resolve({
        detector: vi.fn(),
        runtime: 'Python WebRTC',
        mode: 'stream',
        dispose: vi.fn(),
      });
    });
    const { result } = renderHook(() => useDetectorSession({
      task: 'pose',
      preferencesRef: { current: DEFAULT_APP_PREFERENCES },
      streamRef: { current: null },
      onStreamResult,
      onStreamError,
    }), { wrapper });

    await act(() => result.current.loadDetector());
    const prediction: DetectorResult = {
      protocolVersion: 1,
      type: 'model-prediction',
      frame: { frameId: 'frame', capturedAtMs: 0, width: 1, height: 1 },
      detections: [],
      timings: { rawImageMs: 0, preprocessMs: 0, modelMs: 0, postprocessMs: 0, totalMs: 0 },
    };
    act(() => {
      emitResult?.(prediction);
      emitError?.(new Error('stream failed'));
    });

    expect(onStreamResult).toHaveBeenCalledWith(prediction);
    expect(onStreamError).toHaveBeenCalledWith(expect.objectContaining({ message: 'stream failed' }));
  });
});
