import { describe, expect, test } from 'vitest';
import { OBSTACLE_SPAWN_Z, PLAYER_Z } from '../../gameConstants';
import {
  getCanvasPerspectiveScale,
  getCanvasTargetProgress,
  getContainedCanvasRect,
  getTargetRectangleCenter,
} from './canvas2dHandRhythmRenderer';

describe('Canvas 2D Hand Rhythm projection', () => {
  test('fits a wide camera by width without cropping', () => {
    expect(getContainedCanvasRect(1000, 1000, 16 / 9)).toEqual({
      left: 0,
      top: 218.75,
      width: 1000,
      height: 562.5,
    });
  });

  test('fits a tall camera by height without cropping', () => {
    expect(getContainedCanvasRect(1000, 500, 3 / 4)).toEqual({
      left: 312.5,
      top: 0,
      width: 375,
      height: 500,
    });
  });

  test('maps spawn and hit depth to the same normalized approach interval', () => {
    expect(getCanvasTargetProgress(OBSTACLE_SPAWN_Z)).toBe(0);
    expect(getCanvasTargetProgress(PLAYER_Z)).toBe(1);
    expect(getCanvasTargetProgress(Number.POSITIVE_INFINITY)).toBe(1.15);
  });

  test('uses inverse camera distance so targets accelerate as they approach', () => {
    const travel = PLAYER_Z - OBSTACLE_SPAWN_Z;
    const depths = Array.from(
      { length: 5 },
      (_, index) => OBSTACLE_SPAWN_Z + travel * index / 4
    );
    const progress = depths.map(getCanvasTargetProgress);
    const screenSteps = progress.slice(1).map((value, index) => value - progress[index]);

    expect(getCanvasPerspectiveScale(PLAYER_Z)).toBe(1);
    expect(getCanvasPerspectiveScale(OBSTACLE_SPAWN_Z)).toBeLessThan(0.3);
    expect(progress[2]).toBeLessThan(0.5);
    expect(screenSteps[1]).toBeGreaterThan(screenSteps[0]);
    expect(screenSteps[2]).toBeGreaterThan(screenSteps[1]);
    expect(screenSteps[3]).toBeGreaterThan(screenSteps[2]);
  });

  test('centers hand obstacles with their corresponding cell rectangle for 2x2 grid', () => {
    const rect = { left: 100, top: 50, width: 800, height: 600 };
    // Single player, 2x2: each cell is 400x300
    // Cell (0, 0) -> center (100 + 200, 50 + 150) = (300, 200)
    expect(getTargetRectangleCenter(rect, 0, 1, 2, 0, 0)).toEqual({
      centerX: 300,
      centerY: 200,
      cellWidth: 400,
      cellHeight: 300,
    });
    // Cell (1, 1) -> center (100 + 600, 50 + 450) = (700, 500)
    expect(getTargetRectangleCenter(rect, 0, 1, 2, 1, 1)).toEqual({
      centerX: 700,
      centerY: 500,
      cellWidth: 400,
      cellHeight: 300,
    });
  });

  test('centers hand obstacles with their corresponding cell rectangle for 2 players', () => {
    const rect = { left: 0, top: 0, width: 1000, height: 600 };
    // 2 players, 3x3 grid: each player panel is 500 wide, cell is (500/3) x 200
    // Player 1 (index 1), cell (2, 1):
    // panelLeft = 500, cellWidth = 500/3, cellHeight = 200
    // centerX = 500 + 2.5 * (500/3) = 500 + 1250/3 ≈ 916.67
    // centerY = 0 + 1.5 * 200 = 300
    const result = getTargetRectangleCenter(rect, 1, 2, 3, 2, 1);
    expect(result.centerX).toBeCloseTo(916.67, 1);
    expect(result.centerY).toBe(300);
    expect(result.cellWidth).toBeCloseTo(166.67, 1);
    expect(result.cellHeight).toBe(200);
  });
});
