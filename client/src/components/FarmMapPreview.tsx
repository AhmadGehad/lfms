import { cn } from "@/lib/utils";
import {
  FARM_MAP_DEFAULT_ASPECT,
  type MapShape,
  readMapShape,
  shapeCenter,
  zoneColor,
} from "@/lib/farmMap";
import { useMemo, useState } from "react";

type FarmMapGroup = {
  id: number;
  groupCode?: string | null;
  name?: string | null;
  mapShape?: unknown;
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
  const color = zoneColor(group.id);
  const center = shapeCenter(shape);
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
      {showLabel && (
        <text
          x={center.x * 100}
          y={(center.y * 100) + (selected ? 3.6 : 0)}
          textAnchor="middle"
          dominantBaseline="middle"
          className="pointer-events-none select-none fill-white text-[3px] font-semibold drop-shadow"
        >
          {group.groupCode || group.name}
        </text>
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
}: {
  imageUrl: string;
  imageAlt: string;
  groups: FarmMapGroup[];
  selectedGroupId: number | null | undefined;
  selectedLabel?: string;
  className?: string;
  showLabels?: boolean;
}) {
  const [imageAspect, setImageAspect] = useState(FARM_MAP_DEFAULT_ASPECT);
  const zones = useMemo(
    () => groups
      .map((group) => {
        const shape = readMapShape(group.mapShape);
        return shape ? { group, shape } : null;
      })
      .filter(Boolean) as Array<{ group: FarmMapGroup; shape: MapShape }>,
    [groups],
  );

  return (
    <div
      className={cn("relative w-full overflow-hidden rounded-md border bg-muted", className)}
      style={{ aspectRatio: imageAspect }}
    >
      <img
        src={imageUrl}
        alt={imageAlt}
        className="absolute inset-0 h-full w-full object-fill"
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
      {selectedLabel && (
        <div className="absolute bottom-2 left-2 max-w-[calc(100%-1rem)] rounded bg-background/90 px-2 py-1 text-xs font-medium shadow">
          <span className="block truncate">{selectedLabel}</span>
        </div>
      )}
    </div>
  );
}
