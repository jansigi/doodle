import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createServerSupabase } from "@/lib/supabase";
import { generatePlan } from "@/lib/planner";
import type { Participant, Plan } from "@/lib/types";

type AdminAction = "login" | "close" | "reopen" | "regenerate" | "updatePlan";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await request.json();
  const password: string = body.password ?? "";
  const action: AdminAction = body.action ?? "login";

  const supabase = createServerSupabase();
  const { data: doodle } = await supabase
    .from("doodles")
    .select("*")
    .eq("id", params.id)
    .single();
  if (!doodle)
    return NextResponse.json(
      { error: "Doodle nicht gefunden" },
      { status: 404 }
    );

  const passwordValid = await bcrypt.compare(password, doodle.password_hash);
  if (!passwordValid)
    return NextResponse.json({ error: "Falsches Passwort" }, { status: 401 });

  const { data: participantRows } = await supabase
    .from("participants")
    .select("*")
    .eq("doodle_id", params.id)
    .order("name");
  const participants = (participantRows ?? []) as Participant[];

  const updates: Record<string, unknown> = {};

  if (action === "close" || action === "regenerate") {
    const { plan, warnings } = generatePlan(doodle.dates, participants);
    updates.plan = plan;
    updates.warnings = warnings;
    if (action === "close") updates.status = "closed";
  } else if (action === "reopen") {
    updates.status = "open";
  } else if (action === "updatePlan") {
    updates.plan = body.plan as Plan;
    updates.warnings = body.warnings ?? doodle.warnings;
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase
      .from("doodles")
      .update(updates)
      .eq("id", params.id);
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    doodle: {
      id: doodle.id,
      title: doodle.title,
      status: (updates.status as string) ?? doodle.status,
      dates: doodle.dates,
      plan: (updates.plan as Plan) ?? doodle.plan,
      warnings: (updates.warnings as string[]) ?? doodle.warnings,
    },
    participants: participants.map((participant) => ({
      name: participant.name,
      roles: participant.roles,
      can_md: participant.can_md,
      availability: participant.availability,
    })),
  });
}
