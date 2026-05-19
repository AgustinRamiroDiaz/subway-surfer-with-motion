import { type DetectorLoadOptions, type DetectorLoadResult } from './aiDetector';
import { loadYoloDetectorWorker, type WorkerDetectorLoadResult } from './detectorWorkerClient';
import {
  loadPythonWebSocketDetector,
  type PythonWebSocketDetectorLoadResult,
} from './pythonWebSocketDetectorClient';

export type ClientDetectorLoadResult =
  | WorkerDetectorLoadResult
  | PythonWebSocketDetectorLoadResult
  | DetectorLoadResult;

export function loadDetectorClient(options: DetectorLoadOptions): Promise<ClientDetectorLoadResult> {
  if (options.backend === 'python-websocket') {
    return loadPythonWebSocketDetector(options);
  }

  return loadYoloDetectorWorker(options);
}
