import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";

// Never cache: participants must immediately see status changes (open/closed).
export const dynamic = "force-dynamic";

// Public doodle info for the participant page (no participant names,
// no plan, no password hash).
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServerSupabase();
  const { data: doodle, error } = await supabase
    .from("doodles")
    .select("id, title, status, dates")
    .eq("id", params.id)
    .single();
  if (error || !doodle)
    return NextResponse.json(
      { error: "Doodle nicht gefunden" },
      { status: 404 }
    );

  return NextResponse.json(doodle);
}
