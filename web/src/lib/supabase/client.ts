// Browser Supabase client — used in client components (e.g. the realtime-subscribed
// race card). Reads the anon key, which is safe to ship to the browser because
// RLS restricts writes to authenticated users.
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
