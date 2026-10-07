import { countsForPayroll, isAbsence } from "@/lib/absence";

export type WorkTotalsEntry = {
  employee_name?: string | null;
  employee_id?: string | null;
  entry_type?: string | null;
  approval_status?: string | null;
  hours?: number | string | null;
  hourly_rate?: number | string | null;
};

/** Only approved work is payable; absence credits belong to the separate absence workflow. */
export function approvedWorkHours(entry: WorkTotalsEntry): number {
  if (isAbsence(entry) || !countsForPayroll(entry)) return 0;
  const hours = Number(entry.hours ?? 0);
  return Number.isFinite(hours) && hours > 0 ? hours : 0;
}

/** Match the hourly-rate fallback used by Lohnvorbereitung. */
export function workHourlyRate(entry: WorkTotalsEntry, employeeRate = 0): number {
  const rate = Number(entry.hourly_rate ?? 0) || employeeRate;
  return Number.isFinite(rate) ? rate : 0;
}

export function approvedWorkAmount(entry: WorkTotalsEntry, employeeRate = 0): number {
  return approvedWorkHours(entry) * workHourlyRate(entry, employeeRate);
}

export function approvedWorkTotals(
  entries: WorkTotalsEntry[],
  employeeRates: ReadonlyMap<string, number> = new Map(),
) {
  let hours = 0;
  let amount = 0;
  const perEmployee = new Map<string, { hours: number; amount: number }>();
  for (const entry of entries) {
    const approvedHours = approvedWorkHours(entry);
    if (approvedHours <= 0) continue;
    const approvedAmount = approvedWorkAmount(entry, employeeRates.get(entry.employee_id ?? "") ?? 0);
    hours += approvedHours;
    amount += approvedAmount;
    const name = entry.employee_name || "Ohne Zuordnung";
    const current = perEmployee.get(name) ?? { hours: 0, amount: 0 };
    perEmployee.set(name, {
      hours: current.hours + approvedHours,
      amount: current.amount + approvedAmount,
    });
  }
  return { hours, amount, perEmployee: [...perEmployee.entries()] };
}
