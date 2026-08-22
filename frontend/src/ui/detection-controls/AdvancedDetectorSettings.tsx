import { Accordion, Select } from '@mantine/core';
import type { ReactElement } from 'react';
import type { AppPreferences } from '../../app/appPreferences';
import { type TranslationKey, useI18n } from '../../app/i18n';
import {
  DETECTOR_RUNTIMES,
  GESTURE_BACKENDS,
  MEDIAPIPE_DELEGATES,
  MEDIAPIPE_MODELS,
  POSE_BACKENDS,
  YOLO_MODELS,
  getAvailableQuantizations,
  getQuantizationOption,
  type DetectorBackendId,
  type DetectorQuantizationId,
  type DetectorRuntimeId,
  type DetectorTask,
  type MediaPipeDelegateId,
  type MediaPipeModelId,
  type YoloModelId,
} from '../../pose-detection/aiDetector';
import { ControlHelpLabel } from './ControlHelpLabel';

type AdvancedDetectorSettingsProps = {
  task: DetectorTask;
  preferences: AppPreferences;
  isLoading: boolean;
  onBackendChange: (value: DetectorBackendId) => void;
  onMediaPipeDelegateChange: (value: MediaPipeDelegateId) => void;
  onMediaPipeModelChange: (value: MediaPipeModelId) => void;
  onModelChange: (value: YoloModelId) => void;
  onQuantizationChange: (value: DetectorQuantizationId) => void;
  onRuntimeChange: (value: DetectorRuntimeId) => void;
};

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

export function AdvancedDetectorSettings({
  task,
  preferences,
  isLoading,
  onBackendChange,
  onMediaPipeDelegateChange,
  onMediaPipeModelChange,
  onModelChange,
  onQuantizationChange,
  onRuntimeChange,
}: AdvancedDetectorSettingsProps): ReactElement {
  const { t } = useI18n();
  const isPose = task === 'pose';
  const isYolo = isPose && preferences.selectedBackendId === 'yolo';
  const isPythonWebRtc = isPose && preferences.selectedBackendId === 'python-webrtc';
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
  const quantizationOptions = getAvailableQuantizations(preferences.selectedModelId).map((quantization) => {
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
  const delegateSelect = (
    <Select
      aria-label={t('controls.delegate')}
      className="model-control"
      data={mediaPipeDelegateOptions}
      disabled={isLoading}
      label={<ControlHelpLabel help={t('controls.delegateHelp')}>{t('controls.delegate')}</ControlHelpLabel>}
      value={preferences.selectedMediaPipeDelegateId}
      onChange={(value) => {
        if (value) {
          onMediaPipeDelegateChange(value);
        }
      }}
    />
  );

  return (
    <Accordion className="settings-accordion" multiple variant="unstyled">
      <Accordion.Item className="advanced-panel" value="advanced-tracking">
        <Accordion.Control className="advanced-panel-summary">{t('controls.advancedTracking')}</Accordion.Control>
        <Accordion.Panel className="advanced-panel-content">
          <Select
            aria-label={t('controls.tracker')}
            className="model-control"
            data={backendOptions}
            disabled={isLoading}
            label={<ControlHelpLabel help={t('controls.trackerHelp')}>{t('controls.tracker')}</ControlHelpLabel>}
            value={preferences.selectedBackendId}
            onChange={(value) => {
              if (value) {
                onBackendChange(value);
              }
            }}
          />
          {isPythonWebRtc ? (
            <div className="connection-note">
              <ControlHelpLabel help={t('controls.signalingUrlHelp')}>{t('controls.signalingUrl')}</ControlHelpLabel>
              <code>{import.meta.env.VITE_POSE_TRACKER_SIGNALING_URL ?? 'ws://127.0.0.1:8765'}</code>
            </div>
          ) : isYolo ? (
            <>
              <Select
                aria-label={t('controls.model')}
                className="model-control"
                data={yoloModelOptions}
                disabled={isLoading}
                label={<ControlHelpLabel help={t('controls.yoloModelHelp')}>{t('controls.model')}</ControlHelpLabel>}
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
                label={<ControlHelpLabel help={t('controls.runtimeHelp')}>{t('controls.runtime')}</ControlHelpLabel>}
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
                label={<ControlHelpLabel help={t('controls.quantizationHelp')}>{t('controls.quantization')}</ControlHelpLabel>}
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
                label={<ControlHelpLabel help={t('controls.mediaPipeModelHelp')}>{t('controls.model')}</ControlHelpLabel>}
                value={preferences.selectedMediaPipeModelId}
                onChange={(value) => {
                  if (value) {
                    onMediaPipeModelChange(value);
                  }
                }}
              />
              {delegateSelect}
            </>
          ) : delegateSelect}
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}
