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
  color: string;        // fill
  strokeColor: string;  // border
  nameKey: string;      // property to use as display name
  detailKeys?: string[]; // extra props to show in popup
}

interface MatchResult {
  layerLabel: string;
  districtName: string;
  color: string;
  details: Record<string, string>;
}

/* ------------------------------------------------------------------ */
/*  Layer definitions — each points to a /districts/*.geojson file     */
/* ------------------------------------------------------------------ */
const LAYERS: DistrictLayer[] = [
  {
    id: "commission",
    label: "Commission Districts",
    file: "/districts/commission.geojson",
    color: "#E0956E",
    strokeColor: "#C47A52",
    nameKey: "NAME",
    detailKeys: ["REPNAME1"],
  },
  {
    id: "congressional",
    label: "Congressional Districts",
    file: "/districts/congressional.geojson",
    color: "#5E9470",
    strokeColor: "#4A7859",
    nameKey: "NAME",
  },
  {
    id: "state-senate",
    label: "State Senate Districts",
    file: "/districts/state-senate.geojson",
    color: "#7B93C1",
    strokeColor: "#5E76A4",
    nameKey: "NAME",
  },
  {
    id: "state-house",
    label: "State House Districts",
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
    id: "school",
    label: "School District",
    file: "/districts/school-district.geojson",
    color: "#A87BC1",
    strokeColor: "#8C5FA5",
    nameKey: "NAME",
  },
];

/* Center of Macon-Bibb */
const MACON_CENTER: [number, number] = [32.8407, -83.6324];
const DEFAULT_ZOOM = 11;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
export default function DistrictMap() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const layerGroups = useRef<Record<string, L.GeoJSON>>({}); // leaflet layer per id
  const geoData = useRef<Record<string, FeatureCollection>>({}); // raw geojson per id

  const [active, setActive] = useState<Set<string>>(new Set(["commission"]));
  const [address, setAddress] = useState("");
  const [searching, setSearching] = useState(false);
  const [matches, setMatches] = useState<MatchResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  /* ---- Initialize Leaflet (client-only) ---- */
  useEffect(() => {
    if (mapInstance.current) return;
    const L = require("leaflet") as typeof import("leaflet");
    require("leaflet/dist/leaflet.css");

    const map = L.map(mapRef.current!, {
      center: MACON_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: true,
      attributionControl: true,
    });

    // Light tile layer — keeps PeachTracker's clean aesthetic
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

    // Load all GeoJSON files
    LAYERS.forEach(async (layer) => {
      try {
        const res = await fetch(layer.file);
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
            const name =
              feature.properties?.[layer.nameKey] ?? "Unknown District";
            const rep = feature.properties?.REPNAME1;
            const popup = rep
              ? `<strong style="font-family:Outfit,sans-serif;font-size:14px">${name}</strong><br><span style="font-size:12px;color:#87817A">Commissioner: ${rep}</span>`
              : `<strong style="font-family:Outfit,sans-serif;font-size:14px">${name}</strong>`;
            (lyr as L.Layer).bindPopup(popup);
          },
        });

        layerGroups.current[layer.id] = gj;

        // Show commission by default
        if (layer.id === "commission") {
          gj.addTo(map);
        }
      } catch {
        console.warn(`Failed to load ${layer.file}`);
      }
    });

    return () => {
      map.remove();
      mapInstance.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- Sync active layers with map ---- */
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
  }, [active]);

  /* ---- Toggle helper ---- */
  const toggle = useCallback((id: string) => {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /* ---- Address lookup ---- */
  const handleSearch = useCallback(
    async (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      if (!address.trim()) return;
      setSearching(true);
      setError(null);
      setMatches(null);

      try {
        // Use Census Geocoder (free, no API key)
        const encoded = encodeURIComponent(address.trim());
        const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encoded}&benchmark=Public_AR_Current&format=json`;
        const res = await fetch(url);
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
                results.push({
                  layerLabel: layer.label,
                  districtName: name,
                  color: layer.color,
                  details,
                });
              }
            } catch {
              /* skip malformed geometries */
            }
          });
        });

        // Turn on all matched layers so user can see them
        if (results.length > 0) {
          const matchedIds = new Set<string>();
          results.forEach((r) => {
            const layer = LAYERS.find((l) => l.label === r.layerLabel);
            if (layer) matchedIds.add(layer.id);
          });
          setActive((prev) => new Set([...prev, ...matchedIds]));
        }

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
            {searching ? "Searching…" : "Find my districts"}
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
              style={{
                padding: "16px 18px",
                background: "var(--card)",
              }}
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
            </div>
          ))}
        </div>
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
        Macon-Bibb County GIS · Congressional, State Senate, State House &amp;
        School districts via U.S. Census Bureau TIGER/Line. Address lookup
        powered by the Census Geocoder.
      </div>
    </div>
  );
}
