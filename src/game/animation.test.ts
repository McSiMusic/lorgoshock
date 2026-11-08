import { describe, expect, it } from "vitest";
import { INCOME_DURATION, RESOURCE_ARRIVAL, TRANSFORMATION_DURATION, advancePosition, incomeCoinAmount, incomeCoinCount, incomeCoinProgress, resourceStarProgress, transformationFrame } from "./animation";

it("smoothly advances the victor to the defeated unit's tile", () => {
  const from = { x: 2, y: 3 }, to = { x: 3, y: 4 };
  expect(advancePosition(from, to, 0)).toEqual(from);
  const halfway = advancePosition(from, to, 0.2);
  expect(halfway.x).toBeGreaterThan(from.x);
  expect(halfway.x).toBeLessThan(to.x);
  expect(advancePosition(from, to, 1)).toEqual(to);
});

describe("income animation", () => {
  it.each([2, 5, 7, 8])("delivers exactly %i tokens when coins arrive", (amount) => {
    const count = incomeCoinCount(amount);
    expect(Array.from({ length: count }, (_, index) => incomeCoinAmount(amount, index)).reduce((sum, value) => sum + value, 0)).toBe(amount);
    for (let index = 0; index < count; index++) {
      const arrival = INCOME_DURATION * (0.7 + index * 0.06);
      expect(incomeCoinProgress(arrival - 1, index)).toBeLessThan(1);
      expect(incomeCoinProgress(arrival + 1, index)).toBe(1);
    }
  });

  it("brings every resource star to the company at the acknowledgement time", () => {
    for (let index = 0; index < 3; index++) {
      expect(resourceStarProgress(RESOURCE_ARRIVAL - 1, index)).toBeLessThan(1);
      expect(resourceStarProgress(RESOURCE_ARRIVAL, index)).toBe(1);
    }
  });
});

describe("company transformation", () => {
  it("shakes the old city and leaves the new city still", () => {
    expect(transformationFrame(200).previous).toBe(true);
    expect(transformationFrame(200).shake).not.toBe(0);
    const flash = transformationFrame(TRANSFORMATION_DURATION / 2);
    expect(flash.previous).toBe(false);
    expect(flash.flash).toBe(1);
    const after = transformationFrame(1200);
    expect(after.previous).toBe(false);
    expect(after.shake).toBe(0);
    expect(transformationFrame(TRANSFORMATION_DURATION)).toEqual({ previous: false, shake: 0, flash: 0 });
  });
});
