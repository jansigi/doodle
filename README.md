# Worship-Band-Planer

Webapp zur Semesterplanung einer Worship-Band: Der Admin erstellt ein Doodle
mit allen Celebration-Daten, die Band trägt Rollen und Verfügbarkeiten ein,
und beim Schliessen wird automatisch ein fairer Semesterplan generiert, der
manuell angepasst und als PDF exportiert werden kann.

## Features

- **Doodle erstellen:** Titel, Daten der Celebrations, Admin-Passwort
- **Teilnehmer-Link:** Name, Rollen (Worship Leader, Vocal Coordinator,
  Vocals, Bass, E-Gitarre, Drums, Keys, optional MD) und pro Datum
  Ja / Vielleicht / Nein
- **Automatischer Plan** beim Schliessen mit Ziel-Besetzung pro Celebration:
  1 Worship Leader, 1 Vocal Coordinator, 2–3 weitere Vocals (Leader und
  Coordinator zählen zu den 4–5 Vocals), 1 Bass, 1–2 E-Gitarre, 1 Drums,
  1 Keys, 1 MD (Tag auf einer der eingeteilten Personen)
- **Fairness:** Alle spielen ähnlich oft, möglichst nicht zwei Wochen
  hintereinander; «Vielleicht» wird nur genutzt wenn nötig
- **Warnungen,** wo die Ziel-Besetzung nicht erreicht werden kann
- **Plan-Editor** für manuelle Anpassungen, Wieder-Öffnen und Neu-Generieren
- **PDF-Export** als Quer-Tabelle (Datum × Rollen)

## Setup

1. **Supabase-Projekt erstellen** auf [supabase.com](https://supabase.com)
   (Free Tier reicht).
2. Im Supabase **SQL Editor** den Inhalt von `supabase/schema.sql` ausführen.
3. `.env.local.example` nach `.env.local` kopieren und die Werte aus
   *Project Settings → API* eintragen (`SUPABASE_URL` und
   `SUPABASE_SERVICE_ROLE_KEY`).
4. Lokal starten:

   ```bash
   npm install
   npm run dev
   ```

   Die App läuft auf [http://localhost:3000](http://localhost:3000).

## Deployment (Vercel)

1. Repository auf GitHub pushen.
2. Projekt auf [vercel.com](https://vercel.com) importieren.
3. Die beiden Umgebungsvariablen `SUPABASE_URL` und
   `SUPABASE_SERVICE_ROLE_KEY` in den Vercel-Projekteinstellungen setzen.
4. Deployen – fertig.

## Ablauf

1. Admin öffnet `/`, erstellt das Doodle und erhält zwei Links:
   - **Band-Link** `/d/<id>` zum Teilen
   - **Admin-Link** `/d/<id>/admin` (mit Passwort geschützt)
2. Die Band füllt Rollen und Verfügbarkeiten aus (Einträge können über den
   eigenen Namen jederzeit wieder geladen und angepasst werden).
3. Admin schliesst das Doodle → Plan wird generiert.
4. Admin passt den Plan bei Bedarf an, speichert und lädt das PDF herunter.
   Wieder-Öffnen ist möglich; der Plan bleibt dabei erhalten und kann auf
   Wunsch neu generiert werden.
