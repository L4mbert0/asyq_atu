import { describe, expect, it } from "vitest";
import { getPower, getPullVector, getShotVelocity } from "./shot";

describe("shot helpers", () => {
  it("limits the pull distance", () => {
    expect(getPullVector({ x: 0, y: 0 }, { x: 300, y: 0 }, 150)).toEqual({
      x: 150,
      y: 0,
      length: 150,
    });
  });

  it("shoots in the opposite direction", () => {
    expect(getShotVelocity({ x: -100, y: 40 }, 0.1)).toEqual({
      x: 10,
      y: -4,
    });
  });

  it("reports capped power", () => {
    expect(getPower(75, 150)).toBe(50);
    expect(getPower(200, 150)).toBe(100);
  });
});
