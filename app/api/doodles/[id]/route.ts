import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";

// Public doodle info for the participant page (no plan, no password hash).
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

  const { data: participants } = await supabase
    .from("participants")
    .select("name")
    .eq("doodle_id", params.id)
    .order("name");

  return NextResponse.json({
    ...doodle,
    participantNames: (participants ?? []).map((entry) => entry.name),
  });
}
