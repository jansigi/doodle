import { NextRequest, NextResponse } from "next/server";
import { customAlphabet } from "nanoid";
import bcrypt from "bcryptjs";
import { createServerSupabase } from "@/lib/supabase";
import { DEFAULT_LINEUP, parseLineupConfig } from "@/lib/roles";

const generateId = customAlphabet(
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  10
);

export async function POST(request: NextRequest) {
  const body = await request.json();
  const title: string = (body.title ?? "").trim();
  const dates: string[] = Array.isArray(body.dates) ? body.dates : [];
  const password: string = body.password ?? "";
  // Without a config the doodle gets the default lineup.
  const parsedConfig =
    body.config == null
      ? { config: DEFAULT_LINEUP }
      : parseLineupConfig(body.config);

  if (!title)
    return NextResponse.json({ error: "Titel fehlt" }, { status: 400 });
  if (dates.length === 0)
    return NextResponse.json(
      { error: "Mindestens ein Datum angeben" },
      { status: 400 }
    );
  if (password.length < 4)
    return NextResponse.json(
      { error: "Passwort muss mindestens 4 Zeichen haben" },
      { status: 400 }
    );
  if ("error" in parsedConfig)
    return NextResponse.json({ error: parsedConfig.error }, { status: 400 });

  const supabase = createServerSupabase();
  const id = generateId();
  const passwordHash = await bcrypt.hash(password, 10);
  const sortedDates = [...new Set(dates)].sort();

  const { error } = await supabase.from("doodles").insert({
    id,
    title,
    password_hash: passwordHash,
    status: "open",
    dates: sortedDates,
    config: parsedConfig.config,
  });
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ id });
}
