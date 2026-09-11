import { readFileSync, writeFileSync } from "node:fs";

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
