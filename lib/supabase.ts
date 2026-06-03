import { createClient } from "@supabase/supabase-js";

// Server-side client using the service role key. Only ever import this from
// API routes - never from client components.
export function createServerSupabase() {
  const url =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secretKey) {
    throw new Error(
      "SUPABASE_URL und SUPABASE_SECRET_KEY müssen in .env.local gesetzt sein"
    );
  }
  return createClient(url, secretKey, {
    auth: { persistSession: false },
    global: {
      // Next.js patches fetch with caching defaults inside route handlers -
      // data must always be read fresh (e.g. status after close/reopen).
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
}
