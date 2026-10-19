import { recurrenceUnitLabel, visitsPerMonth, type RecurrenceUnit } from "./constants";
import { parsePositiveNumber, formatNumber } from "./format";
import { findRate, type PerformanceRate } from "./leistungswerte";
import { round2, type CalcPosition } from "./kalkulation-engine";

export type CalculationRoom = {
  id: string;
  source: string;
  name: string;
  floor: string;
  usage_type: string;
  floor_covering: string;
  area: string;
  sqmPerHour: string;
  rateLabel: string;
  frequency: string;
  frequencyUnit: RecurrenceUnit;
  included: boolean;
  calculationMode?: "area" | "minutes";
  minutesPerVisit?: string;
  tasks?: string;
  minutesOrigin?: "estimate" | "document";
  tasksOrigin?: "estimate" | "document";
};

export type RoomCalculation = { version: 1; enabled: boolean; rooms: CalculationRoom[] };
export const emptyRoomCalculation = (): RoomCalculation => ({
  version: 1,
  enabled: false,
  rooms: [],
});

function suggestedTasks(room: {
  name: string;
  usage_type: string;
  floor_covering: string;
}): string {
  const kind = `${room.usage_type} ${room.name}`.toLowerCase();
  const floor = /teppich/i.test(room.floor_covering) ? "Boden saugen" : "Boden reinigen";
  if (/\bwc\b|sanitär|sanitaer|toilette/.test(kind))
    return `${floor}; WC, Waschbecken, Spiegel und Kontaktflächen reinigen; Abfall leeren`;
  if (/küche|kueche|teeküche|sozialraum/.test(kind))
    return `${floor}; freie Arbeitsflächen und Spüle reinigen; Abfall leeren`;
  if (/büro|buero|besprechung/.test(kind))
    return `${floor}; freie Oberflächen reinigen; Abfall leeren`;
  if (/flur|treppe|verkehr/.test(kind)) return `${floor}; zugängliche Kontaktflächen reinigen`;
  return "";
}

/** Fill missing values only; the saved performance rate is an estimate, never document evidence. */
export function suggestRoomDefaults(
  room: CalculationRoom,
  rates: PerformanceRate[],
): CalculationRoom {
  const result = { ...room };
  if (!(room.minutesPerVisit ?? "").trim()) {
    const performance =
      parsePositiveNumber(room.sqmPerHour) || findRate(rates, room)?.sqm_per_hour || 0;
    const area = parsePositiveNumber(room.area);
    if (area > 0 && performance > 0) {
      result.minutesPerVisit = String(Math.ceil((area / performance) * 600) / 10).replace(".", ",");
      result.minutesOrigin = "estimate";
    }
  }
  if (!(room.tasks ?? "").trim()) {
    const tasks = suggestedTasks(room);
    if (tasks) {
      result.tasks = tasks;
      result.tasksOrigin = "estimate";
    }
  }
  return result;
}

/** A scan supplies documented facts; local rate-based suggestions are explicitly marked. */
export function roomsFromScan(
  source: string,
  rooms: {
    name: string;
    floor: string;
    usage_type: string;
    floor_covering: string;
    area_sqm: number;
    minutes_per_visit?: number;
    cleaning_tasks?: string;
    cleaning_frequency?: number;
    cleaning_frequency_unit?: RecurrenceUnit;
  }[],
  rates: PerformanceRate[],
): CalculationRoom[] {
  return rooms.map((room, index) => {
    const rate = findRate(rates, room);
    const documentedMinutes =
      Number.isFinite(room.minutes_per_visit) && room.minutes_per_visit! > 0;
    const documentedFrequency =
      Number.isFinite(room.cleaning_frequency) &&
      room.cleaning_frequency! > 0 &&
      ["week", "fortnight", "month", "quarter", "year"].includes(
        room.cleaning_frequency_unit ?? "",
      );
    return suggestRoomDefaults(
      {
        id: `${source}#${index}`,
        source,
        name: room.name,
        floor: room.floor,
        usage_type: room.usage_type,
        floor_covering: room.floor_covering,
        area: String(room.area_sqm > 0 ? room.area_sqm : "").replace(".", ","),
        sqmPerHour: rate ? String(rate.sqm_per_hour).replace(".", ",") : "",
        rateLabel: rate?.label ?? "Kein passender Leistungswert",
        frequency: documentedFrequency ? String(room.cleaning_frequency).replace(".", ",") : "",
        frequencyUnit: documentedFrequency ? room.cleaning_frequency_unit! : "week",
        included: true,
        calculationMode: "minutes",
        minutesPerVisit: documentedMinutes ? String(room.minutes_per_visit).replace(".", ",") : "",
        minutesOrigin: documentedMinutes ? "document" : undefined,
        tasks: room.cleaning_tasks?.trim() || "",
        tasksOrigin: room.cleaning_tasks?.trim() ? "document" : undefined,
      },
      rates,
    );
  });
}

/** Re-analysis replaces only the scanned document, never duplicates its rooms. */
export function replaceScannedRooms(
  current: RoomCalculation,
  source: string,
  rooms: CalculationRoom[],
): RoomCalculation {
  return {
    ...current,
    rooms: [...current.rooms.filter((room) => room.source !== source), ...rooms],
  };
}

