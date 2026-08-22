import { Select, Slider, Switch } from '@mantine/core';
import type { ReactElement } from 'react';
import type { AppPreferences } from '../../app/appPreferences';
import { LANGUAGES, useI18n } from '../../app/i18n';
import { formatPercent } from '../../formatters';
import type { CameraControlOption } from '../../hooks/useCameraController';
import { MAX_PLAYERS, MIN_PLAYERS } from '../../motion-mapping/playerPositions';
import type { DetectorTask } from '../../pose-detection/aiDetector';
import { ControlHelpLabel } from './ControlHelpLabel';

type QuickDetectionSettingsProps = {
  task: DetectorTask;
  preferences: AppPreferences;
  cameraOptions: CameraControlOption[];
  selectedCameraValue: string;
  onCameraChange: (value: string | null) => void;
  onDevCameraMultiplierChange: (value: number) => void;
  onCameraMirrorChange: (value: boolean) => void;
  onCameraPreviewChange: (value: boolean) => void;
  onPlayerCountChange: (value: number) => void;
  onHandRhythmGridSizeChange: (value: 2 | 3) => void;
  onThresholdChange: (value: number) => void;
};

export function QuickDetectionSettings({
  task,
  preferences,
  cameraOptions,
  selectedCameraValue,
  onCameraChange,
  onDevCameraMultiplierChange,
  onCameraMirrorChange,
  onCameraPreviewChange,
  onPlayerCountChange,
  onHandRhythmGridSizeChange,
  onThresholdChange,
}: QuickDetectionSettingsProps): ReactElement {
  const { language, setLanguage, t } = useI18n();
  const languageOptions = LANGUAGES.map((item) => ({ value: item.id, label: item.label }));

  return (
    <div className="quick-settings">
      <Select
        aria-label={t('language.label')}
        className="model-control"
        data={languageOptions}
        label={<ControlHelpLabel help={t('language.help')}>{t('language.label')}</ControlHelpLabel>}
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
        label={<ControlHelpLabel help={t('controls.cameraHelp')}>{t('controls.camera')}</ControlHelpLabel>}
        value={selectedCameraValue}
        onChange={onCameraChange}
      />
      <Switch
        checked={preferences.cameraMirrored}
        className="toggle-control"
        label={<ControlHelpLabel help={t('controls.mirrorCameraHelp')}>{t('controls.mirrorCamera')}</ControlHelpLabel>}
        onChange={(event) => onCameraMirrorChange(event.currentTarget.checked)}
      />
      <Switch
        checked={preferences.showCameraPreview}
        className="toggle-control"
        label={<ControlHelpLabel help={t('controls.cameraPreviewHelp')}>{t('controls.cameraPreview')}</ControlHelpLabel>}
        onChange={(event) => onCameraPreviewChange(event.currentTarget.checked)}
      />
      <div className="multiplier-control">
        <ControlHelpLabel help={t('controls.cameraMultiplierHelp')}>{t('controls.cameraMultiplier')}</ControlHelpLabel>
        <strong>{preferences.devCameraMultiplier === 1 ? t('controls.multiplierNone') : `${preferences.devCameraMultiplier}x`}</strong>
        <Slider thumbLabel={t('controls.cameraMultiplier')} min={1} max={4} step={1} value={preferences.devCameraMultiplier} onChange={onDevCameraMultiplierChange} />
      </div>
      <div className="player-count-control">
        <ControlHelpLabel help={t('controls.playersHelp')}>{t('controls.players')}</ControlHelpLabel>
        <strong>{preferences.playerCount}</strong>
        <Slider thumbLabel={t('controls.players')} min={MIN_PLAYERS} max={MAX_PLAYERS} step={1} value={preferences.playerCount} onChange={onPlayerCountChange} />
      </div>
      {task === 'gesture' && (
        <Select
          aria-label={t('controls.handRhythmGrid')}
          className="model-control"
          data={[
            { value: '2', label: t('controls.handRhythmGrid2') },
            { value: '3', label: t('controls.handRhythmGrid3') },
          ]}
          label={<ControlHelpLabel help={t('controls.handRhythmGridHelp')}>{t('controls.handRhythmGrid')}</ControlHelpLabel>}
          value={String(preferences.handRhythmGridSize)}
          onChange={(value) => {
            if (value === '2' || value === '3') {
              onHandRhythmGridSizeChange(Number(value) as 2 | 3);
            }
          }}
        />
      )}
      <div className="threshold-control">
        <ControlHelpLabel help={t('controls.confidenceHelp')}>{t('controls.confidence')}</ControlHelpLabel>
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
  );
}
