import { describe, expect, it } from "vitest";
import { evaluateAiShot, planAiShot } from "./ai";

describe("computer player", () => {
  const origin = { x: 480, y: 148 };
  const pieces = Array.from({ length: 7 }, (_, index) => ({
    x: 480 + (index - 3) * 60,
    y: 480,
  }));

  it("uses the former medium decision window", () => {
    expect(planAiShot(origin, pieces, () => 0).decisionDelay).toBe(1000);
    expect(planAiShot(origin, pieces, () => 0.999).decisionDelay).toBeLessThan(
      1500,
    );
  });

  it("finds a useful shot from either side", () => {
    const topShot = planAiShot(origin, pieces, () => 0.5);
    const bottomOrigin = { x: 480, y: 812 };
    const bottomShot = planAiShot(bottomOrigin, pieces, () => 0.5);

    expect(evaluateAiShot(origin, pieces, topShot).knocked).toBeGreaterThan(0);
    expect(
      evaluateAiShot(bottomOrigin, pieces, bottomShot).knocked,
    ).toBeGreaterThan(0);
  });

  it("keeps shot power inside the playable range", () => {
    for (let seed = 0; seed < 10; seed += 1) {
      const shot = planAiShot(origin, pieces, () => seed / 10);
      expect(shot.power).toBeGreaterThanOrEqual(0.2);
      expect(shot.power).toBeLessThanOrEqual(1);
    }
  });
});
