import type { ReactElement, RefObject } from 'react';

type CameraFeedbackPanelProps = {
  cameraEnabled: boolean;
  cameraMirrored: boolean;
  playerPositions: number[];
  selectedTrackerLabel: string;
  videoRef: RefObject<HTMLVideoElement | null>;
  overlayRef: RefObject<HTMLCanvasElement | null>;
  frameRef: RefObject<HTMLCanvasElement | null>;
  onLoadedMetadata: () => void;
};

export function CameraFeedbackPanel({
  cameraEnabled,
  cameraMirrored,
  playerPositions,
  selectedTrackerLabel,
  videoRef,
  overlayRef,
  frameRef,
  onLoadedMetadata,
}: CameraFeedbackPanelProps): ReactElement {
  return (
    <section className="video-stage sidebar-camera" aria-label="Camera feedback">
      <div className="sidebar-camera-label">
        <p className="eyebrow">Camera</p>
        <strong>{selectedTrackerLabel}</strong>
      </div>
      <video
        ref={videoRef}
        className={`camera-video${cameraMirrored ? ' mirrored-media' : ''}`}
        muted
        playsInline
        onLoadedMetadata={onLoadedMetadata}
      />
      <div className="camera-position-guides" aria-hidden="true">
        <div className="camera-center-line" />
        {playerPositions.map((playerPosition, index) => (
          <div
            className={`camera-position-marker player-${index + 1}`}
            key={`player-marker-${index + 1}`}
            style={{ left: `${playerPosition * 100}%` }}
          />
        ))}
      </div>
      <canvas
        ref={overlayRef}
        className={`detection-overlay${cameraMirrored ? ' mirrored-media' : ''}`}
        aria-hidden="true"
      />
      <canvas ref={frameRef} className="frame-buffer" aria-hidden="true" />

      {!cameraEnabled && (
        <div className="camera-empty-state">
          <p>Camera off</p>
        </div>
      )}
    </section>
  );
}
