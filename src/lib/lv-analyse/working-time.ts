import type { LvFrequency, LvNormalizedItem, LvWorkingTime } from "./types";

/** Explicit document counts override a generic weekly extrapolation. */
export function workingTimeFrequency(item: LvNormalizedItem): LvFrequency {
  if (item.calculation.own_frequency) return item.calculation.own_frequency;
  if (item.working_time?.basis === "unknown") return { label: "Zeitbezug im Original prüfen", perYear: null };
  const count = item.working_time?.executions_per_year;
  return count != null && Number.isFinite(count) && count > 0
    ? { label: `${count} Einsätze/Jahr laut Dokument`, perYear: count }
    : item.frequency;
}

export function annualWorkingHours(item: LvNormalizedItem): number | null {
  if (item.calculation.pricing_basis === "once") return 0;
  if (item.calculation.mode === "time") {
    const minutes = item.calculation.minutes_per_execution;
    const count = workingTimeFrequency(item).perYear;
    return minutes != null && Number.isFinite(minutes) && minutes > 0 && count != null && count > 0
      ? (minutes / 60) * count
      : null;
  }
  const hours = item.working_hours;
  if (hours == null || !Number.isFinite(hours) || hours <= 0) return null;
  if (item.working_time?.basis === "unknown") return null;
  if (
    item.working_time?.basis === "annual_total" ||
    item.working_time?.basis === "evaluation_total"
  )
    return hours;
  const count = workingTimeFrequency(item).perYear;
  // New evidence-based rows must never assume a single visit for a missing count.
  if (item.working_time && (count == null || !Number.isFinite(count) || count <= 0)) return null;
  return hours * (count ?? 1);
}

const number = (raw: string) => Number(raw.replace(/\./g, "").replace(",", "."));
const unique = (values: number[]) => {
  const found = [...new Set(values.filter((v) => Number.isFinite(v) && v > 0))];
  return found.length === 1 ? found[0]! : null;
};

/** Only an explicit cleaning-time statement may supply a duration. */
function duration(block: string): number | null {
  const values: number[] = [];
  for (const m of block.matchAll(/Reinigungszeit[\s\S]{0,260}?zugrunde/gi)) {
    const statement = m[0].replace(/\s+/g, " ");
    const before = /([\d]+(?:[.,]\d+)?)\s*Stunden/i.exec(statement);
    const after = /Stunden\s*(?:\/\s*(?:Tag|Einsatz|jährlich))?\s*([\d]+(?:[.,]\d+)?)/i.exec(
      statement,
    );
    const value = before?.[1] ?? after?.[1];
    if (value) values.push(number(value));
  }
  return unique(values);
}

function eventCount(block: string, day: string): number | null {
  const text = block.replace(/\s+/g, " ");
  const formulas = [...text.matchAll(new RegExp(`${day}\\s*[x×]\\s*(\\d+)`, "gi"))].map((m) =>
    Number(m[1]),
  );
  const prose = [
    ...text.matchAll(
      new RegExp(`(\\d+)\\s+(?:Veranstaltungen|Einsätze)\\s+an\\s+einem\\s+${day}`, "gi"),
    ),
  ].map((m) => Number(m[1]));
  return unique([...formulas, ...prose]);
}

type Kind = "regular" | "weekend" | "deep" | "special";
function kind(description: string): Kind | null {
  if (/grundreinigung/i.test(description)) return "deep";
  if (/stundenverrechnungssatz|stundenkontingent|sonderauftr/i.test(description)) return "special";
  if (/samstag|sonntag|wochenende/i.test(description)) return "weekend";
  if (/unterhaltsreinigung/i.test(description)) return "regular";
  return null;
}

/**
 * Reconcile annual price sheets from source evidence, independent of AI numeric choices.
 * This deliberately accepts only unambiguous, separately headed service sections.
 * It does not copy document prices into the user's own calculation.
 */
export function reconcileWorkingTime(items: LvNormalizedItem[], text: string): LvNormalizedItem[] {
  // PDF line breaks can split source words ("Reini-\ngungszeit").
  text = text.replace(/([A-Za-zÄÖÜäöüß])-\s*\n\s*([a-zäöüß])/g, "$1$2");
  if (!/Pauschalpreis\s+pro\s+Jahr/i.test(text) || !/Arbeitstage/i.test(text)) return items;
  const headings = [...text.matchAll(/^\s*[a-z]\.\s+([^\n]+)/gim)];
  const blocks = new Map<Kind, string[]>();
  headings.forEach((match, index) => {
    const k = kind(match[1] ?? "");
    if (!k) return;
    const block = text.slice(match.index!, headings[index + 1]?.index ?? text.length);
    blocks.set(k, [...(blocks.get(k) ?? []), block]);
  });
  if (!blocks.has("regular")) return items;
  return items.map((item) => {
    const k = kind(item.description);
    if (!k) return item;
    const candidates = blocks.get(k) ?? [];
    let hours: number | null = null;
    let count: number | null = null;
    let basis: LvWorkingTime["basis"] = "unknown";
    let evidence = "Zeitbezug oder Einsatzanzahl im Original prüfen.";
    if (candidates.length === 1) {
      const block = candidates[0]!;
      hours = duration(block);
      if (k === "regular" && items.filter((i) => kind(i.description) === k).length === 1) {
        count = unique([...block.matchAll(/(\d+)\s*Arbeitstage/gi)].map((m) => Number(m[1])));
        if (hours && count) {
          basis = "execution";
          evidence = `${hours} Std./Tag × ${count} Arbeitstage/Jahr laut Preisblatt`;
        }
      } else if (k === "weekend") {
        const saturday = eventCount(block, "Samstag");
        const sunday = eventCount(block, "Sonntag");
        const isSaturday = /samstag/i.test(item.description);
        const isSunday = /sonntag/i.test(item.description);
        count =
          isSaturday && !isSunday
            ? saturday
            : isSunday && !isSaturday
              ? sunday
              : saturday != null && sunday != null
                ? saturday + sunday
                : null;
        // Multiple rows for the same day could cover different scopes; never repeat the full count.
        const siblings = items.filter(
          (i) =>
            kind(i.description) === "weekend" &&
            /samstag/i.test(i.description) === isSaturday &&
            /sonntag/i.test(i.description) === isSunday,
        );
        if (hours && count && siblings.length === 1) {
          basis = "execution";
          evidence = `${hours} Std./Einsatz × ${count} Einsätze/Jahr nur zur Angebotswertung`;
        }
      } else if (k === "deep" && items.filter((i) => kind(i.description) === k).length === 1) {
        if (hours && /1\s*x\s*jährlich/i.test(block)) {
          basis = "annual_total";
          count = 1;
          evidence = `${hours} Std. für die jährliche Grundreinigung`;
        }
      } else if (k === "special" && items.filter((i) => kind(i.description) === k).length === 1) {
        hours = unique(
          [...block.matchAll(/Stundenverrechnungssatz\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*Stunden/gi)].map(
            (m) => number(m[1]!),
          ),
        );
        if (hours) {
          basis = "evaluation_total";
          evidence = `${hours} fiktive Stunden nur zur Angebotswertung; kein garantierter Abruf`;
        }
      }
    }
    return {
      ...item,
      working_hours: basis === "unknown" ? item.working_hours : hours,
      working_time: {
        basis,
        executions_per_year: basis === "unknown" ? null : count,
        evaluation_only: k === "weekend" || k === "special",
        evidence,
      },
    };
  });
}
