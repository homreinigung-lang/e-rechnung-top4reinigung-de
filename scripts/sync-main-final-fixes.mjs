import { readFileSync, writeFileSync } from "node:fs";

function saveIfChanged(path, before, after) {
  if (before !== after) writeFileSync(path, after, "utf8");
}

// 1) Kalender-Fixes
const file = "src/components/EinsatzKalender.tsx";
let source = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
let changed = false;

const oldDelete = `      const { error } = await supabase.from("time_entries").delete().eq("id", id);\n      if (error) throw error;`;
const newDelete = `      const { error } = await supabase.from("time_entries").delete().eq("id", id);\n      if (error)\n        throw new Error(\n          friendlyDbError(\n            error,\n            'Einsatz konnte nicht gelöscht werden. Erledigte Einsätze bitte zuerst über "Erledigt zurücknehmen" öffnen.',\n          ),\n        );`;

if (source.includes(oldDelete)) {
  source = source.replace(oldDelete, newDelete);
  changed = true;
}

const moveMarker = `      const { error } = await supabase\n        .from("time_entries")\n        .update(patch)\n        .eq("id", id)\n        .neq("status", "completed");\n      if (error) throw new Error(friendlyDbError(error, "Einsatz konnte nicht verschoben werden."));\n`;

const teamSync = `      const { error } = await supabase\n        .from("time_entries")\n        .update(patch)\n        .eq("id", id)\n        .neq("status", "completed");\n      if (error) throw new Error(friendlyDbError(error, "Einsatz konnte nicht verschoben werden."));\n\n      // Teamzuordnung mit dem Haupt-Mitarbeiter synchron halten.\n      if (employeeId && source?.employee_id && source.employee_id !== employeeId) {\n        await supabase\n          .from("time_entry_employees")\n          .delete()\n          .eq("time_entry_id", id)\n          .eq("employee_id", source.employee_id);\n        const others = teamByEntry.get(id) ?? [];\n        if (others.some((m) => m.employeeId !== source.employee_id)) {\n          await supabase\n            .from("time_entry_employees")\n            .upsert(\n              { time_entry_id: id, employee_id: employeeId },\n              { onConflict: "time_entry_id,employee_id", ignoreDuplicates: true },\n            );\n        }\n      }\n`;

if (!source.includes("// Teamzuordnung mit dem Haupt-Mitarbeiter synchron halten.")) {
  if (!source.includes(moveMarker)) {
    console.error("Abbruch: EinsatzKalender-Marker für Haupt-Mitarbeiter-Synchronisierung nicht gefunden.");
    process.exit(1);
  }
  source = source.replace(moveMarker, teamSync);
  changed = true;
}

if (changed) writeFileSync(file, source, "utf8");
console.log(changed ? "Main-Fixes in EinsatzKalender übernommen." : "Main-Fixes in EinsatzKalender bereits vorhanden.");

// 2) Steuerberater: Fahrtenbuch-Daten in den Sammel-Excel-Export integrieren.
const stbFile = "src/routes/_authenticated/steuerberater.tsx";
const stbBefore = readFileSync(stbFile, "utf8").replace(/\r\n/g, "\n");
let stb = stbBefore;

if (!stb.includes('queryKey: ["stb_fahrtenbuch_entries"')) {
  const marker = `  const gobdExport = useMutation({`;
  const insert = `  const { data: fahrtenbuchEntries = [] } = useQuery({\n    queryKey: ["stb_fahrtenbuch_entries", from, to],\n    queryFn: async () => {\n      const { data, error } = await supabase\n        .from("fahrtenbuch_entries")\n        .select("*")\n        .gte("trip_date", from)\n        .lte("trip_date", to)\n        .order("trip_date")\n        .order("trip_time");\n      if (error) throw error;\n      return data ?? [];\n    },\n  });\n\n  const { data: fahrtenbuchVehicles = [] } = useQuery({\n    queryKey: ["stb_fahrtenbuch_vehicles"],\n    queryFn: async () => {\n      const { data, error } = await supabase\n        .from("fahrtenbuch_vehicles")\n        .select("id,vehicle_name,license_plate")\n        .order("vehicle_name");\n      if (error) throw error;\n      return data ?? [];\n    },\n  });\n\n`;
  if (!stb.includes(marker)) {
    console.error("Abbruch: Steuerberater-Marker für Fahrtenbuch-Abfragen nicht gefunden.");
    process.exit(1);
  }
  stb = stb.replace(marker, insert + marker);
}

