import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // Allow candidate images from Supabase storage once we start using it
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
};

export default config;
