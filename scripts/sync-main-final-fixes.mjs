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

// 3) Fahrtenbuch: echtes eigenständiges PDF als Datei, nicht nur Druckansicht.
const fbFile = "src/routes/_authenticated/steuerberater.fahrtenbuch.tsx";
const fbBefore = readFileSync(fbFile, "utf8").replace(/\r\n/g, "\n");
let fb = fbBefore;

if (!fb.includes('import { jsPDF } from "jspdf";')) {
  fb = fb.replace(
    'import { useMemo, useState } from "react";\n',
    'import { useMemo, useState } from "react";\nimport { jsPDF } from "jspdf";\n',
  );
}

if (!fb.includes("async function fahrtenbuchPdf()")) {
  const marker = `  async function monthlyCsv() {`;
  const fn = `  async function fahrtenbuchPdf() {\n    if (trips.length === 0) {\n      toast.error("Keine Fahrten im gewählten Zeitraum.");\n      return;\n    }\n\n    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });\n    const pageWidth = pdf.internal.pageSize.getWidth();\n    const margin = 10;\n    let y = 12;\n\n    const header = () => {\n      pdf.setFont("helvetica", "bold");\n      pdf.setFontSize(15);\n      pdf.text(\`Fahrtenbuch \${deDate(from)} – \${deDate(to)}\`, margin, y);\n      y += 7;\n      pdf.setFont("helvetica", "normal");\n      pdf.setFontSize(9);\n      pdf.text(\`Geschäftlich erfasste Kilometer: \${deKm(totalBusinessKm)} km\`, margin, y);\n      y += 7;\n      pdf.setFont("helvetica", "bold");\n      pdf.text("Datum | Zeit | Fahrzeug | Kennzeichen | Von | Ziel / Zweck | Nach | Start-km | End-km | km", margin, y);\n      y += 5;\n      pdf.setFont("helvetica", "normal");\n    };\n\n    header();\n    for (const trip of trips) {\n      const vehicle = vehicles.find((v) => v.id === trip.vehicle_id);\n      const line = [\n        deDate(trip.trip_date),\n        trip.trip_time?.slice(0, 5) ?? "–",\n        vehicle?.vehicle_name ?? "–",\n        vehicle?.license_plate ?? "–",\n        trip.from_location || "–",\n        trip.customer_name || "–",\n        trip.to_location || "–",\n        deKm(trip.start_km),\n        deKm(trip.end_km),\n        deKm(trip.distance_km),\n      ].join(" | ");\n      const lines = pdf.splitTextToSize(line, pageWidth - margin * 2);\n      if (y + lines.length * 4 > 195) {\n        pdf.addPage();\n        y = 12;\n        header();\n      }\n      pdf.setFontSize(8);\n      pdf.text(lines, margin, y);\n      y += lines.length * 4 + 2;\n    }\n\n    if (monthSummaries.length) {\n      pdf.addPage();\n      y = 12;\n      pdf.setFont("helvetica", "bold");\n      pdf.setFontSize(14);\n      pdf.text("Monatsabgleich je Fahrzeug", margin, y);\n      y += 8;\n      pdf.setFontSize(9);\n      for (const { row, vehicle, total, business, other } of monthSummaries) {\n        const line = [\n          row.month.slice(0, 7),\n          vehicle?.vehicle_name ?? "–",\n          vehicle?.license_plate ?? "–",\n          \`Anfang: \${deKm(row.start_km)}\`,\n          \`Ende: \${row.end_km == null ? "–" : deKm(row.end_km)}\`,\n          \`Gesamt: \${total == null ? "–" : deKm(total)} km\`,\n          \`Geschäftlich: \${deKm(business)} km\`,\n          \`Privat/sonstig: \${other == null ? "–" : deKm(other)} km\`,\n        ].join(" | ");\n        const lines = pdf.splitTextToSize(line, pageWidth - margin * 2);\n        if (y + lines.length * 4 > 195) {\n          pdf.addPage();\n          y = 12;\n        }\n        pdf.setFont("helvetica", "normal");\n        pdf.text(lines, margin, y);\n        y += lines.length * 4 + 2;\n      }\n    }\n\n    await saveFile(pdf.output("blob"), \`Fahrtenbuch_\${from}_\${to}.pdf\`);\n  }\n\n`;
  if (!fb.includes(marker)) {
    console.error("Abbruch: Fahrtenbuch-Marker für PDF-Funktion nicht gefunden.");
    process.exit(1);
  }
  fb = fb.replace(marker, fn + marker);
}

if (!fb.includes("Fahrtenbuch PDF")) {
  const oldButton = `          <Button variant="outline" onClick={() => window.print()}>\n            <FileText className="size-4" /> Als PDF drucken\n          </Button>`;
  const newButton = `          <Button variant="outline" onClick={() => void fahrtenbuchPdf()}>\n            <FileText className="size-4" /> Fahrtenbuch PDF\n          </Button>`;
  if (!fb.includes(oldButton)) {
    console.error("Abbruch: Fahrtenbuch-PDF-Button nicht gefunden.");
    process.exit(1);
  }
  fb = fb.replace(oldButton, newButton);
}

saveIfChanged(fbFile, fbBefore, fb);
console.log(fbBefore === fb ? "Eigenständiges Fahrtenbuch-PDF bereits vorhanden." : "Eigenständiges Fahrtenbuch-PDF integriert.");

// 4) Staging: Service Worker deaktivieren und alte Registrierung automatisch entfernen,
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
