import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { storedLineup } from "@/lib/roles";

// Never cache: participants must immediately see status changes (open/closed).
export const dynamic = "force-dynamic";

// Public doodle info for the participant page (no participant names,
// no plan, no password hash). The lineup tells the page which roles to offer.
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServerSupabase();
  const { data: doodle, error } = await supabase
    .from("doodles")
    .select("id, title, status, dates, config")
    .eq("id", params.id)
    .single();
  if (error || !doodle)
    return NextResponse.json(
      { error: "Doodle nicht gefunden" },
      { status: 404 }
    );

  return NextResponse.json({
    ...doodle,
    config: storedLineup(doodle.config),
  });
}
