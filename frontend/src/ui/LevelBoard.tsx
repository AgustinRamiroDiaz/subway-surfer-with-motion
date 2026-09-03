import { Select, Slider, Switch } from '@mantine/core';
import type { ReactElement } from 'react';
import type { AppPreferences } from '../app/appPreferences';
import { useI18n } from '../app/i18n';
import { formatPercent } from '../formatters';
import { isHandRhythmDifficulty, type HandRhythmDifficulty } from '../game/handRhythmDifficulty';
import type { RunnerGameId } from '../game/gameTypes';
import { getGameDescriptor } from '../game/levelRegistry';
import { SONGS, type SongId } from '../game/songCatalog';
import { MAX_PLAYERS, MIN_PLAYERS } from '../motion-mapping/playerPositions';
import { ControlHelpLabel } from './detection-controls/ControlHelpLabel';
import { BoltIcon, CheckIcon, SlidersIcon, TargetIcon } from './icons';
import {
  isHandRhythmRendererId,
  type HandRhythmRendererId,
} from '../game/games/hand-rhythm/handRhythmRendererTypes';

type LevelBoardMetadata = {
  id: RunnerGameId;
  boardTitleKey: 'home.sidewaysTitle' | 'home.jumpDuckTitle' | 'home.handRhythmTitle';
  inputLabelKey: 'home.poseInput' | 'home.gestureInput';
  setupLabelKey: 'home.quickStart' | 'home.calibration';
  marker: string;
};

const LEVEL_BOARD_METADATA: readonly LevelBoardMetadata[] = [
  {
    id: 'sideways',
    boardTitleKey: 'home.sidewaysTitle',
    inputLabelKey: 'home.poseInput',
    setupLabelKey: 'home.quickStart',
    marker: '01',
  },
  {
    id: 'jump-duck',
    boardTitleKey: 'home.jumpDuckTitle',
    inputLabelKey: 'home.poseInput',
    setupLabelKey: 'home.calibration',
    marker: '02',
  },
  {
    id: 'hand-rhythm',
    boardTitleKey: 'home.handRhythmTitle',
    inputLabelKey: 'home.gestureInput',
    setupLabelKey: 'home.quickStart',
    marker: '03',
  },
] as const;

