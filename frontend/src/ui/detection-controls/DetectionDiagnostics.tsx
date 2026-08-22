import { Accordion } from '@mantine/core';
import type { ReactElement } from 'react';
import { useI18n } from '../../app/i18n';
import { formatMs, formatPercent } from '../../formatters';
import type { FrameTimings } from '../../hooks/motionDetectorTypes';
import type {
  DetectorTask,
  HandGestureDetection,
  PersonDetection,
} from '../../pose-detection/aiDetector';

type DetectionDiagnosticsProps = {
  task: DetectorTask;
  detections: Array<PersonDetection | HandGestureDetection>;
  frameTimings: FrameTimings | null;
};

export function DetectionDiagnostics({
  task,
  detections,
  frameTimings,
}: DetectionDiagnosticsProps): ReactElement {
  const { t, tn } = useI18n();
  const detectorCallLabel = task === 'gesture' ? t('timing.recognition') : t('timing.model');
  const preprocessLabel = task === 'gesture' ? t('timing.gestureSetup') : t('timing.preprocess');
  const postprocessLabel = task === 'gesture' ? t('timing.gestureDecode') : t('timing.postprocess');

  return (
    <>
      {frameTimings && (
        <Accordion className="settings-accordion timing-panel" variant="unstyled">
          <Accordion.Item className="advanced-panel" value="frame-timing">
            <Accordion.Control className="advanced-panel-summary">{t('timing.title')}</Accordion.Control>
            <Accordion.Panel className="advanced-panel-content">
              <dl aria-label={t('timing.breakdown')}>
                <div><dt>{t('timing.capture')}</dt><dd>{formatMs(frameTimings.captureMs)}</dd></div>
                <div><dt>{t('timing.rawImage')}</dt><dd>{formatMs(frameTimings.rawImageMs)}</dd></div>
                <div><dt>{preprocessLabel}</dt><dd>{formatMs(frameTimings.preprocessMs)}</dd></div>
                <div><dt>{detectorCallLabel}</dt><dd>{formatMs(frameTimings.modelMs)}</dd></div>
                <div><dt>{postprocessLabel}</dt><dd>{formatMs(frameTimings.postprocessMs)}</dd></div>
                <div><dt>{t('timing.analysis')}</dt><dd>{formatMs(frameTimings.analysisMs)}</dd></div>
                <div><dt>{t('timing.draw')}</dt><dd>{formatMs(frameTimings.drawMs)}</dd></div>
                <div><dt>{t('timing.overhead')}</dt><dd>{formatMs(frameTimings.overheadMs)}</dd></div>
                <div><dt>{t('timing.total')}</dt><dd>{formatMs(frameTimings.loopMs)}</dd></div>
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
        ) : <p className="muted">{t('people.empty')}</p>}
      </div>
    </>
  );
}
