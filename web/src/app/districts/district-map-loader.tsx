"use client";

import dynamic from "next/dynamic";

// Leaflet can only run in the browser — no SSR.
// next/dynamic with ssr:false must live in a Client Component.
const DistrictMap = dynamic(() => import("./district-map"), { ssr: false });

export default function DistrictMapLoader() {
  return <DistrictMap />;
}
