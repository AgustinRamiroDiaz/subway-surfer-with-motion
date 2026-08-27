import { Select, Slider, Switch } from '@mantine/core';
import type { ReactElement } from 'react';
import type { AppPreferences } from '../../app/appPreferences';
import { LANGUAGES, useI18n } from '../../app/i18n';
import type { CameraControlOption } from '../../hooks/useCameraController';
import { formatPercent } from '../../formatters';
import { ControlHelpLabel } from './ControlHelpLabel';
import {
  GAME_RENDER_FPS_STEP,
  MAX_GAME_RENDER_FPS,
  MIN_GAME_RENDER_FPS,
} from '../../game/shared/renderFrameLimiter';

type QuickDetectionSettingsProps = {
  preferences: AppPreferences;
  cameraOptions: CameraControlOption[];
  selectedCameraValue: string;
  onCameraChange: (value: string | null) => void;
  onDevCameraMultiplierChange: (value: number) => void;
  onCameraMirrorChange: (value: boolean) => void;
  onCameraPreviewChange: (value: boolean) => void;
  onDetectionOverlayChange: (value: boolean) => void;
  onGameRenderFpsChange: (value: number) => void;
  onThresholdChange: (value: number) => void;
};

export function QuickDetectionSettings({
  preferences,
  cameraOptions,
  selectedCameraValue,
  onCameraChange,
  onDevCameraMultiplierChange,
  onCameraMirrorChange,
  onCameraPreviewChange,
  onDetectionOverlayChange,
  onGameRenderFpsChange,
  onThresholdChange,
}: QuickDetectionSettingsProps): ReactElement {
  const { language, setLanguage, t } = useI18n();
  const languageOptions = LANGUAGES.map((item) => ({ value: item.id, label: item.label }));

  return (
    <div className="quick-settings">
      <p className="eyebrow">{t('controls.cameraTrackingTitle')}</p>
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
      <fieldset className="overlay-settings">
        <legend>{t('controls.overlayGroup')}</legend>
        <Switch
          checked={preferences.cameraPreviewVisibility[preferences.selectedRunnerGameId]}
          className="toggle-control"
          label={<ControlHelpLabel help={t('controls.cameraPreviewHelp')}>{t('controls.cameraPreview')}</ControlHelpLabel>}
          onChange={(event) => onCameraPreviewChange(event.currentTarget.checked)}
        />
        <Switch
          checked={preferences.detectionOverlayVisibility[preferences.selectedRunnerGameId]}
          className="toggle-control"
          label={<ControlHelpLabel help={t('controls.detectionOverlayHelp')}>{t('controls.detectionOverlay')}</ControlHelpLabel>}
          onChange={(event) => onDetectionOverlayChange(event.currentTarget.checked)}
        />
        <Switch
          checked={preferences.cameraMirrored}
          className="toggle-control"
          label={<ControlHelpLabel help={t('controls.mirrorCameraHelp')}>{t('controls.mirrorCamera')}</ControlHelpLabel>}
          onChange={(event) => onCameraMirrorChange(event.currentTarget.checked)}
        />
      </fieldset>
      <div className="multiplier-control">
        <ControlHelpLabel help={t('controls.cameraMultiplierHelp')}>{t('controls.cameraMultiplier')}</ControlHelpLabel>
        <strong>{preferences.devCameraMultiplier === 1 ? t('controls.multiplierNone') : `${preferences.devCameraMultiplier}x`}</strong>
        <Slider thumbLabel={t('controls.cameraMultiplier')} min={1} max={4} step={1} value={preferences.devCameraMultiplier} onChange={onDevCameraMultiplierChange} />
      </div>
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
      <div className="render-fps-control">
        <ControlHelpLabel help={t('controls.renderFpsHelp')}>{t('controls.renderFps')}</ControlHelpLabel>
        <strong>{t('controls.renderFpsValue', { fps: preferences.gameRenderFps })}</strong>
        <Slider
          thumbLabel={t('controls.renderFps')}
          min={MIN_GAME_RENDER_FPS}
          max={MAX_GAME_RENDER_FPS}
          step={GAME_RENDER_FPS_STEP}
          value={preferences.gameRenderFps}
          label={(value) => t('controls.renderFpsValue', { fps: value })}
          onChange={onGameRenderFpsChange}
        />
      </div>
    </div>
  );
}
