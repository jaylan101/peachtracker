import type { NextConfig } from "next";

// Build: 2026-04-17 04:42 — serious dark maintenance splash with canvas particle network
// MULBERRY_ENABLED=true
// Public Supabase config — the anon (publishable) key is designed to ship to
// browsers, so committing it is safe. RLS gates all writes.
// Env vars still take precedence if set; these are fallbacks so Vercel
// previews work without manual env config.
const SUPABASE_URL = "https://cumbgmkiaoxvdyufohan.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_X-R4u-ZN4a0NlBDkGnVGkA_M_5zPBdf";

const config: NextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_SUPABASE_URL:
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? SUPABASE_ANON_KEY,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
  // Ensure the Mulberry knowledge base JSONL ships with the serverless bundle.
  // Without this, readFile() at runtime can't find web/data/knowledge-chunks.jsonl.
  outputFileTracingIncludes: {
    "/api/mulberry/reingest": ["./data/knowledge-chunks.jsonl"],
    "/admin/mulberry": ["./data/knowledge-chunks.jsonl"],
  },
};

export default config;
