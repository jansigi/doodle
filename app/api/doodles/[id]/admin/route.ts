import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createServerSupabase } from "@/lib/supabase";
import {
  collectPlanWarnings,
  generatePlan,
  planForDates,
} from "@/lib/planner";
import { normalizePlan, normalizeRoles } from "@/lib/migrate";
import { storedLineup } from "@/lib/roles";
import { parseDates } from "@/lib/dates";
import type { Participant, Plan } from "@/lib/types";

type AdminAction =
  | "login"
  | "close"
  | "reopen"
  | "regenerate"
  | "updatePlan"
  | "updateDates"
  | "updateTitle"
  | "deleteParticipant";

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

  const config = storedLineup(doodle.config);
  let dates: string[] = doodle.dates;

  if (action === "deleteParticipant") {
    const participantName: string = (body.participantName ?? "").trim();
    if (!participantName)
      return NextResponse.json({ error: "Name fehlt" }, { status: 400 });
    const { error } = await supabase
      .from("participants")
      .delete()
      .eq("doodle_id", params.id)
      .eq("name", participantName);
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: participantRows } = await supabase
    .from("participants")
    .select("*")
    .eq("doodle_id", params.id)
    .order("name");
  const participants = (participantRows ?? []).map((row) => ({
    ...(row as Participant),
    roles: normalizeRoles((row as Participant).roles as string[], config),
  }));

  const updates: Record<string, unknown> = {};

  if (action === "updateTitle") {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title)
      return NextResponse.json({ error: "Titel fehlt" }, { status: 400 });
    updates.title = title;
  } else if (action === "updateDates") {
    const parsed = parseDates(body.dates);
    if ("error" in parsed)
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    dates = parsed.dates;
    updates.dates = dates;
    // The plan follows the dates right away, so it never shows a removed
    // date or lacks a row for a new one.
    const existingPlan = normalizePlan(doodle.plan, config);
    if (existingPlan) {
      const plan = planForDates(existingPlan, dates, config);
      updates.plan = plan;
      updates.warnings = collectPlanWarnings(dates, participants, plan, config);
    }
  } else if (action === "regenerate") {
    const { plan, warnings } = generatePlan(
      dates,
      participants,
      config
    );
    updates.plan = plan;
    updates.warnings = warnings;
  } else if (action === "close") {
    updates.status = "closed";
    const existingPlan = normalizePlan(doodle.plan, config);
    if (existingPlan) {
      // Closing never touches an existing plan - only regenerating does.
      // Availabilities may have changed while the doodle was open, so the
      // hints are derived again from the unchanged plan.
      updates.warnings = collectPlanWarnings(
        dates,
        participants,
        existingPlan,
        config
      );
    } else {
      const { plan, warnings } = generatePlan(
        dates,
        participants,
        config
      );
      updates.plan = plan;
      updates.warnings = warnings;
    }
  } else if (action === "reopen") {
    updates.status = "open";
  } else if (action === "updatePlan") {
    const normalized = normalizePlan(body.plan, config);
    // A plan sent from an outdated page (e.g. the undo of a regeneration
    // after the dates changed) is fitted to the current dates.
    const updatedPlan = normalized && planForDates(normalized, dates, config);
    updates.plan = updatedPlan;
    // Hints always describe the stored plan, so they are derived again after
    // every manual change instead of being carried over.
    updates.warnings = updatedPlan
      ? collectPlanWarnings(dates, participants, updatedPlan, config)
      : [];
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
      title: (updates.title as string) ?? doodle.title,
      status: (updates.status as string) ?? doodle.status,
      dates,
      config,
      plan: normalizePlan((updates.plan as Plan) ?? doodle.plan, config),
      warnings: (updates.warnings as string[]) ?? doodle.warnings,
    },
    participants: participants.map((participant) => ({
      name: participant.name,
      roles: participant.roles,
      can_md: participant.can_md,
      max_per_month: participant.max_per_month,
      availability: participant.availability,
    })),
  });
}
