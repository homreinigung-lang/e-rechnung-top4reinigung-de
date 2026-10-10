import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import { formatMoney, formatNumber } from "@/lib/format";
import {
  type LvPositionItem,
  type LvStatus,
  STATUS_DOT,
  lvStatus,
  total,
  posLabel,
  type Props,
} from "./shared";
import { StatusBadge } from "@/components/lv-positionen/StatusBadge";
import { LvDetail } from "./LvDetail";

export function LvPositionen({ items, onPatch, onAdd, onRemove }: Props) {
  const [filter, setFilter] = useState<"alle" | LvStatus>("alle");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c = { offen: 0, pruefen: 0, fertig: 0 };
    for (const it of items) c[lvStatus(it)] += 1;
    return c;
  }, [items]);

  const sumTotal = useMemo(() => items.reduce((s, it) => s + total(it), 0), [items]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((it) => {
      if (filter !== "alle" && lvStatus(it) !== filter) return false;
      if (!q) return true;
      return [posLabel(it), it.section, it.title, it.description]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [items, filter, query]);

  const selected = items.find((it) => it.id === selectedId) ?? null;
  const selIndex = selected ? visible.findIndex((it) => it.id === selected.id) : -1;

  /** Offene Positionen ab der aktuellen Position (umlaufend), ohne die aktuelle. */
  function openOthers(currentId: string): LvPositionItem[] {
    const base = visible.length > 0 ? visible : items;
    const start = base.findIndex((it) => it.id === currentId);
    const ordered = start >= 0 ? [...base.slice(start + 1), ...base.slice(0, start)] : base;
    return ordered.filter((it) => it.id !== currentId && lvStatus(it) === "offen");
  }

  return (
    <div className="space-y-4">
      {/* Fortschritt & Filter */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{items.length} Positionen</span>
        {(
          [
            ["alle", `Alle ${items.length}`],
            ["fertig", `Fertig ${counts.fertig}`],
            ["pruefen", `Prüfen ${counts.pruefen}`],
            ["offen", `Offen ${counts.offen}`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors ${
              filter === key ? "border-foreground/40 bg-muted font-medium" : "hover:bg-muted/60"
            }`}
          >
            {key !== "alle" && <span className={`size-2 rounded-full ${STATUS_DOT[key]}`} />}
            {label}
          </button>
        ))}
        <span className="ml-auto text-sm text-muted-foreground">
          Summe netto: <span className="tabular-nums font-medium">{formatMoney(sumTotal)}</span>
        </span>
      </div>

      {counts.offen > 0 && (
        <button
          type="button"
          onClick={() => setFilter("offen")}
          className="w-full rounded-md border border-red-200 bg-red-50 px-3 py-2 text-left text-sm text-red-900"
        >
          {counts.offen} Position(en) benötigen noch Angaben – anzeigen
        </button>
      )}

      {/* Suche */}
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Position oder Beschreibung suchen …"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Noch keine Positionen. Ausschreibung hochladen oder Positionen manuell ergänzen.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
          {/* Tabelle */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 pr-3">Pos.</th>
                  <th className="py-2 pr-3">Beschreibung</th>
                  <th className="py-2 pr-3 text-right">Menge</th>
                  <th className="py-2 pr-3">Einheit</th>
                  <th className="py-2 pr-3 text-right">Preis / Einheit</th>
                  <th className="py-2 pr-3 text-right">Gesamtpreis</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {visible.map((it) => {
                  const status = lvStatus(it);
                  const priced = Number(it.unit_price) > 0;
                  return (
                    <tr
                      key={it.id}
                      onClick={() => setSelectedId(it.id)}
                      className={`cursor-pointer border-b last:border-0 hover:bg-muted/50 ${
                        selectedId === it.id ? "bg-muted/70" : ""
                      }`}
                    >
                      <td className="py-1.5 pr-3 whitespace-nowrap tabular-nums text-muted-foreground">
                        {posLabel(it)}
                      </td>
                      <td className="max-w-[22rem] py-1.5 pr-3">
                        <div className="truncate font-medium">{it.title || "Ohne Bezeichnung"}</div>
                        {it.section && (
                          <div className="truncate text-xs text-muted-foreground">{it.section}</div>
                        )}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">
                        {Number(it.quantity) > 0 ? formatNumber(Number(it.quantity)) : "—"}
                      </td>
                      <td className="py-1.5 pr-3 whitespace-nowrap text-muted-foreground">
                        {it.unit || "—"}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">
                        {priced ? formatMoney(Number(it.unit_price)) : "—"}
                      </td>
                      <td className="py-1.5 pr-3 text-right font-medium tabular-nums">
                        {priced && Number(it.quantity) > 0 ? formatMoney(total(it)) : "—"}
                      </td>
                      <td className="py-1.5 pr-3">
                        <StatusBadge status={status} />
                      </td>
                      <td className="py-1.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <ConfirmDeleteButton
                          title="Position wirklich löschen?"
                          description={`Die Position „${it.title || "ohne Titel"}" wird unwiderruflich gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.`}
                          onConfirm={() => {
                            if (selectedId === it.id) setSelectedId(null);
                            onRemove(it.id);
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-sm text-muted-foreground">
                      Keine Position passt zu Suche und Filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="pt-3">
              <Button variant="outline" size="sm" onClick={onAdd}>
                <Plus className="size-4" /> Position ergänzen
              </Button>
            </div>
          </div>

          {/* Detailbereich */}
          <div className="rounded-lg border p-4">
            {!selected ? (
              <p className="text-sm text-muted-foreground">
                Position in der Tabelle auswählen, um Angaben zu ergänzen.
              </p>
            ) : (
              <LvDetail
                key={selected.id}
                item={selected}
                onPatch={onPatch}
                onClose={() => setSelectedId(null)}
                hasPrev={selIndex > 0}
                hasNext={selIndex >= 0 && selIndex < visible.length - 1}
                onPrev={() => setSelectedId(visible[selIndex - 1]?.id ?? null)}
                onNext={() => setSelectedId(visible[selIndex + 1]?.id ?? null)}
                positionIndex={selIndex >= 0 ? selIndex + 1 : 1}
                positionCount={visible.length}
                openCount={openOthers(selected.id).length}
                onNextOpen={() => {
                  const next = openOthers(selected.id)[0];
                  if (next) setSelectedId(next.id);
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
