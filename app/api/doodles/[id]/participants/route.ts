import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import type { Availability, Participant, RoleId } from "@/lib/types";
import { normalizePlan, normalizeRoles } from "@/lib/migrate";
import { collectPlanWarnings } from "@/lib/planner";
import { findRole, storedLineup } from "@/lib/roles";

// Load an existing entry by name so a participant can edit their answer.
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const name = request.nextUrl.searchParams.get("name")?.trim();
  if (!name)
    return NextResponse.json({ error: "Name fehlt" }, { status: 400 });

  const supabase = createServerSupabase();
  const { data: doodle } = await supabase
    .from("doodles")
    .select("config")
    .eq("id", params.id)
    .single();
  const { data: participant } = await supabase
    .from("participants")
    .select("name, roles, can_md, max_per_month, availability")
    .eq("doodle_id", params.id)
    .ilike("name", name)
    .maybeSingle();

  return NextResponse.json({
    participant: participant
      ? {
          ...participant,
          roles: normalizeRoles(
            participant.roles as string[],
            storedLineup(doodle?.config)
          ),
        }
      : null,
  });
}

// Delete a participant entry by name (only while the doodle is open).
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const name = request.nextUrl.searchParams.get("name")?.trim();
  if (!name)
    return NextResponse.json({ error: "Name fehlt" }, { status: 400 });

  const supabase = createServerSupabase();
  const { data: doodle } = await supabase
    .from("doodles")
    .select("status")
    .eq("id", params.id)
    .single();
  if (!doodle)
    return NextResponse.json(
      { error: "Doodle nicht gefunden" },
      { status: 404 }
    );
  if (doodle.status !== "open")
    return NextResponse.json(
      { error: "Dieses Doodle ist geschlossen" },
      { status: 409 }
    );

  const { error } = await supabase
    .from("participants")
    .delete()
    .eq("doodle_id", params.id)
    .ilike("name", name);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// Rename an entry (only while the doodle is open). A plan that already
// exists is renamed along with it, so it keeps pointing at the same person.
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await request.json();
  const name: string = (body.name ?? "").trim();
  const newName: string = (body.newName ?? "").trim();
  if (!name || !newName)
    return NextResponse.json({ error: "Name fehlt" }, { status: 400 });

  const supabase = createServerSupabase();
  const { data: doodle } = await supabase
    .from("doodles")
    .select("status, dates, config, plan")
    .eq("id", params.id)
    .single();
  if (!doodle)
    return NextResponse.json(
      { error: "Doodle nicht gefunden" },
      { status: 404 }
    );
  if (doodle.status !== "open")
    return NextResponse.json(
      { error: "Dieses Doodle ist geschlossen" },
      { status: 409 }
    );

  // Names are matched case-insensitively everywhere else, so "anna" may
  // not become a second "Anna". A case-only change of the own name is fine.
  const { data: taken } = await supabase
    .from("participants")
    .select("name")
    .eq("doodle_id", params.id)
    .ilike("name", newName);
  const conflict = (taken ?? []).find((row) => row.name !== name);
  if (conflict)
    return NextResponse.json(
      { error: `«${conflict.name}» hat sich schon eingetragen` },
      { status: 409 }
    );

  const { data: renamed, error } = await supabase
    .from("participants")
    .update({ name: newName })
    .eq("doodle_id", params.id)
    .eq("name", name)
    .select("name");
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  if (!renamed || renamed.length === 0)
    return NextResponse.json(
      { error: "Eintrag nicht gefunden" },
      { status: 404 }
    );

  const config = storedLineup(doodle.config);
  const plan = normalizePlan(doodle.plan, config);
  if (plan) {
    const renamedPlan = Object.fromEntries(
      Object.entries(plan).map(([date, assignment]) => [
        date,
        {
          slots: Object.fromEntries(
            Object.entries(assignment.slots).map(([roleId, names]) => [
              roleId,
              names.map((slotName) => (slotName === name ? newName : slotName)),
            ])
          ),
          md: assignment.md === name ? newName : assignment.md,
        },
      ])
    );
    // The hints quote names, so they are derived again for the new one.
    const { data: participantRows } = await supabase
      .from("participants")
      .select("*")
      .eq("doodle_id", params.id);
    const participants = (participantRows ?? []).map((row) => ({
      ...(row as Participant),
      roles: normalizeRoles((row as Participant).roles as string[], config),
    }));
    const { error: planError } = await supabase
      .from("doodles")
      .update({
        plan: renamedPlan,
        warnings: collectPlanWarnings(
          doodle.dates,
          participants,
          renamedPlan,
          config
        ),
      })
      .eq("id", params.id);
    if (planError)
      return NextResponse.json({ error: planError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, name: newName });
}

// Create or update a participant entry (upsert by doodle + name).
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await request.json();
  const name: string = (body.name ?? "").trim();
  const maxPerMonth: number | null =
    Number.isInteger(body.maxPerMonth) &&
    body.maxPerMonth >= 1 &&
    body.maxPerMonth <= 10
      ? body.maxPerMonth
      : null;
  const availability: Record<string, Availability> = body.availability ?? {};

  if (!name)
    return NextResponse.json({ error: "Name fehlt" }, { status: 400 });

  const supabase = createServerSupabase();
  const { data: doodle } = await supabase
    .from("doodles")
    .select("status, dates, config")
    .eq("id", params.id)
    .single();
  if (!doodle)
    return NextResponse.json(
      { error: "Doodle nicht gefunden" },
      { status: 404 }
    );
  if (doodle.status !== "open")
    return NextResponse.json(
      { error: "Dieses Doodle ist geschlossen" },
      { status: 409 }
    );

  const config = storedLineup(doodle.config);
  const roles: RoleId[] = normalizeRoles(
    Array.isArray(body.roles) ? body.roles : [],
    config
  );
  if (roles.length === 0)
    return NextResponse.json(
      { error: "Mindestens eine Rolle wählen" },
      { status: 400 }
    );
  // MD is only possible for someone with an MD-eligible role.
  const canMd: boolean =
    Boolean(body.canMd) &&
    roles.some((role) => findRole(config, role)?.canMd);

  const validDates = new Set<string>(doodle.dates);
  const cleanedAvailability = Object.fromEntries(
    Object.entries(availability).filter(
      ([date, value]) =>
        validDates.has(date) && ["yes", "maybe", "no"].includes(value)
    )
  );

  const { error } = await supabase.from("participants").upsert(
    {
      doodle_id: params.id,
      name,
      roles,
      can_md: canMd,
      max_per_month: maxPerMonth,
      availability: cleanedAvailability,
    },
    { onConflict: "doodle_id,name" }
  );
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
