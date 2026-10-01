export type Point = { x: number; y: number };

export const MAX_PULL = 150;
export const MIN_PULL = 12;

export function getPullVector(
  origin: Point,
  pointer: Point,
  maxPull = MAX_PULL,
) {
  const x = pointer.x - origin.x;
  const y = pointer.y - origin.y;
  const length = Math.hypot(x, y);

  if (length === 0 || length <= maxPull) {
    return { x, y, length };
  }

  const scale = maxPull / length;
  return { x: x * scale, y: y * scale, length: maxPull };
}

export function getShotVelocity(pull: Point, multiplier = 0.11) {
  return { x: -pull.x * multiplier, y: -pull.y * multiplier };
}

export function getPower(length: number, maxPull = MAX_PULL) {
  return Math.round(Math.min(1, length / maxPull) * 100);
}
