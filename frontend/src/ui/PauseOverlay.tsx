import type { ReactElement } from 'react';
import { useI18n } from '../app/i18n';
import { PlayIcon, PowerIcon, SwapIcon } from './icons';

export function PauseOverlay({
  isLoading,
  onResume,
  onChangeLevel,
  onExit,
}: {
  isLoading: boolean;
  onResume: () => void;
  onChangeLevel: () => void;
  onExit: () => void;
}): ReactElement {
  const { t } = useI18n();

  return (
    <div className="pause-overlay" role="presentation">
      <div
        className="pause-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t('game.paused')}
      >
        <div className="pause-modal-head">
          <p className="eyebrow">{t('game.paused')}</p>
          <h2>{t('game.pausedTitle')}</h2>
          <p>{t('game.pausedBody')}</p>
        </div>
        <div className="pause-action-list">
          <button type="button" className="pause-action primary" disabled={isLoading} onClick={onResume}>
            <span className="pause-action-icon" aria-hidden="true"><PlayIcon /></span>
            <span className="pause-action-copy">
              <strong>{isLoading ? t('app.loadingModel') : t('game.resume')}</strong>
              <span>{t('game.resumeHelp')}</span>
            </span>
          </button>
          <button type="button" className="pause-action" onClick={onChangeLevel}>
            <span className="pause-action-icon" aria-hidden="true"><SwapIcon /></span>
            <span className="pause-action-copy">
              <strong>{t('game.changeLevel')}</strong>
              <span>{t('game.changeLevelHelp')}</span>
            </span>
          </button>
          <button type="button" className="pause-action danger" onClick={onExit}>
            <span className="pause-action-icon" aria-hidden="true"><PowerIcon /></span>
            <span className="pause-action-copy">
              <strong>{t('game.exitStopCamera')}</strong>
              <span>{t('game.exitStopCameraHelp')}</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
