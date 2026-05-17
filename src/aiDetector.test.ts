import { DEFAULT_YOLO_MODEL_ID, loadYoloDetector } from './aiDetector';

const mockProcessor = jest.fn();
const mockModel = jest.fn();
const mockFromCanvas = jest.fn();
const mockFromPretrainedProcessor = jest.fn();
const mockFromPretrainedModel = jest.fn();

jest.mock('@huggingface/transformers', () => ({
  env: {
    allowLocalModels: true,
  },
  RawImage: {
    fromCanvas: (...args: unknown[]) => mockFromCanvas(...args),
  },
  AutoImageProcessor: {
    from_pretrained: (...args: unknown[]) => mockFromPretrainedProcessor(...args),
  },
  AutoModelForObjectDetection: {
    from_pretrained: (...args: unknown[]) => mockFromPretrainedModel(...args),
  },
}));

function makePoseLogits() {
  const data = new Array(57).fill(0);
  data[0] = 0.1;
  data[1] = 0.2;
  data[2] = 0.8;
  data[3] = 0.9;
  data[4] = 0.95;
  data[5] = 0;

  for (let index = 0; index < 17; index += 1) {
    const offset = 6 + index * 3;
    data[offset] = 0.2 + index * 0.01;
    data[offset + 1] = 0.3 + index * 0.01;
    data[offset + 2] = 0.9;
  }

  return {
    dims: [1, 1, 57],
    data,
  };
}

describe('loadYoloDetector', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockFromCanvas.mockReturnValue({
      size: [480, 640],
      width: 640,
      height: 480,
    });

    mockProcessor.mockImplementation((image) => {
      if (!image.size) {
        throw new Error('processor received a canvas instead of RawImage');
      }

      return Promise.resolve({ pixel_values: 'mock-pixels' });
    });

    mockModel.mockResolvedValue({
      logits: makePoseLogits(),
    });

    mockFromPretrainedProcessor.mockResolvedValue(mockProcessor);
    mockFromPretrainedModel.mockResolvedValue(mockModel);
  });

  test('converts canvas frames to RawImage before preprocessing', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;

    const { detector, runtime } = await loadYoloDetector({
      modelId: DEFAULT_YOLO_MODEL_ID,
    });
    const detections = await detector(canvas, { threshold: 0.5, percentage: false });

    expect(runtime).toBe('WASM');
    expect(mockFromCanvas).toHaveBeenCalledWith(canvas);
    expect(mockProcessor).toHaveBeenCalledWith(expect.objectContaining({ size: [480, 640] }));
    expect(detections).toHaveLength(1);
    expect(detections[0].box).toEqual({
      xmin: 64,
      ymin: 96,
      xmax: 512,
      ymax: 432,
    });
    expect(detections[0].keypoints).toHaveLength(17);
  });
});
