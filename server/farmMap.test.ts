import { describe, expect, it } from "vitest";
import {
  MAX_MAP_POLYGON_POINTS,
  readMapShape,
  shapeBounds,
  type PolygonShape,
} from "../client/src/lib/farmMap";

describe("farm map shapes", () => {
  it("calculates polygon bounds without spreading the point array", () => {
    const shape: PolygonShape = {
      type: "polygon",
      points: [
        { x: 0.2, y: 0.7 },
        { x: 0.8, y: 0.4 },
        { x: 0.5, y: 0.9 },
      ],
    };

    const bounds = shapeBounds(shape);
    expect(bounds.x).toBeCloseTo(0.2);
    expect(bounds.y).toBeCloseTo(0.4);
    expect(bounds.width).toBeCloseTo(0.6);
    expect(bounds.height).toBeCloseTo(0.5);
  });

  it("caps legacy polygon data to the server limit", () => {
    const shape = readMapShape({
      type: "polygon",
      points: [
        { x: "invalid", y: "invalid" },
        ...Array.from({ length: MAX_MAP_POLYGON_POINTS + 20 }, (_, index) => ({
          x: index / 100,
          y: index / 100,
        })),
      ],
    });

    expect(shape?.type).toBe("polygon");
    if (shape?.type === "polygon") {
      expect(shape.points).toHaveLength(MAX_MAP_POLYGON_POINTS);
    }
  });
});
