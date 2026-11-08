export const INCOME_DURATION = 1700;
export const TRANSFORMATION_DURATION = 1600;
export const BOT_FOCUS_DURATION = 700;
export const COMBAT_DURATION = 700;
export const RESOURCE_DURATION = 1700;
export const RESOURCE_ARRIVAL = RESOURCE_DURATION * 0.93;

export function resourceStarProgress(elapsed: number, index: number): number {
  const start = RESOURCE_DURATION * (0.48 + index * 0.04);
  return Math.max(0, Math.min(1, (elapsed - start) / (RESOURCE_ARRIVAL - start)));
}

export function advancePosition(from: { x: number; y: number }, to: { x: number; y: number }, progress: number) {
  const travel = Math.max(0, Math.min(1, progress / 0.55));
  const eased = 1 - (1 - travel) ** 3;
  return { x: from.x + (to.x - from.x) * eased, y: from.y + (to.y - from.y) * eased };
}

export function incomeCoinCount(amount: number): number {
  return Math.min(amount, 5);
}

export function incomeCoinAmount(amount: number, index: number): number {
  const count = incomeCoinCount(amount);
  return Math.floor(amount / count) + (index < amount % count ? 1 : 0);
}

export function incomeCoinProgress(elapsed: number, index: number): number {
  return Math.max(0, Math.min(1, (elapsed / INCOME_DURATION - index * 0.06) / 0.7));
}

export function transformationFrame(elapsed: number): { previous: boolean; shake: number; flash: number } {
  const progress = Math.max(0, Math.min(1, elapsed / TRANSFORMATION_DURATION));
  const previous = progress < 0.5;
  const shake = progress < 0.35 ? Math.sin(elapsed * 0.065) * (progress / 0.35) : 0;
  const flash = Math.max(0, 1 - Math.abs(progress - 0.5) / 0.15);
  return { previous, shake, flash };
}