const UNITS: RecurrenceUnit[] = ["week", "fortnight", "month", "quarter", "year"];

/** Old saved calculations have no room data; reject malformed/unsupported snapshots. */
export function readRoomCalculation(value: unknown): RoomCalculation {
  if (!value || typeof value !== "object") return emptyRoomCalculation();
  const data = value as Record<string, unknown>;
  if (
    data["version"] !== 1 ||
    typeof data["enabled"] !== "boolean" ||
    !Array.isArray(data["rooms"])
  )
    return emptyRoomCalculation();
  const ids = new Set<string>();
  const rooms: CalculationRoom[] = [];
  for (const entry of data["rooms"]) {
    if (!entry || typeof entry !== "object") return emptyRoomCalculation();
    const row = entry as Record<string, unknown>;
    const keys = [
      "id",
      "source",
      "name",
      "floor",
      "usage_type",
      "floor_covering",
      "area",
      "sqmPerHour",
      "rateLabel",
      "frequency",
    ];
    if (
      keys.some((key) => typeof row[key] !== "string") ||
      typeof row["included"] !== "boolean" ||
      !UNITS.includes(row["frequencyUnit"] as RecurrenceUnit) ||
      !row["id"] ||
      ids.has(String(row["id"]))
    )
      return emptyRoomCalculation();
    if (
      (row["calculationMode"] !== undefined &&
        row["calculationMode"] !== "area" &&
        row["calculationMode"] !== "minutes") ||
      (row["minutesPerVisit"] !== undefined && typeof row["minutesPerVisit"] !== "string") ||
      (row["tasks"] !== undefined && typeof row["tasks"] !== "string") ||
      ["minutesOrigin", "tasksOrigin"].some(
        (key) => row[key] !== undefined && row[key] !== "estimate" && row[key] !== "document",
      )
    )
      return emptyRoomCalculation();
    ids.add(String(row["id"]));
    rooms.push(row as unknown as CalculationRoom);
  }
  return { version: 1, enabled: data["enabled"], rooms };
}

export function calculateRooms(calculation: RoomCalculation, hourlyRate: number) {
  const errors: string[] = [];
  let area = 0;
  let monthlyHours = 0;
  const positions: CalcPosition[] = [];
  const rows = calculation.rooms
    .filter((room) => room.included)
    .map((room) => {
      const sqm = parsePositiveNumber(room.area);
      const performance = parsePositiveNumber(room.sqmPerHour);
      const frequency = parsePositiveNumber(room.frequency);
      const label = room.name.trim() || "Unbenannter Raum";
      const manualTime = room.calculationMode === "minutes";
      const minutes = parsePositiveNumber(room.minutesPerVisit ?? "");
      const validTime = manualTime ? minutes > 0 : sqm > 0 && performance > 0;
      if (!room.name.trim() || !validTime || frequency <= 0) {
        errors.push(
          `${label}: Raumname, ${manualTime ? "Minuten je Besuch" : "Fläche und Leistungswert"} und Turnus vollständig angeben.`,
        );
      }
      const hoursPerVisit = manualTime ? minutes / 60 : performance > 0 ? sqm / performance : 0;
      const visits = visitsPerMonth(frequency, room.frequencyUnit);
      const billedHours = round2(hoursPerVisit * visits);
      if (validTime && frequency > 0 && billedHours <= 0)
        errors.push(`${label}: Stundenbedarf liegt unter 0,01 Std./Monat – Ansatz prüfen.`);
      area += sqm;
      monthlyHours += billedHours;
      if (billedHours > 0 && hourlyRate > 0) {
        positions.push({
          description: `${label}${room.floor ? ` (${room.floor})` : ""} – ${sqm > 0 ? `${formatNumber(sqm)} m², ` : ""}${room.floor_covering ? `${room.floor_covering}, ` : ""}${manualTime ? `${formatNumber(minutes)} Min./Besuch` : `${formatNumber(performance)} m²/Std.`}, ${formatNumber(frequency)} ${recurrenceUnitLabel(room.frequencyUnit)} – Monatsdurchschnitt${room.tasks?.trim() ? `; Leistungen: ${room.tasks.trim()}` : ""}`,
          quantity: billedHours,
          unit: "Std.",
          unit_price: round2(hourlyRate),
        });
      }
      return { room, hoursPerVisit, visitsPerMonth: visits, monthlyHours: billedHours };
    });
  if (rows.length === 0) errors.push("Mindestens einen Raum zur Reinigung auswählen.");
  if (round2(hourlyRate) <= 0)
    errors.push("Einen positiven Stundensatz für die Raumkalkulation angeben.");
  const commonVisitsPerMonth =
    rows.length > 0 &&
    rows.every((row) => Math.abs(row.visitsPerMonth - rows[0]!.visitsPerMonth) < 1e-9)
      ? rows[0]!.visitsPerMonth
      : 0;
  return {
    rows,
    commonVisitsPerMonth,
    area: round2(area),
    monthlyHours: round2(monthlyHours),
    errors,
    positions: errors.length ? [] : positions,
  };
}
