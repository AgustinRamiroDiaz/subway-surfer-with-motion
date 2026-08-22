import { describe, expect, test } from 'vitest';
import contractFixture from '../../../protocol/model-prediction.fixture.json';
import { parseModelPrediction } from './protocolValidation';

describe('parseModelPrediction', () => {
  test('accepts the shared frontend/Python contract fixture', () => {
    expect(parseModelPrediction(contractFixture)).toEqual(contractFixture);
  });

  test('rejects unsupported versions before data reaches gameplay', () => {
    expect(() => parseModelPrediction({
      ...contractFixture,
      protocolVersion: 2,
    })).toThrow(/unsupported model prediction protocol version/i);
  });

  test('rejects malformed nested detections', () => {
    expect(() => parseModelPrediction({
      ...contractFixture,
      detections: [{ label: 'person', score: 'high', box: {} }],
    })).toThrow(/finite number/i);
  });
});
