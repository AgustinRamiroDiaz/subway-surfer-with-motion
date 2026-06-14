import type { ReactElement } from 'react';
import { Accordion, ActionIcon, Button, Select, Slider, Switch, Tooltip } from '@mantine/core';
import {
  POSE_BACKENDS,
  GESTURE_BACKENDS,
  DETECTOR_RUNTIMES,
  MEDIAPIPE_DELEGATES,
  MEDIAPIPE_MODELS,
  YOLO_MODELS,
  type DetectorBackendId,
  type DetectorQuantizationId,
  type DetectorRuntimeId,
  type DetectorTask,
  type HandGestureDetection,
  type MediaPipeDelegateId,
  type MediaPipeModelId,
  type PersonDetection,
  type YoloModelId,
  getAvailableQuantizations,
  getQuantizationOption,
} from '../pose-detection/aiDetector';
import type { AppPreferences } from '../app/appPreferences';
import type { CameraControlOption } from '../hooks/useCameraController';
import { formatMs, formatPercent } from '../formatters';
import { LANGUAGES, type TranslationKey, useI18n } from '../app/i18n';
import { MAX_PLAYERS, MIN_PLAYERS } from '../motion-mapping/playerPositions';
import type { FrameTimings } from '../hooks/useMotionDetector';

type HelpLabelProps = {
  children: string;
  help: string;
};

