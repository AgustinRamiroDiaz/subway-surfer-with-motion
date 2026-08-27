import { describe, expect, test } from 'vitest';
import {
  createRenderFrameLimiter,
  normalizeGameRenderFps,
} from './renderFrameLimiter';

describe('renderFrameLimiter', () => {
  test('normalizes persisted values to the supported slider range', () => {
    expect(normalizeGameRenderFps(undefined)).toBe(60);
    expect(normalizeGameRenderFps(5)).toBe(15);
    expect(normalizeGameRenderFps(62)).toBe(60);
    expect(normalizeGameRenderFps(500)).toBe(165);
  });

  test('limits render submissions without assuming the display refresh rate', () => {
    const { shouldRender } = createRenderFrameLimiter();
    const renderedAt = Array.from({ length: 166 }, (_, index) => index * (1_000 / 165))
      .filter((nowMs) => shouldRender(nowMs, 60));

    expect(renderedAt.length).toBeGreaterThanOrEqual(59);
    expect(renderedAt.length).toBeLessThanOrEqual(61);
  });

  test('applies a changed target on the next animation frame', () => {
    const { shouldRender } = createRenderFrameLimiter();
    expect(shouldRender(0, 15)).toBe(true);
    expect(shouldRender(10, 15)).toBe(false);
    expect(shouldRender(10, 165)).toBe(true);
  });
});
