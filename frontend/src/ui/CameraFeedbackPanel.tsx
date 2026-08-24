import type { ReactElement, RefObject } from 'react';
import type { JumpDuckGuide } from '../motion-mapping/jumpDuckActions';
import type { HandRhythmGridSize } from '../game/levels/handRhythmLevel';
import type { WorldProjection } from '../game/shared/worldProjection';
import { useI18n } from '../app/i18n';

type CameraFeedbackPanelProps = {
  cameraEnabled: boolean;
  cameraMirrored: boolean;
  showCameraPreview: boolean;
  showDetectionOverlay: boolean;
  jumpDuckGuides: JumpDuckGuide[];
  handRhythmGridSize: HandRhythmGridSize;
  showHandRhythmGrid: boolean;
  playerPositions: number[];
  selectedTrackerLabel: string;
  videoRef: RefObject<HTMLVideoElement | null>;
  overlayRef: RefObject<HTMLCanvasElement | null>;
  frameRef: RefObject<HTMLCanvasElement | null>;
  onLoadedMetadata: () => void;
  presentation?: 'sidebar' | 'game-overlay';
  renderInWorld?: boolean;
  worldProjection?: WorldProjection | null;
};

export function CameraFeedbackPanel({
  cameraEnabled,
  cameraMirrored,
  showCameraPreview,
  showDetectionOverlay,
  jumpDuckGuides,
  handRhythmGridSize,
  showHandRhythmGrid,
  playerPositions,
  selectedTrackerLabel,
  videoRef,
  overlayRef,
  frameRef,
  onLoadedMetadata,
  presentation = 'sidebar',
  renderInWorld = false,
  worldProjection = null,
}: CameraFeedbackPanelProps): ReactElement {
  const { t } = useI18n();
  const videoHeight = videoRef.current?.videoHeight ?? 0;
  const videoWidth = videoRef.current?.videoWidth ?? 0;

  const getGuideTop = (y: number): string => {
    if (!videoHeight) {
      return '0%';
    }

    return `${Math.max(0, Math.min(1, y / videoHeight)) * 100}%`;
  };

  const getGuideLeft = (playerIndex: number): string => {
    const playerPosition = playerPositions[playerIndex] ?? 0.5;
    return `${Math.max(0, Math.min(1, playerPosition)) * 100}%`;
  };

  const getGuideX = (x: number): string => {
    if (!videoWidth) {
      return '0%';
    }

    return `${Math.max(0, Math.min(1, x / videoWidth)) * 100}%`;
  };

  const projectionStyle = presentation === 'game-overlay' && worldProjection && !renderInWorld
    ? {
        bottom: `${(1 - worldProjection.bottom) * 100}%`,
        left: `${worldProjection.left * 100}%`,
        right: `${(1 - worldProjection.right) * 100}%`,
        top: `${worldProjection.top * 100}%`,
      }
    : undefined;

  return (
    <section
      className={`video-stage camera-feedback ${presentation === 'game-overlay' ? 'in-game-camera' : 'sidebar-camera'}${renderInWorld ? ' world-texture-source' : ''}${showCameraPreview ? '' : ' camera-overlay-hidden'}${showCameraPreview || showDetectionOverlay ? '' : ' preview-hidden'}`}
      aria-label={t('camera.feedback')}
      style={projectionStyle}
    >
      <div className={`sidebar-camera-label${showHandRhythmGrid ? ' rhythm-camera-label-hidden' : ''}`}>
        <p className="eyebrow">{t('camera.title')}</p>
        <strong>{selectedTrackerLabel}</strong>
      </div>
      <video
        ref={videoRef}
        className={`camera-video${cameraMirrored ? ' mirrored-media' : ''}`}
        muted
        playsInline
        onLoadedMetadata={onLoadedMetadata}
      />
      {showDetectionOverlay && (
      <div className="camera-position-guides" aria-hidden="true">
        <div
          className="camera-player-sections"
          style={{ gridTemplateColumns: `repeat(${Math.max(1, playerPositions.length)}, minmax(0, 1fr))` }}
        >
          {playerPositions.map((_, index) => (
            <div className={`camera-player-section player-${index + 1}`} key={`player-section-${index + 1}`}>
              {showHandRhythmGrid && (
                <div
                  className="camera-hand-grid"
                  data-testid="camera-hand-grid"
                  style={{
                    gridTemplateColumns: `repeat(${handRhythmGridSize}, minmax(0, 1fr))`,
                    gridTemplateRows: `repeat(${handRhythmGridSize}, minmax(0, 1fr))`,
                  }}
                >
                  {Array.from({ length: handRhythmGridSize * handRhythmGridSize }, (_, cellIndex) => (
                    <span className="camera-hand-grid-cell" key={`hand-grid-cell-${index}-${cellIndex}`} />
                  ))}
                </div>
              )}
              <span>{`P${index + 1}`}</span>
            </div>
          ))}
        </div>
        {!showHandRhythmGrid && (
          <>
            <div className="camera-center-line" />
            {playerPositions.map((playerPosition, index) => (
              <div
                className={`camera-position-marker player-${index + 1}`}
                data-testid="camera-position-marker"
                key={`player-marker-${index + 1}`}
                style={{ left: `${playerPosition * 100}%` }}
              />
            ))}
          </>
        )}
        {jumpDuckGuides.map((guide) => (
          <div className={`camera-height-guides player-${guide.playerIndex + 1}`} key={`height-guide-${guide.playerIndex}`}>
            <div
              className="camera-height-guide jump"
              style={{ left: getGuideLeft(guide.playerIndex), top: getGuideTop(guide.jumpY) }}
            />
            <div
              className="camera-height-guide duck"
              style={{ left: getGuideLeft(guide.playerIndex), top: getGuideTop(guide.duckY) }}
            />
            <div
              className="camera-side-guide left"
              style={{ left: getGuideX(guide.leftX), top: getGuideTop((guide.jumpY + guide.duckY) / 2) }}
            />
            <div
              className="camera-side-guide right"
              style={{ left: getGuideX(guide.rightX), top: getGuideTop((guide.jumpY + guide.duckY) / 2) }}
            />
          </div>
        ))}
      </div>
      )}
      {showDetectionOverlay && (
      <canvas
        ref={overlayRef}
        className={`detection-overlay${cameraMirrored ? ' mirrored-media' : ''}`}
        aria-hidden="true"
      />
      )}
      <canvas ref={frameRef} className="frame-buffer" aria-hidden="true" />

      {!cameraEnabled && showCameraPreview && (
        <div className="camera-empty-state">
          <p>{t('camera.off')}</p>
        </div>
      )}
    </section>
  );
}
