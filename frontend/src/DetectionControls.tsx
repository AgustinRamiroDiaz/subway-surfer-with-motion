import type { ChangeEvent, ReactElement } from 'react';
import {
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
  type PersonDetection,
  type YoloModelId,
  getAvailableQuantizations,
  getQuantizationOption,
} from './aiDetector';
import type { AppPreferences } from './appPreferences';
import { formatMs, formatPercent } from './formatters';
import { MAX_PLAYERS, MIN_PLAYERS } from './poseOverlay';
import type { FrameTimings } from './useMotionDetector';

type DetectionControlsProps = {
  preferences: AppPreferences;
  detections: PersonDetection[];
  error: string | null;
  frameTimings: FrameTimings | null;
  isLoading: boolean;
  lastInferenceMs: number | null;
  modelStatus: string;
  status: string;
  onBackendChange: (value: DetectorBackendId) => void;
  onCameraMirrorChange: (value: boolean) => void;
  onMediaPipeDelegateChange: (value: MediaPipeDelegateId) => void;
  onMediaPipeModelChange: (value: MediaPipeModelId) => void;
  onModelChange: (value: YoloModelId) => void;
  onPlayerCountChange: (value: number) => void;
  onQuantizationChange: (value: DetectorQuantizationId) => void;
  onRuntimeChange: (value: DetectorRuntimeId) => void;
  onStopCamera: () => void;
  onThresholdChange: (value: number) => void;
  stopDisabled: boolean;
};

