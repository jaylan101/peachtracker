"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { FeatureCollection, Feature, Polygon, MultiPolygon } from "geojson";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface DistrictLayer {
  id: string;
  label: string;
  file: string;
  color: string;
  strokeColor: string;
  nameKey: string;
  detailKeys?: string[];
  popupFn?: (props: Record<string, unknown>) => string;
}

interface MatchResult {
  layerLabel: string;
  districtName: string;
  color: string;
  details: Record<string, string>;
}

/* ------------------------------------------------------------------ */
/*  Layer definitions                                                   */
/* ------------------------------------------------------------------ */
const LAYERS: DistrictLayer[] = [
  {
    id: "commission",
    label: "Commission",
    file: "/districts/commission.geojson",
    color: "#E0956E",
    strokeColor: "#C47A52",
    nameKey: "NAME",
    detailKeys: ["REPNAME1"],
    popupFn: (p) => {
      const name = p.NAME as string ?? "Unknown";
      const rep = p.REPNAME1 as string;
      return rep
        ? `<strong style="font-family:Outfit,sans-serif;font-size:14px">${name}</strong><br><span style="font-size:12px;color:#87817A">Commissioner: ${rep}</span>`
        : `<strong style="font-family:Outfit,sans-serif;font-size:14px">${name}</strong>`;
    },
  },
  {
    id: "congressional",
    label: "Congressional",
    file: "/districts/congressional.geojson",
    color: "#5E9470",
    strokeColor: "#4A7859",
    nameKey: "NAME",
  },
  {
    id: "state-senate",
    label: "State Senate",
    file: "/districts/state-senate.geojson",
    color: "#7B93C1",
    strokeColor: "#5E76A4",
    nameKey: "NAME",
  },
  {
    id: "state-house",
    label: "State House",
    file: "/districts/state-house.geojson",
    color: "#C4A054",
    strokeColor: "#A88638",
    nameKey: "NAME",
  },
  {
    id: "water-authority",
    label: "Water Authority",
    file: "/districts/water-authority.geojson",
    color: "#5AAFCC",
    strokeColor: "#3D8FA8",
    nameKey: "NAME",
  },
  {
    id: "boe",
    label: "School Board",
    file: "/districts/boe.geojson",
    color: "#D16BA5",
    strokeColor: "#B54E89",
    nameKey: "NAME",
    detailKeys: ["BoardMember"],
    popupFn: (p) => {
      const name = p.NAME as string ?? "Unknown";
      const member = p.BoardMember as string;
      return `<div style="font-family:Outfit,sans-serif">
        <span style="font-size:11px;color:#87817A;text-transform:uppercase;letter-spacing:0.08em;font-weight:700">Bibb County School District</span>
        <br><strong style="font-size:14px">${name}</strong>
        ${member ? `<br><span style="font-size:12px;color:#87817A">${member}</span>` : ""}
        <br><span style="font-size:11px;color:#aaa;margin-top:4px;display:inline-block">At-Large: Mr. Daryl J. Morton (Post 7) \u00B7 Dr. Lisa W. Garrett-Boyd (Post 8)</span>
      </div>`;
    },
  },
  {
    id: "school-zones",
    label: "School Zones",
    file: "/districts/school-zones.geojson",
    color: "#A87BC1",
    strokeColor: "#8C5FA5",
    nameKey: "NAME",
    popupFn: (p) => {
      const elem = p.NAME as string ?? "";
      const mid = p.NAMEMID as string ?? "";
      const high = p.NAMEHIGH as string ?? "";
      return `<div style="font-family:Outfit,sans-serif">
        <span style="font-size:11px;color:#87817A;text-transform:uppercase;letter-spacing:0.08em;font-weight:700">Bibb County School District</span>
        <br><strong style="font-size:14px">${elem}</strong>
        ${mid ? `<br><span style="font-size:12px;color:#87817A">Middle: ${mid}</span>` : ""}
        ${high ? `<br><span style="font-size:12px;color:#87817A">High: ${high}</span>` : ""}
      </div>`;
    },
  },
];

