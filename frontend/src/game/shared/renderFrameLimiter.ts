export const MIN_GAME_RENDER_FPS = 15;
export const MAX_GAME_RENDER_FPS = 165;
export const GAME_RENDER_FPS_STEP = 5;
export const DEFAULT_GAME_RENDER_FPS = 60;

export function normalizeGameRenderFps(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_GAME_RENDER_FPS;
  }

  const clamped = Math.min(MAX_GAME_RENDER_FPS, Math.max(MIN_GAME_RENDER_FPS, value));
  const stepped = MIN_GAME_RENDER_FPS +
    Math.round((clamped - MIN_GAME_RENDER_FPS) / GAME_RENDER_FPS_STEP) * GAME_RENDER_FPS_STEP;
  return Math.min(MAX_GAME_RENDER_FPS, Math.max(MIN_GAME_RENDER_FPS, stepped));
}

export type RenderFrameLimiter = {
  shouldRender: (nowMs: number, targetFps: number) => boolean;
};

export function createRenderFrameLimiter(): RenderFrameLimiter {
  let activeTargetFps: number | null = null;
  let nextRenderAtMs = 0;

  return {
    shouldRender(nowMs, targetFps) {
      const normalizedTargetFps = normalizeGameRenderFps(targetFps);
      if (activeTargetFps !== normalizedTargetFps) {
        activeTargetFps = normalizedTargetFps;
        nextRenderAtMs = nowMs;
      }

      if (nowMs < nextRenderAtMs) {
        return false;
      }

      const intervalMs = 1_000 / normalizedTargetFps;
      const elapsedIntervals = Math.floor((nowMs - nextRenderAtMs) / intervalMs) + 1;
      nextRenderAtMs += elapsedIntervals * intervalMs;
      return true;
    },
  };
}
