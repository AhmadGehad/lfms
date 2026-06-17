export type MapPoint = { x: number; y: number };
export type RectShape = { type: "rect"; x: number; y: number; width: number; height: number };
export type PolygonShape = { type: "polygon"; points: MapPoint[] };
export type MapShape = RectShape | PolygonShape;

export const FARM_MAP_DEFAULT_ASPECT = 16 / 9;

export const ZONE_COLORS = [
  { stroke: "#2563eb", fill: "rgba(37, 99, 235, 0.22)" },
  { stroke: "#16a34a", fill: "rgba(22, 163, 74, 0.22)" },
  { stroke: "#dc2626", fill: "rgba(220, 38, 38, 0.20)" },
  { stroke: "#9333ea", fill: "rgba(147, 51, 234, 0.20)" },
  { stroke: "#ca8a04", fill: "rgba(202, 138, 4, 0.24)" },
  { stroke: "#0891b2", fill: "rgba(8, 145, 178, 0.22)" },
];

export function clampUnit(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function readMapShape(value: unknown): MapShape | null {
  const raw = typeof value === "string" ? safeJson(value) : value;
  if (!raw || typeof raw !== "object") return null;
  const shape = raw as any;
  if (shape.type === "rect") {
    const { x, y, width, height } = shape;
    if ([x, y, width, height].every((n) => typeof n === "number")) {
      const safeX = clampUnit(x);
      const safeY = clampUnit(y);
      return {
        type: "rect",
        x: safeX,
        y: safeY,
        width: clampUnit(Math.min(width, 1 - safeX)),
        height: clampUnit(Math.min(height, 1 - safeY)),
      };
    }
  }
  if (shape.type === "polygon" && Array.isArray(shape.points)) {
    const points = shape.points
      .filter((p: any) => typeof p?.x === "number" && typeof p?.y === "number")
      .map((p: MapPoint) => ({ x: clampUnit(p.x), y: clampUnit(p.y) }));
    if (points.length >= 3) return { type: "polygon", points };
  }
  return null;
}

export function isValidShape(shape: MapShape | null) {
  if (!shape) return false;
  if (shape.type === "rect") return shape.width > 0.005 && shape.height > 0.005;
  return shape.points.length >= 3;
}

export function shapeCenter(shape: MapShape): MapPoint {
  if (shape.type === "rect") {
    return { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 };
  }
  const sum = shape.points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
  return { x: sum.x / shape.points.length, y: sum.y / shape.points.length };
}

export function zoneColor(groupId: number) {
  return ZONE_COLORS[Math.abs(groupId) % ZONE_COLORS.length];
}

function safeJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