export function LevelBoard({
  disabled,
  isLoading,
  preferences,
  selectedGameId,
  startLabel,
  onSelectGame,
  onSelectSong,
  onStartRun,
  onPlayerCountChange,
  onHandRhythmDifficultyChange,
  onHandRhythmGridSizeChange,
  onHandRhythmDoubleTargetChanceChange,
  onHandRhythmFloorChange,
  onHandRhythmRendererChange,
}: {
  disabled: boolean;
  isLoading: boolean;
  preferences: AppPreferences;
  selectedGameId: RunnerGameId;
  startLabel: string;
  onSelectGame: (gameId: RunnerGameId) => void;
  onSelectSong: (songId: SongId) => void;
  onStartRun: () => void;
  onPlayerCountChange: (value: number) => void;
  onHandRhythmDifficultyChange: (value: HandRhythmDifficulty) => void;
  onHandRhythmGridSizeChange: (value: 2 | 3) => void;
  onHandRhythmDoubleTargetChanceChange: (value: number) => void;
  onHandRhythmFloorChange: (value: boolean) => void;
  onHandRhythmRendererChange: (value: HandRhythmRendererId) => void;
}): ReactElement {
  const { t } = useI18n();
  const selectedMetadata = LEVEL_BOARD_METADATA.find((item) => item.id === selectedGameId) ?? LEVEL_BOARD_METADATA[0];
  const isHandRhythm = getGameDescriptor(selectedGameId).detectorTask === 'gesture';
  const isJumpDuck = selectedGameId === 'jump-duck';

  return (
    <section className="home-board" aria-label={t('home.menu')}>
      <div className="home-board-header">
        <p className="eyebrow">{t('home.eyebrow')}</p>
        <h1>{t('home.title')}</h1>
      </div>

      <div className="level-card-grid" aria-label={t('game.modeSelector')}>
        {LEVEL_BOARD_METADATA.map((level) => {
          const selected = level.id === selectedGameId;
          return (
            <button
              key={level.id}
              type="button"
              className={`level-card level-card-${level.id}${selected ? ' selected' : ''}`}
              aria-label={t(getGameDescriptor(level.id).modeLabelKey)}
              aria-current={selected ? 'true' : undefined}
              aria-pressed={selected}
              onClick={() => onSelectGame(level.id)}
            >
              <span className="level-card-marker" aria-hidden="true">{level.marker}</span>
              {selected ? (
                <span className="level-card-check" role="img" aria-label={t('home.selected')}>
                  <CheckIcon />
                </span>
              ) : (
                <span className="level-card-tag" role="img" aria-label={t(level.setupLabelKey)}>
                  {level.setupLabelKey === 'home.quickStart' ? <BoltIcon /> : <TargetIcon />}
                </span>
              )}
              <span className="level-card-art" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              <span className="level-card-copy">
                <strong>{t(level.boardTitleKey)}</strong>
                <span className="level-card-kicker">{t(level.inputLabelKey)}</span>
              </span>
            </button>
          );
        })}
      </div>

      <section className="level-setup-panel" aria-label={t(selectedMetadata.boardTitleKey)}>
        <div className="level-setup-head">
          <span className="level-setup-icon" aria-hidden="true"><SlidersIcon /></span>
          <p className="level-setup-title">{t(selectedMetadata.boardTitleKey)}</p>
        </div>
        <div className="level-setup-grid">
          <div className="level-setting-tile">
            <div className="level-setting-row">
              <ControlHelpLabel help={t('controls.playersHelp')}>{t('controls.players')}</ControlHelpLabel>
              <strong>{preferences.playerCount}</strong>
            </div>
            <Slider
              thumbLabel={t('controls.players')}
              min={MIN_PLAYERS}
              max={MAX_PLAYERS}
              step={1}
              value={preferences.playerCount}
              onChange={onPlayerCountChange}
            />
          </div>

          <div className="level-setting-tile">
            <Select
              aria-label={t('controls.song')}
              className="model-control"
              data={SONGS.map((song) => ({ value: song.id, label: `${song.title} · ${song.artist}` }))}
              label={<ControlHelpLabel help={t('controls.songHelp')}>{t('controls.song')}</ControlHelpLabel>}
              value={preferences.selectedSongId}
              onChange={(value) => {
                if (SONGS.some((song) => song.id === value)) onSelectSong(value as SongId);
              }}
            />
          </div>

          {isHandRhythm && (
            <>
              <div className="level-setting-tile">
                <Select
                  aria-label={t('controls.handRhythmDifficulty')}
                  className="model-control"
                  data={[
                    { value: 'easy', label: t('controls.handRhythmDifficultyEasy') },
                    { value: 'medium', label: t('controls.handRhythmDifficultyMedium') },
                    { value: 'hard', label: t('controls.handRhythmDifficultyHard') },
                  ]}
                  label={<ControlHelpLabel help={t('controls.handRhythmDifficultyHelp')}>{t('controls.handRhythmDifficulty')}</ControlHelpLabel>}
                  value={preferences.handRhythmDifficulty}
                  onChange={(value) => {
                    if (isHandRhythmDifficulty(value)) {
                      onHandRhythmDifficultyChange(value);
                    }
                  }}
                />
              </div>
              <div className="level-setting-tile">
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
              </div>
              <div className="level-setting-tile">
                <Select
                  aria-label={t('controls.handRhythmRenderer')}
                  className="model-control"
                  data={[
                    { value: 'three', label: t('controls.handRhythmRendererThree') },
                    { value: 'canvas2d', label: t('controls.handRhythmRendererCanvas2d') },
                  ]}
                  label={<ControlHelpLabel help={t('controls.handRhythmRendererHelp')}>{t('controls.handRhythmRenderer')}</ControlHelpLabel>}
                  value={preferences.handRhythmRenderer}
                  onChange={(value) => {
                    if (isHandRhythmRendererId(value)) onHandRhythmRendererChange(value);
                  }}
                />
              </div>
              <div className="level-setting-tile">
                <Switch
                  checked={preferences.showHandRhythmFloor}
                  className="toggle-control"
                  label={<ControlHelpLabel help={t('controls.handRhythmFloorHelp')}>{t('controls.handRhythmFloor')}</ControlHelpLabel>}
                  onChange={(event) => onHandRhythmFloorChange(event.currentTarget.checked)}
                />
              </div>
              <div className="level-setting-tile">
                <div className="level-setting-row">
                  <ControlHelpLabel help={t('controls.handRhythmDoubleTargetChanceHelp')}>{t('controls.handRhythmDoubleTargetChance')}</ControlHelpLabel>
                  <strong>{formatPercent(preferences.handRhythmDoubleTargetChance)}</strong>
                </div>
                <Slider
                  thumbLabel={t('controls.handRhythmDoubleTargetChance')}
                  min={0}
                  max={1}
                  step={0.05}
                  value={preferences.handRhythmDoubleTargetChance}
                  label={(value) => formatPercent(value)}
                  onChange={onHandRhythmDoubleTargetChanceChange}
                />
              </div>
            </>
          )}

          {isJumpDuck && (
            <div className="level-info-tile">
              <TargetIcon />
              {t('home.autoCalibrate')}
            </div>
          )}
        </div>
      </section>

      <div className="home-board-actions">
        <button
          className="primary-action"
          type="button"
          disabled={disabled}
          onClick={onStartRun}
        >
          {isLoading ? t('app.loadingModel') : startLabel}
        </button>
      </div>
    </section>
  );
}
