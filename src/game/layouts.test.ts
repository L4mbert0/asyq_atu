import { describe, expect, it } from "vitest";
import { ASYQ_LAYOUTS, createAsyqLayoutPoints, getAsyqLayout } from "./layouts";

describe("asyq layouts", () => {
  it("provides six distinct formations with no more than 15 pieces", () => {
    expect(ASYQ_LAYOUTS.map((layout) => layout.points.length)).toEqual([
      7, 6, 9, 12, 15, 13,
    ]);
    expect(new Set(ASYQ_LAYOUTS.map((layout) => layout.id)).size).toBe(6);
    expect(
      Math.max(...ASYQ_LAYOUTS.map((layout) => layout.points.length)),
    ).toBe(15);
  });

  it("keeps every formation comfortably inside the arena", () => {
    ASYQ_LAYOUTS.forEach((layout) => {
      layout.points.forEach((point) => {
        expect(Math.hypot(point.x - 480, point.y - 480)).toBeLessThan(200);
      });
    });
  });

  it("finds a formation by id", () => {
    expect(getAsyqLayout("ring").name).toBe("Круг");
  });

  it("creates 13 separated pieces for a fresh chaos round", () => {
    let seed = 42;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const points = createAsyqLayoutPoints("chaos", random);

    expect(points).toHaveLength(13);
    points.forEach((point, index) => {
      points.slice(index + 1).forEach((other) => {
        expect(
          Math.hypot(point.x - other.x, point.y - other.y),
        ).toBeGreaterThanOrEqual(48);
      });
    });
  });
});
