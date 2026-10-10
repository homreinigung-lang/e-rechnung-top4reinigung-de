import { formatNumber } from "@/lib/format";

import { plannedHoursForMonth, revenueForMonth } from "@/lib/object-controlling";
import { effectiveProjectAddressParts } from "@/lib/maps";

import type { useProjectData } from "./useProjectData";

export function useProjectControlling(input: {
  assignments: ReturnType<typeof useProjectData>["assignments"];
  controllingDocuments: ReturnType<typeof useProjectData>["controllingDocuments"];
  controllingExpenses: ReturnType<typeof useProjectData>["controllingExpenses"];
  controllingMonth: ReturnType<typeof useProjectData>["controllingMonth"];
  customerId: ReturnType<typeof useProjectData>["customerId"];
  customerProjects: ReturnType<typeof useProjectData>["customerProjects"];
  id: ReturnType<typeof useProjectData>["id"];
  items: ReturnType<typeof useProjectData>["items"];
  monthDate: ReturnType<typeof useProjectData>["monthDate"];
  project: NonNullable<ReturnType<typeof useProjectData>["project"]>;
  projectCustomer: ReturnType<typeof useProjectData>["projectCustomer"];
  rooms: ReturnType<typeof useProjectData>["rooms"];
  timeEntries: ReturnType<typeof useProjectData>["timeEntries"];
}) {
  const {
    assignments,
    controllingDocuments,
    controllingExpenses,
    controllingMonth,
    customerId,
    customerProjects,
    id,
    items,
    monthDate,
    project,
    projectCustomer,
    rooms,
    timeEntries,
  } = input;
  const effectiveProjectAddress = effectiveProjectAddressParts(project, projectCustomer);
  const linkedCustomerName =
    projectCustomer?.company || projectCustomer?.name || project.customer_name || "Kunde";
  const linkedCustomerEmail = projectCustomer?.email || project.contact_email || "";
  const linkedCustomerPhone = projectCustomer?.phone || project.contact_phone || "";

  const isTender = project.mode === "tender";
  const totalSqm = rooms.reduce((sum, r) => sum + Number(r.area_sqm || 0), 0);
  const confirmedRooms = rooms.filter((r) => r.confirmed).length;
  const expected = Math.max(project.expected_room_count || 0, rooms.length);
  const history = timeEntries
    .filter(
      (t) =>
        (t.entry_type ?? "work") === "work" &&
        (t.approval_status ?? "approved") !== "rejected" &&
        Boolean(t.completed_at),
    )
    .sort((a, b) => String(b.work_date).localeCompare(String(a.work_date)));

  const monthEntries = timeEntries.filter(
    (t) =>
      String(t.work_date).startsWith(controllingMonth) &&
      (t.entry_type ?? "work") === "work" &&
      (t.approval_status ?? "approved") !== "rejected",
  );
  const actualHours = monthEntries.reduce((sum, t) => sum + Number(t.hours || 0), 0);
  const wageCosts = monthEntries.reduce(
    (sum, t) => sum + Number(t.hours || 0) * Number(t.hourly_rate || 0),
    0,
  );

  const plannedHours = plannedHoursForMonth(assignments, controllingMonth);

  const uniqueCustomerObject =
    Boolean(customerId) && customerProjects.length === 1 && customerProjects[0]?.id === id;
  const revenueNet = controllingDocuments
    .filter((d) => {
      const sameCustomer = Boolean(customerId) && d.customer_id === customerId;
      const linkedToObject = d.project_id === id && sameCustomer;
      const historicalUniqueCustomerMatch = !d.project_id && sameCustomer && uniqueCustomerObject;
      return (
        (linkedToObject || historicalUniqueCustomerMatch) &&
        String(d.status ?? "") !== "cancelled" &&
        !d.is_storno
      );
    })
    .reduce((sum, d) => sum + revenueForMonth(d, controllingMonth), 0);
  const materialAndOtherCosts = controllingExpenses
    .filter((e) => String(e.expense_date).startsWith(controllingMonth))
    .reduce((sum, e) => sum + Number(e.net_amount ?? 0), 0);
  const totalCosts = wageCosts + materialAndOtherCosts;
  const contribution = revenueNet - totalCosts;
  const marginPercent = revenueNet > 0 ? (contribution / revenueNet) * 100 : null;
  const hourVariance = actualHours - plannedHours;
  const costPerHour = actualHours > 0 ? totalCosts / actualHours : 0;
  const revenuePerHour = actualHours > 0 ? revenueNet / actualHours : 0;
  const marginStatus =
    marginPercent == null
      ? { label: "Keine Umsatzbasis", className: "text-muted-foreground" }
      : marginPercent >= 25
        ? { label: "Grün · ≥ 25 %", className: "text-emerald-700" }
        : marginPercent >= 10
          ? { label: "Gelb · 10–25 %", className: "text-amber-700" }
          : { label: "Rot · < 10 %", className: "text-destructive" };

  const trendMonths = Array.from({ length: 6 }, (_, index) => {
    const d = new Date(
      Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() - (5 - index), 1),
    );
    return d.toISOString().slice(0, 7);
  });
  const trendRows = trendMonths.map((month) => {
    const monthRevenue = controllingDocuments
      .filter((d) => {
        const sameCustomer = Boolean(customerId) && d.customer_id === customerId;
        const direct = d.project_id === id && sameCustomer;
        const historical = !d.project_id && sameCustomer && uniqueCustomerObject;
        return (direct || historical) && String(d.status ?? "") !== "cancelled" && !d.is_storno;
      })
      .reduce((sum, d) => sum + revenueForMonth(d, month), 0);
    const monthEntriesForTrend = timeEntries.filter(
      (t) =>
        String(t.work_date).startsWith(month) &&
        (t.entry_type ?? "work") === "work" &&
        (t.approval_status ?? "approved") !== "rejected",
    );
    const monthWageCosts = monthEntriesForTrend.reduce(
      (sum, t) => sum + Number(t.hours || 0) * Number(t.hourly_rate || 0),
      0,
    );
    const monthOtherCosts = controllingExpenses
      .filter((e) => String(e.expense_date).startsWith(month))
      .reduce((sum, e) => sum + Number(e.net_amount ?? 0), 0);
    const costs = monthWageCosts + monthOtherCosts;
    const contributionValue = monthRevenue - costs;
    return {
      month,
      revenue: monthRevenue,
      costs,
      contribution: contributionValue,
      margin: monthRevenue > 0 ? (contributionValue / monthRevenue) * 100 : null,
    };
  });

  const coveringTotals = new Map<string, number>();
  const usageTotals = new Map<string, number>();
  for (const r of rooms) {
    const cover = (r.floor_covering || "").trim();
    if (cover)
      coveringTotals.set(cover, (coveringTotals.get(cover) ?? 0) + Number(r.area_sqm || 0));
    const usage = (r.usage_type || "").trim();
    if (usage) usageTotals.set(usage, (usageTotals.get(usage) ?? 0) + Number(r.area_sqm || 0));
  }
  const topList = (map: Map<string, number>) =>
    [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const derivedFacts: string[] = [];
  if (totalSqm > 0)
    derivedFacts.push(`Erkannte Fläche: ca. ${formatNumber(totalSqm)} m² (${rooms.length} Räume)`);
  const topUsage = topList(usageTotals);
  if (topUsage.length > 0) {
    derivedFacts.push(
      `Nutzung: ${topUsage.map(([k, v]) => `${k} ${formatNumber(v)} m²`).join(", ")}`,
    );
  }
  const topCover = topList(coveringTotals);
  if (topCover.length > 0) {
    derivedFacts.push(
      `Bodenbelag: ${topCover.map(([k, v]) => `${k} ${formatNumber(v)} m²`).join(", ")}`,
    );
  }
  const aiHighlights = (project.analysis_highlights ?? []) as string[];
  const aiRequirements = (project.analysis_requirements ?? []) as string[];
  const hasAnalysis =
    aiHighlights.length > 0 || aiRequirements.length > 0 || derivedFacts.length > 0;

  const openCritical = items.filter((i) => i.critical && !i.done);
  return {
    actualHours,
    aiHighlights,
    aiRequirements,
    confirmedRooms,
    contribution,
    costPerHour,
    derivedFacts,
    effectiveProjectAddress,
    expected,
    hasAnalysis,
    history,
    hourVariance,
    isTender,
    linkedCustomerEmail,
    linkedCustomerName,
    linkedCustomerPhone,
    marginPercent,
    marginStatus,
    materialAndOtherCosts,
    openCritical,
    plannedHours,
    revenueNet,
    revenuePerHour,
    topCover,
    totalCosts,
    totalSqm,
    trendRows,
    wageCosts,
  };
}
