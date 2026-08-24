import { describe, expect, test } from 'vitest';
import * as THREE from 'three';
import { smoothGestureSize, smoothGestureValue } from './gestureSmoothing';
import { updatePlayerGestureEmojiPosition } from './playerAvatar';
import type { PlayerAvatar } from './gameTypes';

describe('gesture emoji smoothing', () => {
  test('ignores tiny position and size fluctuations', () => {
    expect(smoothGestureValue(1, 1.01, 1 / 60)).toBe(1);
    expect(smoothGestureSize(1, 1.015, 1 / 60)).toBe(1);
  });

  test('responds more strongly to deliberate large movement', () => {
    const smallStep = smoothGestureValue(0, 0.1, 1 / 60);
    const largeStep = smoothGestureValue(0, 1, 1 / 60);

    expect(largeStep).toBeGreaterThan(smallStep * 3);
    expect(largeStep).toBeLessThan(1);
  });

  test('uses elapsed time rather than assuming a fixed frame rate', () => {
    const target = 0.5;
    const atThirtyFps = Array.from({ length: 30 }).reduce<number>(
      (value) => smoothGestureValue(value, target, 1 / 30),
      0
    );
    const atSixtyFps = Array.from({ length: 60 }).reduce<number>(
      (value) => smoothGestureValue(value, target, 1 / 60),
      0
    );

    expect(atThirtyFps).toBeCloseTo(atSixtyFps, 2);
  });

  test('keeps parent grid movement out of the emoji world position', () => {
    const root = new THREE.Group();
    const sprite = new THREE.Sprite();
    root.position.set(1, 2, 0);
    sprite.position.set(0.5, 0.5, 0);
    root.add(sprite);
    const player = { root, gestureSprite: sprite } as unknown as PlayerAvatar;

    updatePlayerGestureEmojiPosition(player, 1.5, 2.5, 1 / 60);
    root.position.set(4, -3, 0);
    updatePlayerGestureEmojiPosition(player, 1.6, 2.5, 1 / 60);

    const emojiWorldX = root.position.x + sprite.position.x;
    const emojiWorldY = root.position.y + sprite.position.y;
    expect(emojiWorldX).toBeGreaterThan(1.5);
    expect(emojiWorldX).toBeLessThan(1.6);
    expect(emojiWorldY).toBeCloseTo(2.5);
  });
});
