const POSITION_DEAD_ZONE = 0.012;
const SIZE_DEAD_ZONE = 0.02;
const SLOW_RESPONSE_SECONDS = 0.16;
const FAST_RESPONSE_SECONDS = 0.055;
const FAST_RESPONSE_DISTANCE = 0.75;

export function smoothGestureValue(
  current: number,
  target: number,
  deltaSeconds: number,
  deadZone = POSITION_DEAD_ZONE
): number {
  const distance = Math.abs(target - current);
  if (distance <= deadZone) {
    return current;
  }

  const movement = Math.min(1, Math.max(0, (distance - deadZone) / FAST_RESPONSE_DISTANCE));
  const responseSeconds = SLOW_RESPONSE_SECONDS - movement * (SLOW_RESPONSE_SECONDS - FAST_RESPONSE_SECONDS);
  const frameSeconds = Math.min(0.05, Math.max(0, deltaSeconds));
  const alpha = 1 - Math.exp(-frameSeconds / responseSeconds);
  return current + (target - current) * alpha;
}

export function smoothGestureSize(current: number, target: number, deltaSeconds: number): number {
  return smoothGestureValue(current, target, deltaSeconds, SIZE_DEAD_ZONE);
}
