import { Button } from '@mantine/core';
import type { ReactElement } from 'react';
import type { AppPreferences } from '../app/appPreferences';
import { useI18n } from '../app/i18n';
import type { CameraControlOption } from '../hooks/useCameraController';
import type { FrameTimings } from '../hooks/motionDetectorTypes';
import type {
  DetectorBackendId,
  DetectorQuantizationId,
  DetectorRuntimeId,
  DetectorTask,
  HandGestureDetection,
  MediaPipeDelegateId,
  MediaPipeModelId,
  PersonDetection,
  YoloModelId,
} from '../pose-detection/aiDetector';
import { AdvancedDetectorSettings } from './detection-controls/AdvancedDetectorSettings';
import { DetectionDiagnostics } from './detection-controls/DetectionDiagnostics';
import { QuickDetectionSettings } from './detection-controls/QuickDetectionSettings';

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
  onDetectionOverlayChange: (value: boolean) => void;
  onMediaPipeDelegateChange: (value: MediaPipeDelegateId) => void;
  onMediaPipeModelChange: (value: MediaPipeModelId) => void;
  onModelChange: (value: YoloModelId) => void;
  onPlayerCountChange: (value: number) => void;
  onHandRhythmGridSizeChange: (value: 2 | 3) => void;
  onQuantizationChange: (value: DetectorQuantizationId) => void;
  onRuntimeChange: (value: DetectorRuntimeId) => void;
  onStopCamera: () => void;
  onThresholdChange: (value: number) => void;
  stopDisabled: boolean;
};

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
  onDetectionOverlayChange,
  onMediaPipeDelegateChange,
  onMediaPipeModelChange,
  onModelChange,
  onPlayerCountChange,
  onHandRhythmGridSizeChange,
  onQuantizationChange,
  onRuntimeChange,
  onStopCamera,
  onThresholdChange,
  stopDisabled,
}: DetectionControlsProps): ReactElement {
  const { t } = useI18n();

  return (
    <>
      <div className="status-panel">
        <p className="eyebrow">{t('status.runState')}</p>
        <h2>{status}</h2>
        <p className="model-status">{modelStatus}</p>
        {lastInferenceMs !== null && (
          <p className="latency">{t('status.inferenceMs', { ms: lastInferenceMs })}</p>
        )}
      </div>
      {error && <p className="error-message">{error}</p>}
      <QuickDetectionSettings
        task={task}
        preferences={preferences}
        cameraOptions={cameraOptions}
        selectedCameraValue={selectedCameraValue}
        onCameraChange={onCameraChange}
        onDevCameraMultiplierChange={onDevCameraMultiplierChange}
        onCameraMirrorChange={onCameraMirrorChange}
        onCameraPreviewChange={onCameraPreviewChange}
        onDetectionOverlayChange={onDetectionOverlayChange}
        onPlayerCountChange={onPlayerCountChange}
        onHandRhythmGridSizeChange={onHandRhythmGridSizeChange}
        onThresholdChange={onThresholdChange}
      />
      <AdvancedDetectorSettings
        task={task}
        preferences={preferences}
        isLoading={isLoading}
        onBackendChange={onBackendChange}
        onMediaPipeDelegateChange={onMediaPipeDelegateChange}
        onMediaPipeModelChange={onMediaPipeModelChange}
        onModelChange={onModelChange}
        onQuantizationChange={onQuantizationChange}
        onRuntimeChange={onRuntimeChange}
      />
      <div className="docs-entry">
        <div>
          <p className="eyebrow">{t('docs.eyebrow')}</p>
          <p>{t('docs.entryText')}</p>
        </div>
        <Button className="secondary-action" component="a" href="/docs/tracking-internals" rel="noreferrer" target="_blank" variant="default">
          {t('docs.link')}
        </Button>
      </div>
      <DetectionDiagnostics task={task} detections={detections} frameTimings={frameTimings} />
      <Button className="control-action" type="button" onClick={onStopCamera} disabled={stopDisabled} variant="default">
        {t('controls.stopCamera')}
      </Button>
    </>
  );
}
