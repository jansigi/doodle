import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import type { Availability, Role } from "@/lib/types";
import { ALL_ROLES, INSTRUMENT_ROLES } from "@/lib/roles";

// Load an existing entry by name so a participant can edit their answer.
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const name = request.nextUrl.searchParams.get("name")?.trim();
  if (!name)
    return NextResponse.json({ error: "Name fehlt" }, { status: 400 });

  const supabase = createServerSupabase();
  const { data: participant } = await supabase
    .from("participants")
    .select("name, roles, can_md, max_per_month, availability")
    .eq("doodle_id", params.id)
    .ilike("name", name)
    .maybeSingle();

  return NextResponse.json({ participant: participant ?? null });
}

// Create or update a participant entry (upsert by doodle + name).
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await request.json();
  const name: string = (body.name ?? "").trim();
  const roles: Role[] = Array.isArray(body.roles)
    ? body.roles.filter((role: Role) => ALL_ROLES.includes(role))
    : [];
  // MD is only possible for instrumentalists (keys, bass, e-guitar, drums).
  const canMd: boolean =
    Boolean(body.canMd) &&
    roles.some((role: Role) => INSTRUMENT_ROLES.includes(role));
  const maxPerMonth: number | null =
    Number.isInteger(body.maxPerMonth) &&
    body.maxPerMonth >= 1 &&
    body.maxPerMonth <= 10
      ? body.maxPerMonth
      : null;
  const availability: Record<string, Availability> = body.availability ?? {};

  if (!name)
    return NextResponse.json({ error: "Name fehlt" }, { status: 400 });
  if (roles.length === 0)
    return NextResponse.json(
      { error: "Mindestens eine Rolle wählen" },
      { status: 400 }
    );

  const supabase = createServerSupabase();
  const { data: doodle } = await supabase
    .from("doodles")
    .select("status, dates")
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