/* Center of Macon-Bibb */
const MACON_CENTER: [number, number] = [32.8407, -83.6324];
const DEFAULT_ZOOM = 11;

/* ------------------------------------------------------------------ */
/*  Inject Leaflet CSS via <link> tag (require() doesn't work in Next) */
/* ------------------------------------------------------------------ */
function useLeafletCSS() {
  useEffect(() => {
    const id = "leaflet-css";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    link.crossOrigin = "";
    document.head.appendChild(link);
  }, []);
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
export default function DistrictMap() {
  useLeafletCSS();

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const layerGroups = useRef<Record<string, L.GeoJSON>>({});
  const geoData = useRef<Record<string, FeatureCollection>>({});
  const [ready, setReady] = useState(false);

  const [active, setActive] = useState<Set<string>>(new Set(["commission"]));
  const [address, setAddress] = useState("");
  const [searching, setSearching] = useState(false);
  const [matches, setMatches] = useState<MatchResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  /* ---- Initialize Leaflet ---- */
  useEffect(() => {
    if (mapInstance.current || !mapRef.current) return;

    // Small delay to let CSS load
    const timer = setTimeout(() => {
      const L = require("leaflet") as typeof import("leaflet");

      const map = L.map(mapRef.current!, {
        center: MACON_CENTER,
        zoom: DEFAULT_ZOOM,
        zoomControl: true,
        attributionControl: true,
      });

      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
        {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · <a href="https://carto.com/">CARTO</a>',
          subdomains: "abcd",
          maxZoom: 19,
        },
      ).addTo(map);

      mapInstance.current = map;

      // Load all GeoJSON
      LAYERS.forEach(async (layer) => {
        try {
          const res = await fetch(layer.file);
          if (!res.ok) return;
          const fc: FeatureCollection = await res.json();
          geoData.current[layer.id] = fc;

          const gj = L.geoJSON(fc, {
            style: {
              fillColor: layer.color,
              fillOpacity: 0.25,
              color: layer.strokeColor,
              weight: 2,
              opacity: 0.85,
            },
            onEachFeature: (feature, lyr) => {
              const popup = layer.popupFn
                ? layer.popupFn(feature.properties ?? {})
                : `<strong style="font-family:Outfit,sans-serif;font-size:14px">${feature.properties?.[layer.nameKey] ?? "Unknown"}</strong>`;
              (lyr as L.Layer).bindPopup(popup);
            },
          });

          layerGroups.current[layer.id] = gj;

          if (layer.id === "commission") {
            gj.addTo(map);
          }
        } catch {
          /* skip */
        }
      });

      setReady(true);

      // Force a resize after mount so tiles render correctly
      setTimeout(() => map.invalidateSize(), 100);
    }, 150);

    return () => {
      clearTimeout(timer);
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- Sync active layers ---- */
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;
    LAYERS.forEach((layer) => {
      const lg = layerGroups.current[layer.id];
      if (!lg) return;
      if (active.has(layer.id)) {
        if (!map.hasLayer(lg)) map.addLayer(lg);
      } else {
        if (map.hasLayer(lg)) map.removeLayer(lg);
      }
    });
  }, [active, ready]);

  /* ---- Toggle ---- */
  const toggle = useCallback((id: string) => {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /* ---- Address lookup (via our API route to avoid CORS) ---- */
  const handleSearch = useCallback(
    async (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      if (!address.trim()) return;
      setSearching(true);
      setError(null);
      setMatches(null);

      try {
        const res = await fetch(
          `/api/geocode?address=${encodeURIComponent(address.trim())}`,
        );
        const data = await res.json();

        const match = data?.result?.addressMatches?.[0];
        if (!match) {
          setError(
            "Address not found. Try including the city \u2014 e.g. \"123 Main St, Macon, GA\"",
          );
          setSearching(false);
          return;
        }

        const lng = match.coordinates.x;
        const lat = match.coordinates.y;
        const pt = point([lng, lat]);

        // Drop marker
        const L = require("leaflet") as typeof import("leaflet");
        if (markerRef.current) markerRef.current.remove();

        const icon = L.divIcon({
          className: "peach-marker",
          html: `<div style="width:18px;height:18px;background:#E0956E;border:3px solid #2A2725;border-radius:50%;box-shadow:0 0 0 3px rgba(224,149,110,0.35)"></div>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        });
        markerRef.current = L.marker([lat, lng], { icon }).addTo(
          mapInstance.current!,
        );
        mapInstance.current!.flyTo([lat, lng], 13, { duration: 0.8 });

        // Point-in-polygon for every loaded layer
        const results: MatchResult[] = [];
        LAYERS.forEach((layer) => {
          const fc = geoData.current[layer.id];
          if (!fc) return;
          fc.features.forEach((feature: Feature) => {
            try {
              if (
                booleanPointInPolygon(
                  pt,
                  feature as Feature<Polygon | MultiPolygon>,
                )
              ) {
                const name =
                  feature.properties?.[layer.nameKey] ?? "Unknown";
                const details: Record<string, string> = {};
                layer.detailKeys?.forEach((k) => {
                  if (feature.properties?.[k])
                    details[k] = feature.properties[k];
                });
                // For school zones, include middle/high info
                if (layer.id === "school-zones") {
                  if (feature.properties?.NAMEMID)
                    details.NAMEMID = feature.properties.NAMEMID;
                  if (feature.properties?.NAMEHIGH)
                    details.NAMEHIGH = feature.properties.NAMEHIGH;
                }
                results.push({
                  layerLabel: layer.label,
                  districtName: name,
                  color: layer.color,
                  details,
                });
              }
            } catch {
              /* skip */
            }
          });
        });



        setMatches(results);
      } catch {
        setError("Something went wrong with the lookup. Please try again.");
      }
      setSearching(false);
    },
    [address],
  );

  /* ---- Render ---- */
  return (
    <div>
      {/* Search bar */}
      <form onSubmit={handleSearch} style={{ marginBottom: 20 }}>
        <div
          style={{
            display: "flex",
            gap: 0,
            border: "2px solid var(--text)",
            background: "var(--card)",
          }}
        >
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Enter your address — e.g. 700 Poplar St, Macon, GA"
            style={{
              flex: 1,
              padding: "14px 18px",
              border: "none",
              outline: "none",
              fontFamily: "inherit",
              fontSize: "var(--body)",
              color: "var(--text)",
              background: "transparent",
            }}
          />
          <button
            type="submit"
            disabled={searching}
            style={{
              padding: "14px 28px",
              background: "var(--peach)",
              color: "#fff",
              fontWeight: 700,
              fontSize: "var(--kicker)",
              textTransform: "uppercase",
              letterSpacing: "0.14em",
              border: "none",
              borderLeft: "2px solid var(--text)",
              cursor: searching ? "wait" : "pointer",
              fontFamily: "inherit",
              whiteSpace: "nowrap",
            }}
          >
            {searching ? "Searching\u2026" : "Find my districts"}
          </button>
        </div>
      </form>

      {/* Error */}
      {error && (
        <div
          style={{
            padding: "14px 18px",
            background: "#FDF0E8",
            border: "1.5px solid var(--peach-pastel)",
            marginBottom: 16,
            fontSize: "var(--body)",
            color: "var(--text)",
          }}
        >
          {error}
        </div>
      )}

      {/* Results cards */}
      {matches && matches.length > 0 && (
        <>
        <div
          style={{
            fontSize: "var(--micro)",
            color: "var(--text-light)",
            fontWeight: 500,
            marginBottom: 10,
          }}
        >
          Use the toggles below the map to view any of these districts on the map.
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: "1.5px",
            background: "var(--border)",
            border: "1.5px solid var(--border)",
            marginBottom: 20,
          }}
        >
          {matches.map((m, i) => (
            <div
              key={i}
              style={{ padding: "16px 18px", background: "var(--card)" }}
            >
              <div
                style={{
                  fontSize: "var(--kicker)",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.14em",
                  color: m.color,
                  marginBottom: 6,
                }}
              >
                {m.layerLabel}
              </div>
              <div
                style={{
                  fontWeight: 800,
                  fontSize: "1.05rem",
                  letterSpacing: "-0.015em",
                  color: "var(--text)",
                  lineHeight: 1.3,
                }}
              >
                {m.districtName}
              </div>
              {m.details.REPNAME1 && (
                <div
                  style={{
                    fontSize: "var(--micro)",
                    color: "var(--text-secondary)",
                    marginTop: 4,
                    fontWeight: 500,
                  }}
                >
                  Commissioner: {m.details.REPNAME1}
                </div>
              )}
              {m.details.BoardMember && (
                <>
                  <div
                    style={{
                      fontSize: "var(--micro)",
                      color: "var(--text-secondary)",
                      marginTop: 4,
                      fontWeight: 500,
                    }}
                  >
                    {m.details.BoardMember}
                  </div>
                  <div
                    style={{
                      fontSize: "var(--micro)",
                      color: "var(--text-light)",
                      marginTop: 4,
                      fontWeight: 500,
                    }}
                  >
                    At-Large: Mr. Daryl J. Morton (Post 7) &middot; Dr. Lisa W.
                    Garrett-Boyd (Post 8)
                  </div>
                </>
              )}
              {m.layerLabel === "School Zones" && (
                <div
                  style={{
                    fontSize: "var(--micro)",
                    color: "var(--text-secondary)",
                    marginTop: 4,
                    fontWeight: 500,
                  }}
                >
                  District: Bibb County School District
                </div>
              )}
              {m.details.NAMEMID && (
                <div
                  style={{
                    fontSize: "var(--micro)",
                    color: "var(--text-secondary)",
                    marginTop: 4,
                    fontWeight: 500,
                  }}
                >
                  Middle: {m.details.NAMEMID}
                </div>
              )}
              {m.details.NAMEHIGH && (
                <div
                  style={{
                    fontSize: "var(--micro)",
                    color: "var(--text-secondary)",
                    marginTop: 4,
                    fontWeight: 500,
                  }}
                >
                  High: {m.details.NAMEHIGH}
                </div>
              )}
            </div>
          ))}
        </div>
        </>
      )}

      {matches && matches.length === 0 && (
        <div
          style={{
            padding: "14px 18px",
            background: "var(--green-bg)",
            border: "1.5px solid var(--green-pastel)",
            marginBottom: 16,
            fontSize: "var(--body)",
            color: "var(--text)",
          }}
        >
          We found your location, but it doesn&rsquo;t fall within any of our
          mapped Macon-Bibb districts. It may be outside the county boundary.
        </div>
      )}

      {/* Layer toggles */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 16,
        }}
      >
        {LAYERS.map((layer) => {
          const isActive = active.has(layer.id);
          return (
            <button
              key={layer.id}
              onClick={() => toggle(layer.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 16px",
                border: isActive
                  ? `2px solid ${layer.strokeColor}`
                  : "2px solid var(--border)",
                background: isActive ? layer.color + "18" : "var(--card)",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: "var(--kicker)",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                color: isActive ? layer.strokeColor : "var(--text-secondary)",
                transition: "all 150ms ease",
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  width: 12,
                  height: 12,
                  background: isActive ? layer.color : "var(--border)",
                  border: `2px solid ${isActive ? layer.strokeColor : "var(--text-light)"}`,
                  flexShrink: 0,
                }}
              />
              {layer.label}
            </button>
          );
        })}
      </div>

      {/* Map container */}
      <div
        ref={mapRef}
        style={{
          width: "100%",
          height: 520,
          border: "2px solid var(--text)",
          background: "var(--card)",
        }}
      />

      {/* Source note */}
      <div
        style={{
          fontSize: "var(--micro)",
          color: "var(--text-light)",
          marginTop: 10,
          fontWeight: 500,
          lineHeight: 1.5,
        }}
      >
        District boundaries: Commission &amp; Water Authority districts via
        Macon-Bibb County GIS · Congressional, State Senate, State House
        districts via U.S. Census Bureau TIGER/Line · BOE districts &amp;
        school attendance zones via Macon-Bibb County GIS. Address lookup
        powered by the Census Geocoder.
      </div>
    </div>
  );
}