export function DetectionControls({
  preferences,
  detections,
  error,
  frameTimings,
  isLoading,
  lastInferenceMs,
  modelStatus,
  status,
  onBackendChange,
  onCameraMirrorChange,
  onMediaPipeDelegateChange,
  onMediaPipeModelChange,
  onModelChange,
  onPlayerCountChange,
  onQuantizationChange,
  onRuntimeChange,
  onStopCamera,
  onThresholdChange,
  stopDisabled,
}: DetectionControlsProps): ReactElement {
  const availableQuantizations = getAvailableQuantizations(preferences.selectedModelId);
  const isYolo = preferences.selectedBackendId === 'yolo';
  const isPythonWebRtc = preferences.selectedBackendId === 'python-webrtc';

  return (
    <>
      <div className="status-panel">
        <p className="eyebrow">Run state</p>
        <h2>{status}</h2>
        <p className="model-status">{modelStatus}</p>
        {lastInferenceMs !== null && <p className="latency">{lastInferenceMs} ms inference</p>}
      </div>

      {error && <p className="error-message">{error}</p>}

      <div className="quick-settings">
        <label className="toggle-control">
          <span>Mirror camera</span>
          <input
            type="checkbox"
            checked={preferences.cameraMirrored}
            onChange={(event) => onCameraMirrorChange(event.target.checked)}
          />
        </label>

        <label className="player-count-control">
          <span>Players</span>
          <strong>{preferences.playerCount}</strong>
          <input
            type="range"
            min={MIN_PLAYERS}
            max={MAX_PLAYERS}
            step="1"
            value={preferences.playerCount}
            onChange={(event) => onPlayerCountChange(Number(event.target.value))}
          />
        </label>

        <label className="threshold-control">
          <span>Confidence</span>
          <strong>{formatPercent(preferences.threshold)}</strong>
          <input
            type="range"
            min="0.1"
            max="0.9"
            step="0.05"
            value={preferences.threshold}
            onChange={(event) => onThresholdChange(Number(event.target.value))}
          />
        </label>
      </div>

      <details className="advanced-panel">
        <summary>Advanced tracking</summary>

        <label className="model-control">
          <span>Tracker</span>
          <select
            value={preferences.selectedBackendId}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => onBackendChange(event.target.value as DetectorBackendId)}
            disabled={isLoading}
          >
            {DETECTOR_BACKENDS.map((backend) => (
              <option key={backend.id} value={backend.id}>
                {backend.label} · {backend.description}
              </option>
            ))}
          </select>
        </label>

        {isPythonWebRtc ? (
          <p className="model-status">
            Signaling URL: {import.meta.env.VITE_POSE_TRACKER_SIGNALING_URL ?? 'ws://127.0.0.1:8765'}
          </p>
        ) : isYolo ? (
          <>
            <label className="model-control">
              <span>Model</span>
              <select
                value={preferences.selectedModelId}
                onChange={(event) => onModelChange(event.target.value as YoloModelId)}
                disabled={isLoading}
              >
                {YOLO_MODELS.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label} · {model.description}
                  </option>
                ))}
              </select>
            </label>

            <label className="model-control">
              <span>Runtime</span>
              <select
                value={preferences.selectedRuntimeId}
                onChange={(event) => onRuntimeChange(event.target.value as DetectorRuntimeId)}
                disabled={isLoading}
              >
                {DETECTOR_RUNTIMES.map((runtime) => (
                  <option key={runtime.id} value={runtime.id}>
                    {runtime.label} · {runtime.description}
                  </option>
                ))}
              </select>
            </label>

            <label className="model-control">
              <span>Quantization</span>
              <select
                value={preferences.selectedQuantizationId}
                onChange={(event) => onQuantizationChange(event.target.value as DetectorQuantizationId)}
                disabled={isLoading}
              >
                {availableQuantizations.map((quantization) => {
                  const option = getQuantizationOption(quantization.dtype);
                  return (
                    <option key={quantization.dtype} value={quantization.dtype}>
                      {option.label} · {option.description} · {quantization.sizeMb} MB
                    </option>
                  );
                })}
              </select>
            </label>
          </>
        ) : (
          <>
            <label className="model-control">
              <span>Model</span>
              <select
                value={preferences.selectedMediaPipeModelId}
                onChange={(event) => onMediaPipeModelChange(event.target.value as MediaPipeModelId)}
                disabled={isLoading}
              >
                {MEDIAPIPE_MODELS.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label} · {model.description}
                  </option>
                ))}
              </select>
            </label>

            <label className="model-control">
              <span>Delegate</span>
              <select
                value={preferences.selectedMediaPipeDelegateId}
                onChange={(event) => onMediaPipeDelegateChange(event.target.value as MediaPipeDelegateId)}
                disabled={isLoading}
              >
                {MEDIAPIPE_DELEGATES.map((delegate) => (
                  <option key={delegate.id} value={delegate.id}>
                    {delegate.label} · {delegate.description}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
      </details>

      {frameTimings && (
        <details className="advanced-panel timing-panel" aria-label="Frame timing breakdown">
          <summary>Frame timing</summary>
          <dl>
            <div>
              <dt>Capture</dt>
              <dd>{formatMs(frameTimings.captureMs)}</dd>
            </div>
            <div>
              <dt>Raw image</dt>
              <dd>{formatMs(frameTimings.rawImageMs)}</dd>
            </div>
            <div>
              <dt>Preprocess</dt>
              <dd>{formatMs(frameTimings.preprocessMs)}</dd>
            </div>
            <div>
              <dt>Model</dt>
              <dd>{formatMs(frameTimings.modelMs)}</dd>
            </div>
            <div>
              <dt>Postprocess</dt>
              <dd>{formatMs(frameTimings.postprocessMs)}</dd>
            </div>
            <div>
              <dt>Draw</dt>
              <dd>{formatMs(frameTimings.drawMs)}</dd>
            </div>
            <div>
              <dt>Total</dt>
              <dd>{formatMs(frameTimings.loopMs)}</dd>
            </div>
          </dl>
        </details>
      )}

      <div className="detection-list" aria-live="polite">
        <p className="eyebrow">People</p>
        {detections.length > 0 ? (
          <ul>
            {detections.slice(0, 8).map((detection, index) => (
              <li key={`${detection.label}-${index}-${Math.round(detection.score * 1000)}`}>
                <span>Person {index + 1}</span>
                <strong>
                  {detection.keypoints?.length ? `${detection.keypoints.length} points` : formatPercent(detection.score)}
                </strong>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No people above threshold.</p>
        )}
      </div>

      <button type="button" onClick={onStopCamera} disabled={stopDisabled}>
        Stop camera
      </button>
    </>
  );
}