if (!stb.includes("const fahrtenbuchRows: Row[]")) {
  const marker = `  const payrollRows: Row[] = Array.from(`;
  const insert = `  const fahrtenbuchRows: Row[] = (\n    fahrtenbuchEntries as unknown as Record<string, unknown>[]\n  ).map((trip) => {\n    const vehicle = (fahrtenbuchVehicles as unknown as Record<string, unknown>[]).find(\n      (v) => String(v["id"] ?? "") === String(trip["vehicle_id"] ?? ""),\n    );\n    return {\n      Datum: formatDate(String(trip["trip_date"] ?? "")),\n      Startzeit: String(trip["trip_time"] ?? "").slice(0, 5),\n      Rückkehrzeit: String(trip["return_time"] ?? "").slice(0, 5),\n      Fahrtart: trip["trip_type"] === "round_trip" ? "Hin- und Rückfahrt" : "Nur Hinfahrt",\n      Fahrzeug: String(vehicle?.["vehicle_name"] ?? ""),\n      Kennzeichen: String(vehicle?.["license_plate"] ?? ""),\n      Von: String(trip["from_location"] ?? ""),\n      "Kunde / Ziel / Zweck": String(trip["customer_name"] ?? ""),\n      Zieladresse: String(trip["to_location"] ?? ""),\n      "Start-km": String(trip["start_km"] ?? ""),\n      "End-km": String(trip["end_km"] ?? ""),\n      "Geschäftliche km": String(trip["distance_km"] ?? ""),\n      Bemerkung: String(trip["notes"] ?? ""),\n    };\n  });\n\n`;
  if (!stb.includes(marker)) {
    console.error("Abbruch: Steuerberater-Marker für Fahrtenbuch-Zeilen nicht gefunden.");
    process.exit(1);
  }
  stb = stb.replace(marker, insert + marker);
}

if (!stb.includes('{ title: "Fahrtenbuch", rows: fahrtenbuchRows }')) {
  const marker = `              [\n                { title: "Rechnungen", rows: docRows },`;
  const replacement = `              [\n                { title: "Fahrtenbuch", rows: fahrtenbuchRows },\n                { title: "Rechnungen", rows: docRows },`;
  if (!stb.includes(marker)) {
    console.error("Abbruch: Steuerberater-Marker für Excel-Sheets nicht gefunden.");
    process.exit(1);
  }
  stb = stb.replace(marker, replacement);
}

saveIfChanged(stbFile, stbBefore, stb);
console.log(stbBefore === stb ? "Fahrtenbuch im Steuerberater-Excel bereits vorhanden." : "Fahrtenbuch in Steuerberater-Excel integriert.");

// 3) Staging: Service Worker deaktivieren und alte Registrierung automatisch entfernen,
// damit nach Deploys keine alten JS-Bundles weiterlaufen.
const pwaFile = "src/lib/pwa.ts";
const pwaBefore = readFileSync(pwaFile, "utf8").replace(/\r\n/g, "\n");
let pwa = pwaBefore;
if (!pwa.includes('host === "gebcalc-staging.homreinigung.workers.dev"')) {
  const marker = `  const host = window.location.hostname;\n`;
  const addition = `  const host = window.location.hostname;\n  if (host === "gebcalc-staging.homreinigung.workers.dev" || host.startsWith("gebcalc-staging.")) return true;\n`;
  if (!pwa.includes(marker)) {
    console.error("Abbruch: PWA-Host-Marker nicht gefunden.");
    process.exit(1);
  }
  pwa = pwa.replace(marker, addition);
}
saveIfChanged(pwaFile, pwaBefore, pwa);
console.log(pwaBefore === pwa ? "Staging-Service-Worker bereits deaktiviert." : "Staging-Service-Worker deaktiviert.");
