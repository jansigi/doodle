import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";

// Cached responses would never reach the database.
export const dynamic = "force-dynamic";

// Called by the Vercel cron jobs in vercel.json. Supabase pauses free
// projects after a week with hardly any database queries, which happens
// between semesters. A tiny read a few times a day keeps the project awake.
export async function GET(request: NextRequest) {
  // Vercel sends CRON_SECRET as a bearer token once the variable is set. The
  // endpoint returns no data, so without the variable it stays open instead
  // of silently failing every ping.
  const cronSecret = process.env.CRON_SECRET;
  if (
    cronSecret &&
    request.headers.get("authorization") !== `Bearer ${cronSecret}`
  )
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServerSupabase();
  const { error } = await supabase.from("doodles").select("id").limit(1);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