type DetectionControlsProps = {
  task: DetectorTask;
  preferences: AppPreferences;
  cameraOptions: CameraControlOption[];
  selectedCameraValue: string;
  detections: Array<PersonDetection | HandGestureDetection>;
  error: string | null;
  frameTimings: FrameTimings | null;
  isLoading: boolean;
  lastInferenceMs: number | null;
  modelStatus: string;
  status: string;
  onBackendChange: (value: DetectorBackendId) => void;
  onCameraChange: (value: string | null) => void;
  onDevCameraMultiplierChange: (value: number) => void;
  onCameraMirrorChange: (value: boolean) => void;
  onCameraPreviewChange: (value: boolean) => void;
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
  const { t } = useI18n();

  return (
    <span className="control-label">
      <span>{children}</span>
      <Tooltip label={help} multiline withArrow position="top" className="control-tooltip">
        <ActionIcon
          aria-label={t('controls.about', { label: children })}
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

function getYoloModelDescriptionKey(model: (typeof YOLO_MODELS)[number]): TranslationKey {
  if (model.label === 'YOLO26n') {
    return 'model.yolo26n.description';
  }
  if (model.label === 'YOLO26s') {
    return 'model.yolo26s.description';
  }
  if (model.label === 'YOLO26n-pose') {
    return 'model.yolo26n-pose.description';
  }
  return 'model.yolo26s-pose.description';
}

export function DetectionControls({
  task,
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
  onDevCameraMultiplierChange,
  onCameraMirrorChange,
  onCameraPreviewChange,
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
  const { language, setLanguage, t, tn } = useI18n();
  const availableQuantizations = getAvailableQuantizations(preferences.selectedModelId);
  const isPose = task === 'pose';
  const isYolo = isPose && preferences.selectedBackendId === 'yolo';
  const isPythonWebRtc = isPose && preferences.selectedBackendId === 'python-webrtc';
  const detectorCallLabel = task === 'gesture' ? t('timing.recognition') : t('timing.model');
  const preprocessLabel = task === 'gesture' ? t('timing.gestureSetup') : t('timing.preprocess');
  const postprocessLabel = task === 'gesture' ? t('timing.gestureDecode') : t('timing.postprocess');

  const languageOptions = LANGUAGES.map((item) => ({
    value: item.id,
    label: item.label,
  }));
  const backendOptions = (isPose ? POSE_BACKENDS : GESTURE_BACKENDS).map((backend) => ({
    value: backend.id,
    label: `${backend.label} · ${t(`backend.${backend.id}.description` as TranslationKey)}`,
  }));
  const yoloModelOptions = YOLO_MODELS.map((model) => ({
    value: model.id,
    label: `${model.label} · ${t(getYoloModelDescriptionKey(model))}`,
  }));
  const runtimeOptions = DETECTOR_RUNTIMES.map((runtime) => ({
    value: runtime.id,
    label: `${runtime.label} · ${t(`runtime.${runtime.id}.description` as TranslationKey)}`,
  }));
  const quantizationOptions = availableQuantizations.map((quantization) => {
    const option = getQuantizationOption(quantization.dtype);
    return {
      value: quantization.dtype,
      label: `${option.label} · ${t(`quantization.${option.id}.description` as TranslationKey)} · ${quantization.sizeMb} MB`,
    };
  });
  const mediaPipeModelOptions = MEDIAPIPE_MODELS.map((model) => ({
    value: model.id,
    label: `${model.label} · ${t(`mediapipe.${model.id}.description` as TranslationKey)}`,
  }));
  const mediaPipeDelegateOptions = MEDIAPIPE_DELEGATES.map((delegate) => ({
    value: delegate.id,
    label: `${delegate.label} · ${t(`delegate.${delegate.id.toLowerCase()}.description` as TranslationKey)}`,
  }));

  return (
    <>
      <div className="status-panel">
        <p className="eyebrow">{t('status.runState')}</p>
        <h2>{status}</h2>
        <p className="model-status">{modelStatus}</p>
        {lastInferenceMs !== null && <p className="latency">{t('status.inferenceMs', { ms: lastInferenceMs })}</p>}
      </div>

      {error && <p className="error-message">{error}</p>}

      <div className="quick-settings">
        <Select
          aria-label={t('language.label')}
          className="model-control"
          data={languageOptions}
          label={<HelpLabel help={t('language.help')}>{t('language.label')}</HelpLabel>}
          value={language}
          onChange={(value) => {
            if (value) {
              setLanguage(value);
            }
          }}
        />

        <Select
          aria-label={t('controls.camera')}
          className="model-control"
          data={cameraOptions}
          label={
            <HelpLabel help={t('controls.cameraHelp')}>{t('controls.camera')}</HelpLabel>
          }
          value={selectedCameraValue}
          onChange={onCameraChange}
        />

        <Switch
          checked={preferences.cameraMirrored}
          className="toggle-control"
          label={
            <HelpLabel help={t('controls.mirrorCameraHelp')}>{t('controls.mirrorCamera')}</HelpLabel>
          }
          onChange={(event) => onCameraMirrorChange(event.currentTarget.checked)}
        />

        <Switch
          checked={preferences.showCameraPreview}
          className="toggle-control"
          label={
            <HelpLabel help={t('controls.cameraPreviewHelp')}>{t('controls.cameraPreview')}</HelpLabel>
          }
          onChange={(event) => onCameraPreviewChange(event.currentTarget.checked)}
        />

        <div className="multiplier-control">
          <HelpLabel help={t('controls.cameraMultiplierHelp')}>{t('controls.cameraMultiplier')}</HelpLabel>
          <strong>{preferences.devCameraMultiplier === 1 ? t('controls.multiplierNone') : `${preferences.devCameraMultiplier}x`}</strong>
          <Slider
            thumbLabel={t('controls.cameraMultiplier')}
            min={1}
            max={4}
            step={1}
            value={preferences.devCameraMultiplier}
            onChange={onDevCameraMultiplierChange}
          />
        </div>

        <div className="player-count-control">
          <HelpLabel help={t('controls.playersHelp')}>{t('controls.players')}</HelpLabel>
          <strong>{preferences.playerCount}</strong>
          <Slider
            thumbLabel={t('controls.players')}
            min={MIN_PLAYERS}
            max={MAX_PLAYERS}
            step={1}
            value={preferences.playerCount}
            onChange={onPlayerCountChange}
          />
        </div>

        <div className="threshold-control">
          <HelpLabel help={t('controls.confidenceHelp')}>{t('controls.confidence')}</HelpLabel>
          <strong>{formatPercent(preferences.threshold)}</strong>
          <Slider
            thumbLabel={t('controls.confidence')}
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
          <Accordion.Control className="advanced-panel-summary">{t('controls.advancedTracking')}</Accordion.Control>
          <Accordion.Panel className="advanced-panel-content">
            <Select
              aria-label={t('controls.tracker')}
              className="model-control"
              data={backendOptions}
              disabled={isLoading}
              label={
                <HelpLabel help={t('controls.trackerHelp')}>{t('controls.tracker')}</HelpLabel>
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
                <HelpLabel help={t('controls.signalingUrlHelp')}>{t('controls.signalingUrl')}</HelpLabel>
                <code>{import.meta.env.VITE_POSE_TRACKER_SIGNALING_URL ?? 'ws://127.0.0.1:8765'}</code>
              </div>
            ) : isYolo ? (
              <>
                <Select
                  aria-label={t('controls.model')}
                  className="model-control"
                  data={yoloModelOptions}
                  disabled={isLoading}
                  label={
                    <HelpLabel help={t('controls.yoloModelHelp')}>{t('controls.model')}</HelpLabel>
                  }
                  value={preferences.selectedModelId}
                  onChange={(value) => {
                    if (value) {
                      onModelChange(value);
                    }
                  }}
                />

                <Select
                  aria-label={t('controls.runtime')}
                  className="model-control"
                  data={runtimeOptions}
                  disabled={isLoading}
                  label={
                    <HelpLabel help={t('controls.runtimeHelp')}>{t('controls.runtime')}</HelpLabel>
                  }
                  value={preferences.selectedRuntimeId}
                  onChange={(value) => {
                    if (value) {
                      onRuntimeChange(value);
                    }
                  }}
                />

                <Select
                  aria-label={t('controls.quantization')}
                  className="model-control"
                  data={quantizationOptions}
                  disabled={isLoading}
                  label={
                    <HelpLabel help={t('controls.quantizationHelp')}>{t('controls.quantization')}</HelpLabel>
                  }
                  value={preferences.selectedQuantizationId}
                  onChange={(value) => {
                    if (value) {
                      onQuantizationChange(value);
                    }
                  }}
                />
              </>
            ) : isPose ? (
              <>
                <Select
                  aria-label={t('controls.model')}
                  className="model-control"
                  data={mediaPipeModelOptions}
                  disabled={isLoading}
                  label={
                    <HelpLabel help={t('controls.mediaPipeModelHelp')}>{t('controls.model')}</HelpLabel>
                  }
                  value={preferences.selectedMediaPipeModelId}
                  onChange={(value) => {
                    if (value) {
                      onMediaPipeModelChange(value);
                    }
                  }}
                />

                <Select
                  aria-label={t('controls.delegate')}
                  className="model-control"
                  data={mediaPipeDelegateOptions}
                  disabled={isLoading}
                  label={
                    <HelpLabel help={t('controls.delegateHelp')}>{t('controls.delegate')}</HelpLabel>
                  }
                  value={preferences.selectedMediaPipeDelegateId}
                  onChange={(value) => {
                    if (value) {
                      onMediaPipeDelegateChange(value);
                    }
                  }}
                />
              </>
            ) : (
              <Select
                  aria-label={t('controls.delegate')}
                  className="model-control"
                  data={mediaPipeDelegateOptions}
                  disabled={isLoading}
                  label={
                    <HelpLabel help={t('controls.delegateHelp')}>{t('controls.delegate')}</HelpLabel>
                  }
                  value={preferences.selectedMediaPipeDelegateId}
                  onChange={(value) => {
                    if (value) {
                      onMediaPipeDelegateChange(value);
                    }
                  }}
                />
            )}
          </Accordion.Panel>
        </Accordion.Item>

      </Accordion>

      <div className="docs-entry">
        <div>
          <p className="eyebrow">{t('docs.eyebrow')}</p>
          <p>{t('docs.entryText')}</p>
        </div>
        <Button
          className="secondary-action"
          component="a"
          href="/docs/tracking-internals"
          rel="noreferrer"
          target="_blank"
          variant="default"
        >
          {t('docs.link')}
        </Button>
      </div>

      {frameTimings && (
        <Accordion className="settings-accordion timing-panel" variant="unstyled">
          <Accordion.Item className="advanced-panel" value="frame-timing">
            <Accordion.Control className="advanced-panel-summary">{t('timing.title')}</Accordion.Control>
            <Accordion.Panel className="advanced-panel-content">
              <dl aria-label={t('timing.breakdown')}>
                <div>
                  <dt>{t('timing.capture')}</dt>
                  <dd>{formatMs(frameTimings.captureMs)}</dd>
                </div>
                <div>
                  <dt>{t('timing.rawImage')}</dt>
                  <dd>{formatMs(frameTimings.rawImageMs)}</dd>
                </div>
                <div>
                  <dt>{preprocessLabel}</dt>
                  <dd>{formatMs(frameTimings.preprocessMs)}</dd>
                </div>
                <div>
                  <dt>{detectorCallLabel}</dt>
                  <dd>{formatMs(frameTimings.modelMs)}</dd>
                </div>
                <div>
                  <dt>{postprocessLabel}</dt>
                  <dd>{formatMs(frameTimings.postprocessMs)}</dd>
                </div>
                <div>
                  <dt>{t('timing.analysis')}</dt>
                  <dd>{formatMs(frameTimings.analysisMs)}</dd>
                </div>
                <div>
                  <dt>{t('timing.draw')}</dt>
                  <dd>{formatMs(frameTimings.drawMs)}</dd>
                </div>
                <div>
                  <dt>{t('timing.overhead')}</dt>
                  <dd>{formatMs(frameTimings.overheadMs)}</dd>
                </div>
                <div>
                  <dt>{t('timing.total')}</dt>
                  <dd>{formatMs(frameTimings.loopMs)}</dd>
                </div>
              </dl>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      )}

      <div className="detection-list" aria-live="polite">
        <p className="eyebrow">{t('people.title')}</p>
        {detections.length > 0 ? (
          <ul>
            {detections.slice(0, 8).map((detection, index) => (
              <li key={`${detection.label}-${index}-${Math.round(detection.score * 1000)}`}>
                <span>{t('people.person', { index: index + 1 })}</span>
                <strong>
                  {detection.keypoints?.length
                    ? tn('people.points', detection.keypoints.length)
                    : formatPercent(detection.score)}
                </strong>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{t('people.empty')}</p>
        )}
      </div>

      <Button className="control-action" type="button" onClick={onStopCamera} disabled={stopDisabled} variant="default">
        {t('controls.stopCamera')}
      </Button>
    </>
  );
}
