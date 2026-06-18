import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { usePermissions } from "@/hooks/usePermissions";
import {
  FARM_MAP_DEFAULT_ASPECT,
  clampUnit,
  isValidShape,
  type MapPoint,
  type MapShape,
  readMapShape,
  shapeCenter,
  zoneColor,
} from "@/lib/farmMap";
import { trpc } from "@/lib/trpc";
import {
  ImageIcon,
  Maximize2,
  MapPinned,
  MousePointer2,
  Pentagon,
  Save,
  Square,
  Trash2,
  Undo2,
  Upload,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { type MouseEvent, type PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

type DrawMode = "select" | "rect" | "polygon";

const FARM_MAP_MAX_BYTES = 8 * 1024 * 1024;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;
const FRAME_PADDING = 32;

function pointFromEvent(event: { clientX: number; clientY: number }, element: SVGSVGElement | null): MapPoint | null {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  return {
    x: clampUnit((event.clientX - rect.left) / rect.width),
    y: clampUnit((event.clientY - rect.top) / rect.height),
  };
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function ZoneShape({
  group,
  shape,
  selected,
  onSelect,
}: {
  group: any;
  shape: MapShape;
  selected: boolean;
  onSelect: () => void;
}) {
  const color = zoneColor(group.id, group.color);
  const center = shapeCenter(shape);
  const label = group.groupCode || group.name || "";
  const visibleLabel = label.length > 18 ? `${label.slice(0, 17)}…` : label;
  const labelWidth = Math.max(8, Math.min(32, visibleLabel.length * 1.15 + 4));
  const labelHeight = 5;
  const labelX = Math.min(100 - labelWidth / 2 - 0.6, Math.max(labelWidth / 2 + 0.6, center.x * 100));
  const labelY = Math.min(97, Math.max(3, center.y * 100));
  const common = {
    fill: color.fill,
    stroke: color.stroke,
    strokeWidth: selected ? 0.9 : 0.55,
    vectorEffect: "non-scaling-stroke" as const,
    className: "cursor-pointer transition-opacity hover:opacity-90",
    onPointerDown: (event: PointerEvent) => event.stopPropagation(),
    onClick: (event: MouseEvent) => {
      event.stopPropagation();
      onSelect();
    },
  };

  return (
    <g>
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
      {visibleLabel && (
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

export default function FarmMap() {
  const { t } = useTranslation();
  const permissions = usePermissions("farmMap");
  const utils = trpc.useUtils();
  const { data: groups, isLoading: groupsLoading } = trpc.config.getGroups.useQuery();
  const { data: mapImage, isLoading: imageLoading } = trpc.config.getFarmMapImage.useQuery();
  const setFarmMapImage = trpc.config.setFarmMapImage.useMutation({
    onSuccess: () => {
      toast.success(t("farmMap.imageUpdated"));
      utils.config.getFarmMapImage.invalidate();
    },
    onError: (error: any) => toast.error(error.message),
  });
  const removeFarmMapImage = trpc.config.removeFarmMapImage.useMutation({
    onSuccess: () => {
      toast.success(t("farmMap.imageRemoved"));
      utils.config.getFarmMapImage.invalidate();
    },
    onError: (error: any) => toast.error(error.message),
  });
  const updateGroup = trpc.config.updateGroupMap.useMutation({
    onSuccess: () => {
      toast.success(t("farmMap.zoneSaved"));
      utils.config.getGroups.invalidate();
    },
    onError: (error: any) => toast.error(error.message),
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragStartRef = useRef<MapPoint | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [mode, setMode] = useState<DrawMode>("select");
  const [draftShape, setDraftShape] = useState<MapShape | null>(null);
  const [imageAspect, setImageAspect] = useState(FARM_MAP_DEFAULT_ASPECT);
  const [zoom, setZoom] = useState(1);
  const [frameSize, setFrameSize] = useState({ width: 960, height: 540 });
  const [uploading, setUploading] = useState(false);

  const groupList = groups ?? [];
  const selectedGroup = useMemo(
    () => groupList.find((group: any) => String(group.id) === selectedGroupId) ?? null,
    [groupList, selectedGroupId],
  );

  useEffect(() => {
    if (!selectedGroupId && groupList.length > 0) {
      setSelectedGroupId(String(groupList[0].id));
    }
  }, [groupList, selectedGroupId]);

  useEffect(() => {
    setDraftShape(readMapShape(selectedGroup?.mapShape ?? null));
  }, [selectedGroup?.id, selectedGroup?.mapShape]);

  const renderedGroups = groupList
    .map((group: any) => {
      const shape = String(group.id) === selectedGroupId
        ? (draftShape && isValidShape(draftShape) ? draftShape : null)
        : readMapShape(group.mapShape);
      return shape ? { group, shape } : null;
    })
    .filter(Boolean) as Array<{ group: any; shape: MapShape }>;

  const canEdit = permissions.canUpdate;
  const canSave = Boolean(canEdit && selectedGroup && (draftShape === null || isValidShape(draftShape)));
  const imageUrl = mapImage?.url ?? null;

  useEffect(() => {
    const element = frameRef.current;
    if (!element) return;
    const updateSize = () => {
      setFrameSize({ width: element.clientWidth, height: element.clientHeight });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setZoom(1);
  }, [imageUrl]);

  const stageSize = useMemo(() => {
    const availableWidth = Math.max(1, frameSize.width - FRAME_PADDING);
    const availableHeight = Math.max(1, frameSize.height - FRAME_PADDING);
    const frameAspect = availableWidth / availableHeight;
    const baseWidth = frameAspect > imageAspect ? availableHeight * imageAspect : availableWidth;
    const baseHeight = frameAspect > imageAspect ? availableHeight : availableWidth / imageAspect;
    return {
      width: Math.max(1, baseWidth * zoom),
      height: Math.max(1, baseHeight * zoom),
    };
  }, [frameSize, imageAspect, zoom]);

  const scrollerSize = useMemo(() => ({
    width: Math.max(frameSize.width, stageSize.width + FRAME_PADDING),
    height: Math.max(frameSize.height, stageSize.height + FRAME_PADDING),
  }), [frameSize, stageSize]);

  function updateZoom(nextZoom: number) {
    setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom)));
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (!/^image\/(jpeg|jpg|png|webp)$/.test(file.type)) {
      toast.error(t("farmMap.invalidImage"));
      return;
    }
    if (file.size > FARM_MAP_MAX_BYTES) {
      toast.error(t("farmMap.imageTooLarge"));
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      await setFarmMapImage.mutateAsync({ dataUrl });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handlePointerDown(event: PointerEvent<SVGSVGElement>) {
    if (!canEdit || !selectedGroup || mode !== "rect") return;
    const point = pointFromEvent(event, svgRef.current);
    if (!point) return;
    dragStartRef.current = point;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraftShape({ type: "rect", x: point.x, y: point.y, width: 0, height: 0 });
  }

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    if (!dragStartRef.current || mode !== "rect") return;
    const point = pointFromEvent(event, svgRef.current);
    if (!point) return;
    const start = dragStartRef.current;
    setDraftShape({
      type: "rect",
      x: Math.min(start.x, point.x),
      y: Math.min(start.y, point.y),
      width: Math.abs(point.x - start.x),
      height: Math.abs(point.y - start.y),
    });
  }

  function handlePointerUp(event: PointerEvent<SVGSVGElement>) {
    if (dragStartRef.current) {
      dragStartRef.current = null;
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Pointer capture may already be released by the browser.
      }
    }
  }

  function handleCanvasClick(event: MouseEvent<SVGSVGElement>) {
    if (!canEdit || !selectedGroup || mode !== "polygon") return;
    const point = pointFromEvent(event, svgRef.current);
    if (!point) return;
    setDraftShape((current) => {
      if (current?.type === "polygon") return { type: "polygon", points: [...current.points, point] };
      return { type: "polygon", points: [point] };
    });
  }

  function undoPoint() {
    setDraftShape((current) => {
      if (current?.type !== "polygon") return current;
      const points = current.points.slice(0, -1);
      return points.length ? { type: "polygon", points } : null;
    });
  }

  function saveShape() {
    if (!selectedGroup || !canSave) return;
    updateGroup.mutate({ id: selectedGroup.id, mapShape: draftShape });
  }

  return (
    <div className="flex h-full min-h-[calc(100vh-5rem)] flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-col gap-3 border-b pb-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <MapPinned className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-semibold tracking-tight">{t("farmMap.title")}</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{t("farmMap.subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(event) => handleFile(event.target.files?.[0])}
          />
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => fileInputRef.current?.click()}
            disabled={!canEdit || uploading || setFarmMapImage.isPending}
          >
            <Upload className="h-4 w-4" />
            {uploading || setFarmMapImage.isPending ? t("farmMap.uploading") : t("farmMap.upload")}
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => removeFarmMapImage.mutate()}
            disabled={!canEdit || !mapImage?.key || removeFarmMapImage.isPending}
            title={t("farmMap.removeImage")}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-h-0 rounded-lg border bg-card p-3 shadow-xs">
          <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="grid gap-2 md:min-w-72">
              <Label>{t("farmMap.group")}</Label>
              <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("farmMap.selectGroup")} />
                </SelectTrigger>
                <SelectContent>
                  {groupList.map((group: any) => (
                    <SelectItem key={group.id} value={String(group.id)}>
                      {group.groupCode ? `${group.groupCode} - ${group.name}` : group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ToggleGroup
                type="single"
                value={mode}
                onValueChange={(value) => value && setMode(value as DrawMode)}
                variant="outline"
                className="bg-background"
                disabled={!canEdit}
              >
                <ToggleGroupItem value="select" aria-label={t("farmMap.selectMode")}>
                  <MousePointer2 className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="rect" aria-label={t("farmMap.rectangleMode")}>
                  <Square className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="polygon" aria-label={t("farmMap.polygonMode")}>
                  <Pentagon className="h-4 w-4" />
                </ToggleGroupItem>
              </ToggleGroup>
              <div className="flex items-center rounded-md border bg-background">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => updateZoom(zoom - ZOOM_STEP)}
                  disabled={!imageUrl || zoom <= MIN_ZOOM}
                  title={t("farmMap.zoomOut")}
                  className="h-9 w-9 rounded-r-none"
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="min-w-14 px-2 text-center text-sm font-medium tabular-nums">
                  {Math.round(zoom * 100)}%
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => updateZoom(zoom + ZOOM_STEP)}
                  disabled={!imageUrl || zoom >= MAX_ZOOM}
                  title={t("farmMap.zoomIn")}
                  className="h-9 w-9 rounded-none"
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => updateZoom(1)}
                  disabled={!imageUrl || zoom === 1}
                  title={t("farmMap.resetZoom")}
                  className="h-9 w-9 rounded-l-none"
                >
                  <Maximize2 className="h-4 w-4" />
                </Button>
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={undoPoint}
                disabled={!canEdit || draftShape?.type !== "polygon" || draftShape.points.length === 0}
                title={t("farmMap.undoPoint")}
              >
                <Undo2 className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setDraftShape(null)}
                disabled={!canEdit || !selectedGroup || !draftShape}
                title={t("farmMap.clearZone")}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <Button className="gap-2" onClick={saveShape} disabled={!canSave || updateGroup.isPending}>
                <Save className="h-4 w-4" />
                {t("common.save")}
              </Button>
            </div>
          </div>

          <div ref={frameRef} className="h-[360px] overflow-auto rounded-md bg-muted/50 md:h-[540px]">
            {imageLoading ? (
              <div className="flex h-full items-center justify-center">
                <div className="h-12 w-12 animate-pulse rounded-full bg-muted" />
              </div>
            ) : imageUrl ? (
              <div
                className="flex items-center justify-center p-4"
                style={{ minWidth: scrollerSize.width, minHeight: scrollerSize.height }}
              >
                <div
                  className="relative shrink-0 overflow-hidden rounded-md bg-background shadow-sm"
                  style={{ width: stageSize.width, height: stageSize.height }}
                >
                  <img
                    src={imageUrl}
                    alt={t("farmMap.imageAlt")}
                    className="absolute inset-0 h-full w-full object-fill"
                    onLoad={(event) => {
                      const image = event.currentTarget;
                      if (image.naturalWidth && image.naturalHeight) {
                        setImageAspect(image.naturalWidth / image.naturalHeight);
                      }
                    }}
                  />
                  <svg
                    ref={svgRef}
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    className="absolute inset-0 h-full w-full touch-none"
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                    onClick={handleCanvasClick}
                  >
                    {renderedGroups.map(({ group, shape }) => (
                      <ZoneShape
                        key={group.id}
                        group={group}
                        shape={shape}
                        selected={String(group.id) === selectedGroupId}
                        onSelect={() => setSelectedGroupId(String(group.id))}
                      />
                    ))}
                    {draftShape?.type === "polygon" && draftShape.points.length > 0 && (
                      <polyline
                        points={draftShape.points.map((point) => `${point.x * 100},${point.y * 100}`).join(" ")}
                        fill="none"
                        stroke="#111827"
                        strokeWidth={0.5}
                        strokeDasharray="1.4 1.1"
                        vectorEffect="non-scaling-stroke"
                      />
                    )}
                  </svg>
                </div>
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
                <ImageIcon className="h-12 w-12" />
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!canEdit}
                >
                  <Upload className="h-4 w-4" />
                  {t("farmMap.upload")}
                </Button>
              </div>
            )}
          </div>
        </div>

        <aside className="min-h-0 rounded-lg border bg-card p-3 shadow-xs">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">{t("farmMap.zones")}</h2>
            <Badge variant="outline">{renderedGroups.length}/{groupList.length}</Badge>
          </div>
          <div className="max-h-[calc(100vh-12rem)] space-y-2 overflow-y-auto pr-1">
            {groupsLoading ? (
              <div className="space-y-2">
                <div className="h-12 animate-pulse rounded-md bg-muted" />
                <div className="h-12 animate-pulse rounded-md bg-muted" />
              </div>
            ) : (
              groupList.map((group: any) => {
                const mapped = Boolean(readMapShape(group.mapShape));
                const selected = String(group.id) === selectedGroupId;
                const color = zoneColor(group.id, group.color);
                return (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => setSelectedGroupId(String(group.id))}
                    className={`flex w-full items-center gap-3 rounded-md border p-3 text-left transition-colors ${
                      selected ? "border-primary bg-primary/5" : "bg-background hover:bg-muted/60"
                    }`}
                  >
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: color.stroke }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{group.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{group.groupCode ?? t("common.none")}</span>
                    </span>
                    <Badge variant={mapped ? "default" : "outline"}>{mapped ? t("farmMap.mapped") : t("farmMap.unmapped")}</Badge>
                  </button>
                );
              })
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
