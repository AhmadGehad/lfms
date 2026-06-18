import { cn } from "@/lib/utils";
import {
  FARM_MAP_DEFAULT_ASPECT,
  type MapShape,
  readMapShape,
  shapeBounds,
  shapeCenter,
  zoneColor,
} from "@/lib/farmMap";
import { Button } from "@/components/ui/button";
import { Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
const ZOOM_STEP = 0.5;
const TARGET_ZONE_COVERAGE = 0.65;

type FarmMapGroup = {
  id: number;
  groupCode?: string | null;
  name?: string | null;
  mapShape?: unknown;
  color?: string | null;
};

function ZoneShape({
  group,
  shape,
  selected,
  showLabel,
}: {
  group: FarmMapGroup;
  shape: MapShape;
  selected: boolean;
  showLabel: boolean;
}) {
  const color = zoneColor(group.id, group.color);
  const center = shapeCenter(shape);
  const label = group.groupCode || group.name || "";
  const visibleLabel = label.length > 18 ? `${label.slice(0, 17)}…` : label;
  const labelWidth = Math.max(8, Math.min(32, visibleLabel.length * 1.15 + 4));
  const labelHeight = 5;
  const labelX = Math.min(100 - labelWidth / 2 - 0.6, Math.max(labelWidth / 2 + 0.6, center.x * 100));
  const labelY = Math.min(97, Math.max(3, (center.y * 100) + (selected ? 4.2 : 0)));
  const common = {
    fill: selected ? color.fill : "rgba(15, 23, 42, 0.12)",
    stroke: selected ? color.stroke : "rgba(15, 23, 42, 0.38)",
    strokeWidth: selected ? 1.15 : 0.45,
    vectorEffect: "non-scaling-stroke" as const,
    className: "transition-opacity",
  };

  return (
    <g className={selected ? "opacity-100" : "opacity-55"}>
      {shape.type === "rect" ? (
        <rect
          x={shape.x * 100}
          y={shape.y * 100}
          width={shape.width * 100}
          height={shape.height * 100}
          rx={0.7}
          {...common}
        />
      ) : (
        <polygon
          points={shape.points.map((point) => `${point.x * 100},${point.y * 100}`).join(" ")}
          {...common}
        />
      )}
      {selected && (
        <circle
          cx={center.x * 100}
          cy={center.y * 100}
          r={1.45}
          className="fill-primary stroke-white"
          strokeWidth={0.65}
          vectorEffect="non-scaling-stroke"
        />
      )}
      {showLabel && visibleLabel && (
        <g className="pointer-events-none select-none drop-shadow-sm">
          <rect
            x={labelX - labelWidth / 2}
            y={labelY - labelHeight / 2}
            width={labelWidth}
            height={labelHeight}
            rx={1.2}
            fill="rgba(255, 255, 255, 0.94)"
            stroke="rgba(15, 23, 42, 0.35)"
            strokeWidth={0.35}
            vectorEffect="non-scaling-stroke"
          />
          <text
            x={labelX}
            y={labelY}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-slate-950 text-[3.2px] font-bold"
          >
            {visibleLabel}
          </text>
        </g>
      )}
    </g>
  );
}

export function FarmMapPreview({
  imageUrl,
  imageAlt,
  groups,
  selectedGroupId,
  selectedLabel,
  className,
  showLabels = false,
  focusSelected = false,
  interactive = false,
  aspectRatio = FARM_MAP_DEFAULT_ASPECT,
}: {
  imageUrl: string;
  imageAlt: string;
  groups: FarmMapGroup[];
  selectedGroupId: number | null | undefined;
  selectedLabel?: string;
  className?: string;
  showLabels?: boolean;
  focusSelected?: boolean;
  interactive?: boolean;
  aspectRatio?: number;
}) {
  const { t } = useTranslation();
  const [imageAspect, setImageAspect] = useState(FARM_MAP_DEFAULT_ASPECT);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const zones = useMemo(
    () => groups
      .map((group) => {
        const shape = readMapShape(group.mapShape);
        return shape ? { group, shape } : null;
      })
      .filter(Boolean) as Array<{ group: FarmMapGroup; shape: MapShape }>,
    [groups],
  );
  const selectedZone = useMemo(
    () => zones.find(({ group }) => group.id === selectedGroupId) ?? null,
    [selectedGroupId, zones],
  );
  const stage = useMemo(() => {
    if (imageAspect >= aspectRatio) {
      return {
        widthPercent: 100,
        heightPercent: (aspectRatio / imageAspect) * 100,
      };
    }
    return {
      widthPercent: (imageAspect / aspectRatio) * 100,
      heightPercent: 100,
    };
  }, [aspectRatio, imageAspect]);
  const selectedBounds = useMemo(
    () => selectedZone ? shapeBounds(selectedZone.shape) : null,
    [selectedZone],
  );
  const focusZoom = useMemo(() => {
    if (!focusSelected || !selectedBounds) return MIN_ZOOM;

    const zoneWidth = Math.max(selectedBounds.width * (stage.widthPercent / 100), 0.01);
    const zoneHeight = Math.max(selectedBounds.height * (stage.heightPercent / 100), 0.01);

    return Math.min(
      MAX_ZOOM,
      Math.max(
        MIN_ZOOM,
        Math.min(
          TARGET_ZONE_COVERAGE / zoneWidth,
          TARGET_ZONE_COVERAGE / zoneHeight,
        ),
      ),
    );
  }, [focusSelected, selectedBounds, stage]);
  const selectedCenter = selectedBounds
    ? {
        x: selectedBounds.x + selectedBounds.width / 2,
        y: selectedBounds.y + selectedBounds.height / 2,
      }
    : { x: 0.5, y: 0.5 };
  const focalPoint = useMemo(() => {
    const scaledWidth = (stage.widthPercent / 100) * zoom;
    const scaledHeight = (stage.heightPercent / 100) * zoom;

    const clampCenter = (value: number, scaledSize: number) => {
      const halfViewport = 0.5 / scaledSize;
      if (halfViewport >= 0.5) return 0.5;
      return Math.min(1 - halfViewport, Math.max(halfViewport, value));
    };

    return {
      x: clampCenter(selectedCenter.x, scaledWidth),
      y: clampCenter(selectedCenter.y, scaledHeight),
    };
  }, [selectedCenter.x, selectedCenter.y, stage, zoom]);

  useEffect(() => {
    setZoom(focusZoom);
  }, [focusZoom, imageUrl, selectedGroupId]);

  function updateZoom(nextZoom: number) {
    setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom)));
  }

  return (
    <div
      className={cn("relative w-full overflow-hidden rounded-md border bg-muted", className)}
      style={{ aspectRatio }}
    >
      <div
        className="absolute transition-transform duration-200 motion-reduce:transition-none"
        style={{
          left: "50%",
          top: "50%",
          width: `${stage.widthPercent}%`,
          height: `${stage.heightPercent}%`,
          transform: `translate(${-focalPoint.x * 100}%, ${-focalPoint.y * 100}%)`,
        }}
      >
        <div
          className="relative h-full w-full transition-transform duration-200 motion-reduce:transition-none"
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: `${focalPoint.x * 100}% ${focalPoint.y * 100}%`,
          }}
        >
          <img
            src={imageUrl}
            alt={imageAlt}
            width={1600}
            height={900}
            className="absolute inset-0 h-full w-full"
            onLoad={(event) => {
              const image = event.currentTarget;
              if (image.naturalWidth && image.naturalHeight) {
                setImageAspect(image.naturalWidth / image.naturalHeight);
              }
            }}
          />
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
            aria-hidden="true"
          >
            {zones.map(({ group, shape }) => (
              <ZoneShape
                key={group.id}
                group={group}
                shape={shape}
                selected={group.id === selectedGroupId}
                showLabel={showLabels}
              />
            ))}
          </svg>
        </div>
      </div>
      {interactive && (
        <div className="absolute right-2 top-2 flex items-center rounded-md border bg-background/95 shadow-sm">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-r-none"
            onClick={() => updateZoom(zoom - ZOOM_STEP)}
            disabled={zoom <= MIN_ZOOM}
            aria-label={t("farmMap.zoomOut")}
            title={t("farmMap.zoomOut")}
          >
            <ZoomOut aria-hidden="true" className="h-4 w-4" />
          </Button>
          <span
            className="min-w-14 px-2 text-center text-xs font-medium tabular-nums"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {Math.round(zoom * 100)}%
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-none"
            onClick={() => updateZoom(zoom + ZOOM_STEP)}
            disabled={zoom >= MAX_ZOOM}
            aria-label={t("farmMap.zoomIn")}
            title={t("farmMap.zoomIn")}
          >
            <ZoomIn aria-hidden="true" className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-l-none"
            onClick={() => setZoom(focusZoom)}
            disabled={Math.abs(zoom - focusZoom) < 0.01}
            aria-label={t("farmMap.resetZoom")}
            title={t("farmMap.resetZoom")}
          >
            <Maximize2 aria-hidden="true" className="h-4 w-4" />
          </Button>
        </div>
      )}
      {selectedLabel && (
        <div className="absolute bottom-2 left-2 max-w-[calc(100%-1rem)] rounded-md border bg-background/95 px-3 py-1.5 text-sm font-semibold text-foreground shadow-md">
          <span className="block truncate">{selectedLabel}</span>
        </div>
      )}
    </div>
  );
}
