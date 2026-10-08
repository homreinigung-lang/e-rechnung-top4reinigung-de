import "@tanstack/react-start/server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateGeminiJson } from "@/lib/gemini-json.server";
import {
  assistantInput,
  assistantSystem,
  workerForAssistant,
  PROGRAM_GUIDE,
  WORKER_GUIDE,
  type AssistantInput,
  type AssistantAnswer,
} from "@/lib/assistant";
import { effectiveDayHours, normalizeDayTimes, formatDayTime } from "@/lib/planung";
export async function assistantEmployee(db: SupabaseClient, userId: string) {
  const { data, error } = await db
    .from("employees")
    .select("id,user_id,active")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (error) throw new Error("Mitarbeiterzugang konnte nicht geprüft werden.");
  return workerForAssistant(data, userId);
}
export async function answerAssistant(
  db: SupabaseClient,
  userId: string,
  input: AssistantInput,
): Promise<AssistantAnswer> {
  const data = assistantInput.parse(input);
  const me = await assistantEmployee(db, userId);
  if (data.mode === "work" && !me)
    throw new Error("Arbeitshilfe ist nur für Mitarbeiter verfügbar.");
  if (!process.env["GEMINI_API_KEY"]?.trim())
    throw new Error(
      "Der KI-Assistent ist noch nicht eingerichtet. Bitte die Verwaltung kontaktieren.",
    );
  const budget = await db.from("assistant_requests").insert({ user_id: userId });
  if (budget.error)
    throw new Error(
      budget.error.message.includes("KI-Limit")
        ? budget.error.message
        : "KI-Zugriff nicht möglich. Bitte Anmeldung und Kontofreigabe prüfen.",
    );
  let task: Record<string, unknown> | null = null;
  const sources = [me ? "Mitarbeiter-Anleitung GebCalc" : "Programmanleitung GebCalc"];
  if (data.mode === "work" && data.assignmentId && data.date && me) {
    const assignment = await db
      .from("project_assignments")
      .select(
        "id,project_id,employee_id,user_id,assignment_role,day_hours,day_times,hours_per_week,start_date,end_date",
      )
      .eq("id", data.assignmentId)
      .eq("employee_id", me.id)
      .eq("user_id", me.user_id)
      .maybeSingle();
    if (assignment.error || !assignment.data)
      throw new Error("Einsatz ist nicht verfügbar oder nicht für Sie freigegeben.");
    const a = assignment.data;
    if ((a.start_date && data.date < a.start_date) || (a.end_date && data.date > a.end_date))
      throw new Error("Datum liegt außerhalb des Einsatzzeitraums.");
    const day = (new Date(`${data.date}T12:00:00Z`).getUTCDay() + 6) % 7;
    const hours = effectiveDayHours(a.day_hours, a.hours_per_week, a.day_times)[day] ?? 0;
    if (hours <= 0) throw new Error("Für dieses Datum ist kein Einsatz geplant.");
    const project = await db
      .from("projects")
      .select("id,name,cleaning_frequency")
      .eq("id", a.project_id)
      .eq("user_id", me.user_id)
      .maybeSingle();
    if (project.error || !project.data)
      throw new Error("Objektinformationen konnten nicht geladen werden.");
    const materials = await db
      .from("project_materials")
      .select("object_stock,target_stock,materials(name,unit)")
      .eq("project_id", a.project_id)
      .eq("user_id", me.user_id)
      .limit(30);
    if (materials.error) throw new Error("Objektmaterial konnte nicht geladen werden.");
    task = {
      objekt: String(project.data.name ?? "").slice(0, 180),
      datum: data.date,
      aufgabe: String(a.assignment_role ?? "").slice(0, 400),
      turnus: String(project.data.cleaning_frequency ?? "").slice(0, 200),
      geplante_stunden: hours,
      uhrzeit: formatDayTime(normalizeDayTimes(a.day_times)[day]),
      pause_minuten: normalizeDayTimes(a.day_times)[day]?.breakMin ?? 0,
      material: (materials.data ?? []).map((row) => {
        const m = row.materials as unknown as { name?: string; unit?: string } | null;
        return {
          name: String(m?.name ?? "Material").slice(0, 180),
          einheit: String(m?.unit ?? "").slice(0, 30),
          objektbestand: row.object_stock,
          zielbestand: row.target_stock,
        };
      }),
    };
    sources.push(`Freigegebener Einsatz vom ${data.date}`, "Hinterlegtes Objektmaterial");
  }
  const parsed = await generateGeminiJson({
    model: process.env["GEMINI_MODEL_ASSISTANT"] || "gemini-3.1-flash-lite",
    system: assistantSystem(data.mode, Boolean(me)),
    prompt: JSON.stringify({
      programmanleitung: me ? WORKER_GUIDE : PROGRAM_GUIDE,
      einsatz: task,
      hinweis:
        data.mode === "work" && !task
          ? "Kein konkreter Einsatz gewählt. Nur allgemeine Hinweise geben und bei Objektfragen nach einem Einsatz fragen."
          : "",
      verlauf: data.history,
      frage: data.question,
    }),
    schema: {
      type: "object",
      properties: { answer: { type: "string" }, escalate: { type: "boolean" } },
      required: ["answer", "escalate"],
    },
    validate: (v) =>
      typeof v["answer"] === "string" &&
      v["answer"].trim().length > 0 &&
      v["answer"].length <= 5000 &&
      typeof v["escalate"] === "boolean",
    timeoutMs: 25_000,
    maxOutputTokens: 1800,
  });
  return {
    answer: (parsed["answer"] as string).trim(),
    escalate: parsed["escalate"] === true,
    sources,
  };
}
