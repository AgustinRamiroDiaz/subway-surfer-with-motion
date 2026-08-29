import { describe, expect, test } from 'vitest';
import { TRACK_MAX_X, TRACK_MIN_X, TRACK_WIDTH } from './gameConstants';
import { getHandRhythmPlayerMotion } from './levels/handRhythmLevel';
import { getHandRhythmGridBounds, handRhythmPlayerWidth } from './levels/handRhythmLayout';
import { getJumpDuckPlayerMotion } from './levels/jumpDuckLevel';
import { playerTrackWidth, playerTrackX } from './trackLayout';
import { createTrackCameras, resizeTrackCameras } from './trackWorld';
import { getPlayerTextureCrop } from './handRhythmCameraOverlay';
import { projectWorldPoint } from './shared/worldProjection';

describe('lane-based player layout', () => {
  test('splits the track width into one centered segment per player', () => {
    expect(playerTrackX(0, 1)).toBe(0);
    expect(playerTrackWidth(1)).toBeCloseTo(4.6);

    const fourPlayerCenters = Array.from({ length: 4 }, (_, index) => playerTrackX(index, 4));
    const segmentWidth = TRACK_WIDTH / 4;

    expect(playerTrackWidth(4)).toBeCloseTo(segmentWidth);
    expect(fourPlayerCenters).toEqual([
      TRACK_MIN_X + segmentWidth * 0.5,
      TRACK_MIN_X + segmentWidth * 1.5,
      TRACK_MIN_X + segmentWidth * 2.5,
      TRACK_MIN_X + segmentWidth * 3.5,
    ]);
    expect(fourPlayerCenters[0]).toBeGreaterThan(TRACK_MIN_X);
    expect(fourPlayerCenters[3]).toBeLessThan(TRACK_MAX_X);
  });

  test('uses the same visible lane centers for hand rhythm and jump-duck players', () => {
    const playerCount = 4;

    for (let index = 0; index < playerCount; index += 1) {
      const expectedX = playerTrackX(index, playerCount);

      expect(getHandRhythmPlayerMotion(null, index, playerCount).targetX).toBeCloseTo(expectedX);
      expect(getJumpDuckPlayerMotion(null, undefined, index, playerCount).targetX).toBeCloseTo(expectedX);
    }
  });

  test('quantizes hand rhythm detections to a configurable 2x2 grid', () => {
    const hand = {
      gesture: 'Open_Palm',
      normalizedX: 0.25,
      normalizedY: 0.25,
    };

    expect(getHandRhythmPlayerMotion(hand, 0, 1, 2).cell).toEqual({ row: 0, column: 0 });
  });

  test('maps the hand marker to the exact in-world camera grid bounds', () => {
    const motion = getHandRhythmPlayerMotion({
      gesture: 'Victory',
      normalizedX: 0.25,
      normalizedY: 0.2,
      normalizedWidth: 0.1,
      normalizedHeight: 0.2,
    }, 0, 1, 3);
    const bounds = getHandRhythmGridBounds(0, 1, 3);

    expect(motion.emojiWorldX).toBeCloseTo(bounds.left + bounds.width * 0.25);
    expect(motion.emojiWorldY).toBeCloseTo(bounds.top - bounds.height * 0.2);
    expect(motion.emojiWorldWidth).toBeCloseTo(0.72);
    expect(motion.emojiWorldHeight).toBeCloseTo(0.84);
    expect(motion.targetX).not.toBe(motion.emojiWorldX);
  });

  test('expands one-player hand rhythm while splitting the arena for multiple players', () => {
    expect(handRhythmPlayerWidth(1)).toBe(7.2);
    expect(handRhythmPlayerWidth(2)).toBeCloseTo(TRACK_WIDTH / 2);
  });
});

describe('hand rhythm virtual cameras', () => {
  const framing = { positionY: 2.45, positionZ: 10.6, targetZ: 0 };

  test('creates one player-centered camera per hand rhythm viewport', () => {
    const cameras = createTrackCameras('hand-rhythm', 4, framing);

    expect(cameras).toHaveLength(4);
    cameras.forEach((camera, index) => {
      expect(camera.position.x).toBeCloseTo(playerTrackX(index, 4));
      expect(camera.name).toBe(`player-${index + 1}-camera`);
      expect(camera.layers.isEnabled(index + 1)).toBe(true);
    });
  });

  test('keeps other levels on one centered camera', () => {
    const cameras = createTrackCameras('sideways', 4, framing);

    expect(cameras).toHaveLength(1);
    expect(cameras[0]?.position.x).toBe(0);
  });

  test('fits each split camera to the full width of its player segment', () => {
    [1, 2, 3, 4].forEach((playerCount) => {
      const cameras = createTrackCameras('hand-rhythm', playerCount, framing);
      resizeTrackCameras(cameras, 1200, 800);

      cameras.forEach((camera, index) => {
        const centerX = playerTrackX(index, playerCount);
        const halfWidth = handRhythmPlayerWidth(playerCount) / 2;
        expect(camera.aspect).toBeCloseTo(1.5 / playerCount);
        expect(projectWorldPoint(
          camera,
          centerX - halfWidth,
          0.05,
          2.6,
          index,
          playerCount,
        ).x).toBeCloseTo(index / playerCount);
        expect(projectWorldPoint(
          camera,
          centerX + halfWidth,
          0.05,
          2.6,
          index,
          playerCount,
        ).x).toBeCloseTo((index + 1) / playerCount);
      });
    });
  });

  test('fits the full pose-controlled track to both landscape and portrait viewports', () => {
    [
      { width: 1600, height: 900 },
      { width: 390, height: 844 },
    ].forEach(({ width, height }) => {
      const camera = createTrackCameras('sideways', 4, framing)[0];
      resizeTrackCameras([camera], width, height);

      expect(projectWorldPoint(camera, TRACK_MIN_X, 0.05, 2.6).x).toBeCloseTo(0);
      expect(projectWorldPoint(camera, TRACK_MAX_X, 0.05, 2.6).x).toBeCloseTo(1);
    });
  });

  test('preserves vertical projection overflow for aspect-correct camera cropping', () => {
    const camera = createTrackCameras('sideways', 4, framing)[0];
    resizeTrackCameras([camera], 1600, 700);

    expect(projectWorldPoint(camera, 0, 20, 2.6).y).toBeLessThan(0);
    expect(projectWorldPoint(camera, 0, -20, 2.6).y).toBeGreaterThan(1);
  });

  test('crops and mirrors each physical-camera section for its player plane', () => {
    expect(getPlayerTextureCrop(1, 4, false)).toEqual({ offsetX: 0.25, repeatX: 0.25 });
    expect(getPlayerTextureCrop(1, 4, true)).toEqual({ offsetX: 0.75, repeatX: -0.25 });
  });
});
