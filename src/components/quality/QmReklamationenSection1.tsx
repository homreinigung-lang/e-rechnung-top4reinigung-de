import { qmFeedbackLabels } from "@/lib/qm";

import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";

import { formatDate } from "@/lib/format";

import { statusLabel, priorityLabel, categoryLabel } from "./shared";

import type { QmReklamationenState } from "./useQmReklamationenState";
export function QmReklamationenSection1({ state }: { state: QmReklamationenState }) {
  const {
    casesError,
    casesLoading,
    customerName,
    editCase,
    employeeName,
    filtered,
    latestFeedback,
    projectName,
    remove,
    today,
  } = state;
  return (
    <section className="surface overflow-x-auto">
      {casesLoading ? (
        <p className="p-8 text-center">Reklamationen werden geladen …</p>
      ) : casesError ? null : filtered.length === 0 ? (
        <p className="p-8 text-center text-sm text-muted-foreground">
          Keine Reklamationen im gewählten Filter.
        </p>
      ) : (
        <table className="w-full min-w-[980px] text-sm">
          <thead className="border-b bg-muted/40 text-left">
            <tr>
              <th className="p-3">Fall</th>
              <th className="p-3">Kunde / Objekt</th>
              <th className="p-3">Kategorie</th>
              <th className="p-3">Priorität</th>
              <th className="p-3">Status</th>
              <th className="p-3">Verantwortlich</th>
              <th className="p-3">Frist</th>
              <th className="p-3 text-right">Aktion</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((item) => {
              const overdue =
                item.status !== "erledigt" && Boolean(item.due_date && item.due_date < today);
              return (
                <tr key={item.id}>
                  <td className="p-3">
                    <button
                      type="button"
                      onClick={() => editCase(item)}
                      className="font-medium hover:underline"
                    >
                      {item.title}
                    </button>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(item.occurred_at)}
                    </div>
                  </td>
                  <td className="p-3">
                    <div>{customerName(item.customer_id)}</div>
                    {item.project_id ? (
                      <Link
                        to="/projekte/$id"
                        params={{ id: item.project_id }}
                        className="text-xs text-primary hover:underline"
                      >
                        {projectName(item.project_id)}
                      </Link>
                    ) : (
                      <div className="text-xs text-muted-foreground">Kein Objekt</div>
                    )}
                  </td>
                  <td className="p-3">{categoryLabel[item.category] ?? item.category}</td>
                  <td className="p-3">
                    <span
                      className={item.priority === "hoch" ? "font-semibold text-destructive" : ""}
                    >
                      {priorityLabel[item.priority] ?? item.priority}
                    </span>
                  </td>
                  <td className="p-3">
                    <div>{statusLabel[item.status] ?? item.status}</div>
                    {item.status !== "erledigt" &&
                      latestFeedback.find(
                        (f) => f.case_id === item.id && f.employee_id === item.assigned_employee_id,
                      ) && (
                        <div className="text-xs font-medium text-primary">
                          Mitarbeiter:{" "}
                          {
                            qmFeedbackLabels[
                              latestFeedback.find(
                                (f) =>
                                  f.case_id === item.id &&
                                  f.employee_id === item.assigned_employee_id,
                              )!.kind
                            ]
                          }
                        </div>
                      )}
                  </td>
                  <td className="p-3">{employeeName(item.assigned_employee_id)}</td>
                  <td className={overdue ? "p-3 font-semibold text-destructive" : "p-3"}>
                    {item.due_date ? formatDate(item.due_date) : "–"}
                    {overdue ? " · überfällig" : ""}
                  </td>
                  <td className="p-3 text-right">
                    <Button variant="ghost" size="sm" onClick={() => editCase(item)}>
                      Bearbeiten
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => remove.mutate(item.id)}>
                      Löschen
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
