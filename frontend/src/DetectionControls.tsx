import type { ReactElement } from 'react';
import { Accordion, ActionIcon, Button, Select, Slider, Switch, Tooltip } from '@mantine/core';
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
import type { CameraControlOption } from './useCameraController';
import { formatMs, formatPercent } from './formatters';
import { MAX_PLAYERS, MIN_PLAYERS } from './poseOverlay';
import type { FrameTimings } from './useMotionDetector';

type HelpLabelProps = {
  children: string;
  help: string;
};

type DetectionControlsProps = {
  preferences: AppPreferences;
  cameraOptions: CameraControlOption[];
  selectedCameraValue: string;
  detections: PersonDetection[];
  error: string | null;
  frameTimings: FrameTimings | null;
  isLoading: boolean;
  lastInferenceMs: number | null;
  modelStatus: string;
  status: string;
  onBackendChange: (value: DetectorBackendId) => void;
  onCameraChange: (value: string | null) => void;
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

function HelpLabel({ children, help }: HelpLabelProps): ReactElement {
  return (
    <span className="control-label">
      <span>{children}</span>
      <Tooltip label={help} multiline withArrow position="top" className="control-tooltip">
        <ActionIcon
          aria-label={`About ${children}`}
          className="tooltip-trigger"
          radius="xl"
          size="xs"
          variant="subtle"
        >
          ?
        </ActionIcon>
      </Tooltip>
    </span>
  );
}

export function DetectionControls({
  preferences,
  cameraOptions,
  selectedCameraValue,
  detections,
  error,
  frameTimings,
  isLoading,
  lastInferenceMs,
  modelStatus,
  status,
  onBackendChange,
  onCameraChange,
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
  const backendOptions = DETECTOR_BACKENDS.map((backend) => ({
    value: backend.id,
    label: `${backend.label} · ${backend.description}`,
  }));
  const yoloModelOptions = YOLO_MODELS.map((model) => ({
    value: model.id,
    label: `${model.label} · ${model.description}`,
  }));
  const runtimeOptions = DETECTOR_RUNTIMES.map((runtime) => ({
    value: runtime.id,
    label: `${runtime.label} · ${runtime.description}`,
  }));
  const quantizationOptions = availableQuantizations.map((quantization) => {
    const option = getQuantizationOption(quantization.dtype);
    return {
      value: quantization.dtype,
      label: `${option.label} · ${option.description} · ${quantization.sizeMb} MB`,
    };
  });
  const mediaPipeModelOptions = MEDIAPIPE_MODELS.map((model) => ({
    value: model.id,
    label: `${model.label} · ${model.description}`,
  }));
  const mediaPipeDelegateOptions = MEDIAPIPE_DELEGATES.map((delegate) => ({
    value: delegate.id,
    label: `${delegate.label} · ${delegate.description}`,
  }));

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
        <Select
          aria-label="Camera"
          className="model-control"
          data={cameraOptions}
          label={
            <HelpLabel help="Choose the phone-facing camera or a specific camera once the browser has shared device names.">
              Camera
            </HelpLabel>
          }
          value={selectedCameraValue}
          onChange={onCameraChange}
        />

        <Switch
          checked={preferences.cameraMirrored}
          className="toggle-control"
          label={
            <HelpLabel help="Matches the preview to your mirror image. Player assignment still uses corrected left/right positions.">
              Mirror camera
            </HelpLabel>
          }
          onChange={(event) => onCameraMirrorChange(event.currentTarget.checked)}
        />

        <div className="player-count-control">
          <HelpLabel help="Sets how many people the overlay should assign to lanes. The detector may see more people, but gameplay only follows this count.">
            Players
          </HelpLabel>
          <strong>{preferences.playerCount}</strong>
          <Slider
            thumbLabel="Players"
            min={MIN_PLAYERS}
            max={MAX_PLAYERS}
            step={1}
            value={preferences.playerCount}
            onChange={onPlayerCountChange}
          />
        </div>

        <div className="threshold-control">
          <HelpLabel help="Filters uncertain detections. Raise it to reduce jitter and false positives; lower it when bodies are partially visible.">
            Confidence
          </HelpLabel>
          <strong>{formatPercent(preferences.threshold)}</strong>
          <Slider
            thumbLabel="Confidence"
            min={0.1}
            max={0.9}
            step={0.05}
            value={preferences.threshold}
            label={(value) => formatPercent(value)}
            onChange={onThresholdChange}
          />
        </div>
      </div>

      <Accordion className="settings-accordion" multiple variant="unstyled">
        <Accordion.Item className="advanced-panel" value="advanced-tracking">
          <Accordion.Control className="advanced-panel-summary">Advanced tracking</Accordion.Control>
          <Accordion.Panel className="advanced-panel-content">
            <Select
              aria-label="Tracker"
              className="model-control"
              data={backendOptions}
              disabled={isLoading}
              label={
                <HelpLabel help="Choose where pose detection runs: in-browser MediaPipe, in-browser YOLO, or the local Python WebRTC tracker.">
                  Tracker
                </HelpLabel>
              }
              value={preferences.selectedBackendId}
              onChange={(value) => {
                if (value) {
                  onBackendChange(value);
                }
              }}
            />

            {isPythonWebRtc ? (
              <div className="connection-note">
                <HelpLabel help="WebSocket is used only to exchange the WebRTC offer, answer, and ICE candidates. Camera frames and detections move over WebRTC.">
                  Signaling URL
                </HelpLabel>
                <code>{import.meta.env.VITE_POSE_TRACKER_SIGNALING_URL ?? 'ws://127.0.0.1:8765'}</code>
              </div>
            ) : isYolo ? (
              <>
                <Select
                  aria-label="Model"
                  className="model-control"
                  data={yoloModelOptions}
                  disabled={isLoading}
                  label={
                    <HelpLabel help="Pose models return body keypoints; detection models return person boxes. Smaller models react faster, larger ones can be steadier.">
                      Model
                    </HelpLabel>
                  }
                  value={preferences.selectedModelId}
                  onChange={(value) => {
                    if (value) {
                      onModelChange(value);
                    }
                  }}
                />

                <Select
                  aria-label="Runtime"
                  className="model-control"
                  data={runtimeOptions}
                  disabled={isLoading}
                  label={
                    <HelpLabel help="WebGPU uses the browser GPU path when available. WASM keeps everything on CPU and is useful for compatibility checks.">
                      Runtime
                    </HelpLabel>
                  }
                  value={preferences.selectedRuntimeId}
                  onChange={(value) => {
                    if (value) {
                      onRuntimeChange(value);
                    }
                  }}
                />

                <Select
                  aria-label="Quantization"
                  className="model-control"
                  data={quantizationOptions}
                  disabled={isLoading}
                  label={
                    <HelpLabel help="Controls model weight precision. Lower-bit files download faster and use less memory; FP16 usually preserves more detail on WebGPU.">
                      Quantization
                    </HelpLabel>
                  }
                  value={preferences.selectedQuantizationId}
                  onChange={(value) => {
                    if (value) {
                      onQuantizationChange(value);
                    }
                  }}
                />
              </>
            ) : (
              <>
                <Select
                  aria-label="Model"
                  className="model-control"
                  data={mediaPipeModelOptions}
                  disabled={isLoading}
                  label={
                    <HelpLabel help="Lite is quickest, Full is balanced, and Heavy favors accuracy when your machine has enough headroom.">
                      Model
                    </HelpLabel>
                  }
                  value={preferences.selectedMediaPipeModelId}
                  onChange={(value) => {
                    if (value) {
                      onMediaPipeModelChange(value);
                    }
                  }}
                />

                <Select
                  aria-label="Delegate"
                  className="model-control"
                  data={mediaPipeDelegateOptions}
                  disabled={isLoading}
                  label={
                    <HelpLabel help="GPU is the preferred fast path. CPU is the fallback when the GPU delegate is unavailable or unstable.">
                      Delegate
                    </HelpLabel>
                  }
                  value={preferences.selectedMediaPipeDelegateId}
                  onChange={(value) => {
                    if (value) {
                      onMediaPipeDelegateChange(value);
                    }
                  }}
                />
              </>
            )}
          </Accordion.Panel>
        </Accordion.Item>

      </Accordion>

      <div className="docs-entry">
        <div>
          <p className="eyebrow">Documentation</p>
          <p>Open the tracking internals view for the full client-side ownership and WebRTC data-flow notes.</p>
        </div>
        <Button
          className="secondary-action"
          component="a"
          href="/docs/tracking-internals"
          rel="noreferrer"
          target="_blank"
          variant="default"
        >
          Tracking docs
        </Button>
      </div>

      {frameTimings && (
        <Accordion className="settings-accordion timing-panel" variant="unstyled">
          <Accordion.Item className="advanced-panel" value="frame-timing">
            <Accordion.Control className="advanced-panel-summary">Frame timing</Accordion.Control>
            <Accordion.Panel className="advanced-panel-content">
              <dl aria-label="Frame timing breakdown">
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
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
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

      <Button className="control-action" type="button" onClick={onStopCamera} disabled={stopDisabled} variant="default">
        Stop camera
      </Button>
    </>
  );
}
