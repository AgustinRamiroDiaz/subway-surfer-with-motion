import { type DetectorLoadOptions, type DetectorLoadResult } from './aiDetector';
import { loadYoloDetectorWorker, type WorkerDetectorLoadResult } from '../workers/detectorWorkerClient';
import { loadPythonWebRtcDetector, type PythonWebRtcDetectorLoadResult } from './pythonWebRtcDetectorClient';

export type ClientDetectorLoadResult =
  | WorkerDetectorLoadResult
  | PythonWebRtcDetectorLoadResult
  | DetectorLoadResult;

export function loadDetectorClient(options: DetectorLoadOptions): Promise<ClientDetectorLoadResult> {
  if (options.backend === 'python-webrtc') {
    return loadPythonWebRtcDetector(options);
  }

  return loadYoloDetectorWorker(options);
}
