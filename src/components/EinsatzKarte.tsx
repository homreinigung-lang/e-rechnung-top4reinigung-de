import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect } from "react";

export type MapPoint = {
  id: string;
  kind: "customer" | "project" | "assignment";
  title: string;
  subtitle: string;
  address: string;
  lat: number;
  lon: number;
};

const COLORS: Record<MapPoint["kind"], string> = {
  customer: "#0f766e",
  project: "#7c3aed",
  assignment: "#ea580c",
};

function pinIcon(kind: MapPoint["kind"]) {
  const color = COLORS[kind];
  return L.divIcon({
    className: "",
    html: `<span style="display:block;width:20px;height:20px;border-radius:9999px;background:${color};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></span>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

/** Passt den Kartenausschnitt an alle Marker an. */
function FitBounds({ points }: { points: MapPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lon] as [number, number]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
  }, [map, points]);
  return null;
}

export default function EinsatzKarte({ points }: { points: MapPoint[] }) {
  return (
    <MapContainer
      center={[51.1657, 10.4515]}
      zoom={6}
      scrollWheelZoom
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds points={points} />
      {points.map((p) => (
        <Marker key={p.id} position={[p.lat, p.lon]} icon={pinIcon(p.kind)}>
          <Popup>
            <div className="space-y-1">
              <div className="font-semibold">{p.title}</div>
              <div>{p.subtitle}</div>
              <div className="text-xs opacity-70">{p.address}</div>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
