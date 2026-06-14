import { MapView } from "./Map";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin } from "lucide-react";
import { useRef, useEffect } from "react";

declare global {
  interface Window {
    google?: typeof google;
  }
}

export function GroupMap() {
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);

  const { data: groups } = trpc.config.getGroups.useQuery();
  const { data: animals } = trpc.animals.list.useQuery({ isActive: true });

  const groupsWithCoords = (groups ?? []).filter(
    (g: any) => g.latitude && g.longitude
  );

  const getAnimalCount = (groupId: number) =>
    (animals ?? []).filter((a: any) => a.animal.groupId === groupId).length;

  const calculateCenter = () => {
    if (groupsWithCoords.length === 0) return { lat: 30.0, lng: 31.2 };
    const lat = groupsWithCoords.reduce((s: number, g: any) => s + parseFloat(g.latitude), 0) / groupsWithCoords.length;
    const lng = groupsWithCoords.reduce((s: number, g: any) => s + parseFloat(g.longitude), 0) / groupsWithCoords.length;
    return { lat, lng };
  };

  const onMapReady = (map: google.maps.Map) => {
    mapRef.current = map;
    renderMarkers(map);
  };

  const renderMarkers = (map: google.maps.Map) => {
    markersRef.current.forEach((m) => (m.map = null));
    markersRef.current = [];

    for (const group of groupsWithCoords) {
      const lat = parseFloat(group.latitude!);
      const lng = parseFloat(group.longitude!);
      const count = getAnimalCount(group.id);

      const markerContent = document.createElement("div");
      markerContent.style.cssText = `
        background: var(--primary, hsl(142 76% 36%));
        color: white;
        padding: 6px 10px;
        border-radius: 8px;
        font-size: 12px;
        font-weight: 600;
        white-space: nowrap;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        cursor: pointer;
      `;
      markerContent.textContent = `${group.groupCode}: ${count}`;

      const marker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: { lat, lng },
        title: `${group.name} (${count} animals)`,
        content: markerContent,
      });

      markersRef.current.push(marker);
    }
  };

  useEffect(() => {
    if (mapRef.current) {
      renderMarkers(mapRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, animals]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          Group Locations
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {!groups ? (
          <Skeleton className="h-[400px] w-full" />
        ) : groupsWithCoords.length === 0 ? (
          <div className="h-[400px] flex items-center justify-center text-muted-foreground text-sm">
            No groups with coordinates set. Add latitude/longitude to groups in Configuration.
          </div>
        ) : (
          <MapView
            className="h-[400px] rounded-b-lg"
            initialCenter={calculateCenter()}
            initialZoom={12}
            onMapReady={onMapReady}
          />
        )}
      </CardContent>
    </Card>
  );
}