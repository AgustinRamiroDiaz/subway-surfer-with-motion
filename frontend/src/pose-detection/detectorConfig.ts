import type {
  CameraFrameImage,
  ModelPrediction,
  ModelPredictionService,
  ModelPredictionTimings,
} from './detectionSchema';

export const DETECTOR_QUANTIZATIONS = [
  { id: 'fp16', label: 'FP16', description: 'WebGPU half precision' },
  { id: 'uint8', label: 'UINT8', description: 'Fast WASM quantized' },
  { id: 'int8', label: 'INT8', description: 'Signed 8-bit quantized' },
  { id: 'q8', label: 'Q8', description: 'Legacy 8-bit quantized' },
  { id: 'q4f16', label: 'Q4F16', description: '4-bit weights with FP16 tensors' },
  { id: 'q4', label: 'Q4', description: '4-bit quantized' },
  { id: 'bnb4', label: 'BNB4', description: 'BitsAndBytes 4-bit' },
] as const;

export type DetectorQuantizationId = (typeof DETECTOR_QUANTIZATIONS)[number]['id'];

export type QuantizedModelFile = {
  dtype: DetectorQuantizationId;
  sizeMb: number;
};

export const DETECTOR_BACKENDS = [
  { id: 'yolo', label: 'YOLO', description: 'Object and pose detection' },
  { id: 'mediapipe', label: 'MediaPipe', description: 'Pose landmark tracking' },
  { id: 'python-webrtc', label: 'Python WebRTC', description: 'Remote low-latency pose tracking' },
] as const;

export type DetectorBackendId = (typeof DETECTOR_BACKENDS)[number]['id'];

export const DEFAULT_DETECTOR_BACKEND_ID: DetectorBackendId = 'mediapipe';

const NANO_DETECTION_QUANTIZATIONS = [
  { dtype: 'fp16', sizeMb: 4.98 },
  { dtype: 'uint8', sizeMb: 2.85 },
  { dtype: 'int8', sizeMb: 2.85 },
  { dtype: 'q8', sizeMb: 2.85 },
  { dtype: 'q4f16', sizeMb: 4.98 },
  { dtype: 'q4', sizeMb: 9.89 },
  { dtype: 'bnb4', sizeMb: 9.89 },
] as const satisfies readonly QuantizedModelFile[];

const SMALL_DETECTION_QUANTIZATIONS = [
  { dtype: 'fp16', sizeMb: 19.2 },
  { dtype: 'uint8', sizeMb: 9.96 },
  { dtype: 'int8', sizeMb: 9.96 },
  { dtype: 'q8', sizeMb: 9.96 },
  { dtype: 'q4f16', sizeMb: 19.2 },
  { dtype: 'q4', sizeMb: 38.2 },
  { dtype: 'bnb4', sizeMb: 38.2 },
] as const satisfies readonly QuantizedModelFile[];

const NANO_POSE_QUANTIZATIONS = [
  { dtype: 'fp16', sizeMb: 6.07 },
  { dtype: 'uint8', sizeMb: 3.51 },
  { dtype: 'int8', sizeMb: 3.51 },
  { dtype: 'q8', sizeMb: 3.51 },
  { dtype: 'q4f16', sizeMb: 6.07 },
  { dtype: 'q4', sizeMb: 12.1 },
  { dtype: 'bnb4', sizeMb: 12.1 },
] as const satisfies readonly QuantizedModelFile[];

const SMALL_POSE_QUANTIZATIONS = [
  { dtype: 'fp16', sizeMb: 20.9 },
  { dtype: 'uint8', sizeMb: 11 },
  { dtype: 'int8', sizeMb: 11 },
  { dtype: 'q8', sizeMb: 11 },
  { dtype: 'q4f16', sizeMb: 20.9 },
  { dtype: 'q4', sizeMb: 41.8 },
  { dtype: 'bnb4', sizeMb: 41.8 },
] as const satisfies readonly QuantizedModelFile[];

export const YOLO_MODELS = [
  {
    id: 'onnx-community/yolo26n-ONNX',
    label: 'YOLO26n',
    description: 'Nano detection',
    task: 'detection',
    quantizations: NANO_DETECTION_QUANTIZATIONS,
  },
  {
    id: 'onnx-community/yolo26s-ONNX',
    label: 'YOLO26s',
    description: 'Small detection',
    task: 'detection',
    quantizations: SMALL_DETECTION_QUANTIZATIONS,
  },
  {
    id: 'onnx-community/yolo26n-pose-ONNX',
    label: 'YOLO26n-pose',
    description: 'Nano pose',
    task: 'pose',
    quantizations: NANO_POSE_QUANTIZATIONS,
  },
  {
    id: 'onnx-community/yolo26s-pose-ONNX',
    label: 'YOLO26s-pose',
    description: 'Small pose',
    task: 'pose',
    quantizations: SMALL_POSE_QUANTIZATIONS,
  },
] as const;

