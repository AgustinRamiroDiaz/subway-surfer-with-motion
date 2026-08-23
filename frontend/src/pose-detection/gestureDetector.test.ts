import { describe, expect, test } from 'vitest';
import { getGestureHandLimit } from './gestureDetector';

describe('gesture hand capacity', () => {
  test('allows two tracked hands per configured player', () => {
    expect(getGestureHandLimit(1)).toBe(2);
    expect(getGestureHandLimit(4)).toBe(8);
  });

  test('keeps the detector limit valid for malformed counts', () => {
    expect(getGestureHandLimit(0)).toBe(1);
  });
});