export type YoloModelId = (typeof YOLO_MODELS)[number]['id'];

export const DEFAULT_YOLO_MODEL_ID: YoloModelId = 'onnx-community/yolo26n-pose-ONNX';
export const DEFAULT_WEBGPU_QUANTIZATION_ID: DetectorQuantizationId = 'fp16';
export const DEFAULT_WASM_QUANTIZATION_ID: DetectorQuantizationId = 'uint8';
export const DEFAULT_DETECTOR_QUANTIZATION_ID: DetectorQuantizationId = DEFAULT_WEBGPU_QUANTIZATION_ID;

export const DETECTOR_RUNTIMES = [
  { id: 'webgpu', label: 'WebGPU', description: 'GPU accelerated' },
  { id: 'wasm', label: 'WASM', description: 'CPU fallback' },
] as const;

export type DetectorRuntimeId = (typeof DETECTOR_RUNTIMES)[number]['id'];

export const DEFAULT_DETECTOR_RUNTIME_ID: DetectorRuntimeId = 'webgpu';

export const MEDIAPIPE_MODELS = [
  {
    id: 'lite',
    label: 'Lite',
    description: 'Fastest pose tracking',
    modelAssetPath:
      'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  },
  {
    id: 'full',
    label: 'Full',
    description: 'Balanced pose tracking',
    modelAssetPath:
      'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
  },
  {
    id: 'heavy',
    label: 'Heavy',
    description: 'Highest accuracy',
    modelAssetPath:
      'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task',
  },
] as const;

export type MediaPipeModelId = (typeof MEDIAPIPE_MODELS)[number]['id'];

export const DEFAULT_MEDIAPIPE_MODEL_ID: MediaPipeModelId = 'lite';

export const MEDIAPIPE_DELEGATES = [
  { id: 'GPU', label: 'GPU', description: 'Accelerated delegate' },
  { id: 'CPU', label: 'CPU', description: 'Compatibility delegate' },
] as const;

export type MediaPipeDelegateId = (typeof MEDIAPIPE_DELEGATES)[number]['id'];

export const DEFAULT_MEDIAPIPE_DELEGATE_ID: MediaPipeDelegateId = 'GPU';
export const MEDIAPIPE_WASM_BASE_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';

export type DetectorImage = CameraFrameImage;
export type DetectorTimings = ModelPredictionTimings;
export type DetectorResult = ModelPrediction;
export type Detector = ModelPredictionService;

export type LoadProgress = {
  status?: string;
  file?: string;
  progress?: number;
};

export type DetectorLoadState = {
  message: string;
};

type DetectorRuntime = 'WebGPU' | 'WASM';
type MediaPipeRuntime = 'MediaPipe GPU' | 'MediaPipe CPU';
type PythonWebRtcRuntime = 'Python WebRTC';

export type DetectorLoadOptions = {
  backend: DetectorBackendId;
  modelId: YoloModelId;
  runtime: DetectorRuntimeId;
  quantization: DetectorQuantizationId;
  mediaPipeModelId: MediaPipeModelId;
  mediaPipeDelegate: MediaPipeDelegateId;
  playerCount: number;
  threshold?: number;
  stream?: MediaStream;
  onStatusChange?: (state: DetectorLoadState) => void;
  onResult?: (result: DetectorResult) => void;
  onError?: (error: Error) => void;
};

export type DetectorLoadResult = {
  detector: Detector;
  runtime: DetectorRuntime | MediaPipeRuntime | PythonWebRtcRuntime;
  mode?: 'pull' | 'stream';
  fallbackReason?: string;
  dispose?: () => void;
};

export function getSelectedModel(modelId: YoloModelId): (typeof YOLO_MODELS)[number] {
  return YOLO_MODELS.find((model) => model.id === modelId) ?? YOLO_MODELS[0];
}

export function getSelectedMediaPipeModel(modelId: MediaPipeModelId): (typeof MEDIAPIPE_MODELS)[number] {
  return MEDIAPIPE_MODELS.find((model) => model.id === modelId) ?? MEDIAPIPE_MODELS[0];
}

export function getDefaultQuantizationForRuntime(runtime: DetectorRuntimeId): DetectorQuantizationId {
  return runtime === 'webgpu' ? DEFAULT_WEBGPU_QUANTIZATION_ID : DEFAULT_WASM_QUANTIZATION_ID;
}

export function getQuantizationOption(dtype: DetectorQuantizationId): (typeof DETECTOR_QUANTIZATIONS)[number] {
  return DETECTOR_QUANTIZATIONS.find((option) => option.id === dtype) ?? DETECTOR_QUANTIZATIONS[0];
}

export function getAvailableQuantizations(modelId: YoloModelId): readonly QuantizedModelFile[] {
  return getSelectedModel(modelId).quantizations;
}
