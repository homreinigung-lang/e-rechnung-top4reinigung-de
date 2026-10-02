import type { SupabaseClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AlertTriangle, Boxes, PackagePlus, ShoppingCart, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/materialien")({
  head: () => ({
    meta: [
      { title: "Materialverwaltung – GebCalc" },
      {
        name: "description",
        content: "Materialbestand, Objektmaterialien und Bestellungen verwalten.",
      },
    ],
  }),
  component: Materialverwaltung,
});

type Material = {
  id: string;
  user_id: string;
  name: string;
  sku: string;
  unit: string;
  current_stock: number;
  min_stock: number;
  unit_cost: number;
  supplier: string;
  notes: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

type Project = {
  id: string;
  name: string | null;
  customer_name: string | null;
  city: string | null;
};

type ProjectMaterial = {
  id: string;
  user_id: string;
  project_id: string;
  material_id: string;
  target_stock: number;
  object_stock: number;
  notes: string;
  created_at: string;
  updated_at: string;
};

type MaterialOrder = {
  id: string;
  user_id: string;
  project_id: string | null;
  material_id: string;
  quantity: number;
  status: string;
  supplier: string;
  order_date: string | null;
  expected_date: string | null;
  note: string;
  created_at: string;
  updated_at: string;
};

function Materialverwaltung() {
  const db = supabase as SupabaseClient;
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [unit, setUnit] = useState("Stk.");
  const [stock, setStock] = useState("0");
  const [minStock, setMinStock] = useState("0");
  const [unitCost, setUnitCost] = useState("0");
  const [supplier, setSupplier] = useState("");

  const [assignProject, setAssignProject] = useState("");
  const [assignMaterial, setAssignMaterial] = useState("");
  const [targetStock, setTargetStock] = useState("0");
  const [objectStock, setObjectStock] = useState("0");

  const [orderProject, setOrderProject] = useState("none");
  const [orderMaterial, setOrderMaterial] = useState("");
  const [orderQuantity, setOrderQuantity] = useState("1");
  const [orderSupplier, setOrderSupplier] = useState("");
  const [orderNote, setOrderNote] = useState("");

  const { data: materials = [] } = useQuery({
    queryKey: ["materials"],
    queryFn: async () => {
      const { data, error } = await db
        .from("materials")
        .select("*")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Material[];
    },
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects", "materials"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id,name,customer_name,city")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Project[];
    },
  });

  const { data: projectMaterials = [] } = useQuery({
    queryKey: ["project_materials"],
    queryFn: async () => {
      const { data, error } = await db
        .from("project_materials")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ProjectMaterial[];
    },
  });

  const { data: orders = [] } = useQuery({
    queryKey: ["material_orders"],
    queryFn: async () => {
      const { data, error } = await db
        .from("material_orders")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as MaterialOrder[];
    },
  });

  const lowStock = useMemo(
    () =>
      materials.filter(
        (item) =>
          Number(item.min_stock ?? 0) > 0 &&
          Number(item.current_stock ?? 0) <= Number(item.min_stock ?? 0),
      ),
    [materials],
  );

  const openOrders = orders.filter((order) => !["geliefert", "storniert"].includes(order.status));
  const stockValue = materials.reduce(
    (sum, item) => sum + Number(item.current_stock || 0) * Number(item.unit_cost || 0),
    0,
  );

  const materialName = (id: string) => materials.find((item) => item.id === id)?.name ?? "Material";
  const projectName = (id: string | null) =>
    id ? projects.find((project) => project.id === id)?.name || "Objekt" : "Zentrallager";

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["materials"] });
    void queryClient.invalidateQueries({ queryKey: ["project_materials"] });
    void queryClient.invalidateQueries({ queryKey: ["material_orders"] });
  };

  const addMaterial = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Bitte Materialname eingeben.");
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Nicht angemeldet");
      const { error } = await db.from("materials").insert({
        user_id: uid,
        name: name.trim(),
        sku: sku.trim(),
        unit: unit.trim() || "Stk.",
        current_stock: Math.max(0, Number(stock) || 0),
        min_stock: Math.max(0, Number(minStock) || 0),
        unit_cost: Math.max(0, Number(unitCost) || 0),
        supplier: supplier.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setName("");
      setSku("");
      setStock("0");
      setMinStock("0");
      setUnitCost("0");
      setSupplier("");
      invalidate();
      toast.success("Material angelegt");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMaterial = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await db.from("materials").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const archiveMaterial = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("materials").update({ active: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Material archiviert");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const assignToProject = useMutation({
    mutationFn: async () => {
      if (!assignProject || !assignMaterial) throw new Error("Bitte Objekt und Material auswählen.");
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Nicht angemeldet");
      const { error } = await db.from("project_materials").upsert(
        {
          user_id: uid,
          project_id: assignProject,
          material_id: assignMaterial,
          target_stock: Math.max(0, Number(targetStock) || 0),
          object_stock: Math.max(0, Number(objectStock) || 0),
        },
        { onConflict: "user_id,project_id,material_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      setAssignMaterial("");
      setTargetStock("0");
      setObjectStock("0");
      invalidate();
      toast.success("Material dem Objekt zugeordnet");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateProjectMaterial = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await db.from("project_materials").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const removeProjectMaterial = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("project_materials").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const createOrder = useMutation({
    mutationFn: async () => {
      if (!orderMaterial) throw new Error("Bitte Material auswählen.");
      const qty = Number(orderQuantity);
      if (!(qty > 0)) throw new Error("Bestellmenge muss größer als 0 sein.");
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Nicht angemeldet");
      const material = materials.find((item) => item.id === orderMaterial);
      const { error } = await db.from("material_orders").insert({
        user_id: uid,
        project_id: orderProject === "none" ? null : orderProject,
        material_id: orderMaterial,
        quantity: qty,
        supplier: orderSupplier.trim() || material?.supplier || "",
        status: "offen",
        note: orderNote.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setOrderMaterial("");
      setOrderQuantity("1");
      setOrderSupplier("");
      setOrderNote("");
      invalidate();
      toast.success("Bestellung angelegt");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateOrder = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const patch: Record<string, unknown> = { status };
      if (status === "bestellt") patch.order_date = new Date().toISOString().slice(0, 10);
      const { error } = await db.from("material_orders").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Materialverwaltung</h1>
        <p className="mt-1 text-muted-foreground">
          Lagerbestand, Materialien je Objekt und Bestellungen zentral verwalten.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="surface p-4">
          <div className="text-xs text-muted-foreground">Aktive Materialien</div>
          <div className="mt-1 text-2xl font-semibold">{materials.length}</div>
        </div>
        <div className="surface p-4">
          <div className="text-xs text-muted-foreground">Nachbestellung nötig</div>
          <div className={`mt-1 text-2xl font-semibold ${lowStock.length ? "text-destructive" : ""}`}>
            {lowStock.length}
          </div>
        </div>
        <div className="surface p-4">
          <div className="text-xs text-muted-foreground">Lagerwert</div>
          <div className="mt-1 text-2xl font-semibold">{formatMoney(stockValue)}</div>
        </div>
      </div>

      {lowStock.length > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <div className="flex items-center gap-2 font-semibold text-amber-700">
            <AlertTriangle className="size-4" /> Mindestbestand erreicht
          </div>
          <p className="mt-1 text-muted-foreground">
            {lowStock.map((item) => item.name).join(", ")}
          </p>
        </div>
      )}

      <section className="surface space-y-4 p-5">
        <div className="flex items-center gap-2">
          <PackagePlus className="size-5 text-primary" />
          <h2 className="text-lg font-semibold">Materialstamm & Lager</h2>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1 md:col-span-2">
            <Label>Material</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Sanitärreiniger" />
          </div>
          <div className="space-y-1">
            <Label>Artikel-Nr.</Label>
            <Input value={sku} onChange={(e) => setSku(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Einheit</Label>
            <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Stk., L, Karton" />
          </div>
          <div className="space-y-1">
            <Label>Bestand</Label>
            <Input type="number" min={0} step="0.01" value={stock} onChange={(e) => setStock(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Mindestbestand</Label>
            <Input type="number" min={0} step="0.01" value={minStock} onChange={(e) => setMinStock(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>EK je Einheit</Label>
            <Input type="number" min={0} step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Lieferant</Label>
            <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} />
          </div>
        </div>
        <Button type="button" onClick={() => addMaterial.mutate()} disabled={addMaterial.isPending}>
          Material anlegen
        </Button>

        {materials.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-2">Material</th>
                  <th className="p-2">Bestand</th>
                  <th className="p-2">Minimum</th>
                  <th className="p-2">EK</th>
                  <th className="p-2">Lieferant</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {materials.map((item) => {
                  const low = Number(item.min_stock) > 0 && Number(item.current_stock) <= Number(item.min_stock);
                  return (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="p-2">
                        <div className="font-medium">{item.name}</div>
                        <div className="text-xs text-muted-foreground">{item.sku || "ohne Artikel-Nr."} · {item.unit}</div>
                      </td>
                      <td className="p-2">
                        <Input
                          className={`w-28 ${low ? "border-amber-500" : ""}`}
                          type="number"
                          min={0}
                          step="0.01"
                          defaultValue={item.current_stock}
                          onBlur={(e) => updateMaterial.mutate({ id: item.id, patch: { current_stock: Math.max(0, Number(e.target.value) || 0) } })}
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          className="w-28"
                          type="number"
                          min={0}
                          step="0.01"
                          defaultValue={item.min_stock}
                          onBlur={(e) => updateMaterial.mutate({ id: item.id, patch: { min_stock: Math.max(0, Number(e.target.value) || 0) } })}
                        />
                      </td>
                      <td className="p-2">{formatMoney(Number(item.unit_cost || 0))}</td>
                      <td className="p-2">{item.supplier || "—"}</td>
                      <td className="p-2 text-right">
                        <Button type="button" size="icon" variant="ghost" aria-label="Material archivieren" onClick={() => archiveMaterial.mutate(item.id)}>
                          <Trash2 className="size-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="surface space-y-4 p-5">
        <div className="flex items-center gap-2">
          <Boxes className="size-5 text-primary" />
          <h2 className="text-lg font-semibold">Material je Objekt</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-4 md:items-end">
          <div className="space-y-1">
            <Label>Objekt</Label>
            <Select value={assignProject} onValueChange={setAssignProject}>
              <SelectTrigger><SelectValue placeholder="Objekt auswählen" /></SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name || "Objekt"}{project.city ? ` · ${project.city}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Material</Label>
            <Select value={assignMaterial} onValueChange={setAssignMaterial}>
              <SelectTrigger><SelectValue placeholder="Material auswählen" /></SelectTrigger>
              <SelectContent>
                {materials.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Sollbestand</Label>
            <Input type="number" min={0} step="0.01" value={targetStock} onChange={(e) => setTargetStock(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Bestand im Objekt</Label>
            <Input type="number" min={0} step="0.01" value={objectStock} onChange={(e) => setObjectStock(e.target.value)} />
          </div>
        </div>
        <Button type="button" variant="outline" onClick={() => assignToProject.mutate()} disabled={assignToProject.isPending}>
          Objektmaterial speichern
        </Button>

        <div className="space-y-2">
          {projectMaterials.map((row) => {
            const low = Number(row.target_stock) > 0 && Number(row.object_stock) < Number(row.target_stock);
            return (
              <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                <div>
                  <div className="font-medium">{projectName(row.project_id)} · {materialName(row.material_id)}</div>
                  <div className="text-xs text-muted-foreground">
                    Ist {formatNumber(Number(row.object_stock))} · Soll {formatNumber(Number(row.target_stock))}
                    {low ? " · Nachfüllen" : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    className="w-24"
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue={row.object_stock}
                    onBlur={(e) => updateProjectMaterial.mutate({ id: row.id, patch: { object_stock: Math.max(0, Number(e.target.value) || 0) } })}
                  />
                  <Button type="button" size="icon" variant="ghost" aria-label="Zuordnung entfernen" onClick={() => removeProjectMaterial.mutate(row.id)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="surface space-y-4 p-5">
        <div className="flex items-center gap-2">
          <ShoppingCart className="size-5 text-primary" />
          <h2 className="text-lg font-semibold">Bestellungen</h2>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <Label>Material</Label>
            <Select value={orderMaterial} onValueChange={(value) => {
              setOrderMaterial(value);
              const material = materials.find((item) => item.id === value);
              setOrderSupplier(material?.supplier ?? "");
            }}>
              <SelectTrigger><SelectValue placeholder="Material auswählen" /></SelectTrigger>
              <SelectContent>
                {materials.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Für Objekt</Label>
            <Select value={orderProject} onValueChange={setOrderProject}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Zentrallager</SelectItem>
                {projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name || "Objekt"}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Menge</Label>
            <Input type="number" min={0.01} step="0.01" value={orderQuantity} onChange={(e) => setOrderQuantity(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Lieferant</Label>
            <Input value={orderSupplier} onChange={(e) => setOrderSupplier(e.target.value)} />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>Notiz</Label>
            <Textarea rows={2} value={orderNote} onChange={(e) => setOrderNote(e.target.value)} />
          </div>
        </div>
        <Button type="button" onClick={() => createOrder.mutate()} disabled={createOrder.isPending}>
          Bestellung anlegen
        </Button>

        <div className="space-y-2">
          {orders.map((order) => (
            <div key={order.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
              <div>
                <div className="font-medium">
                  {materialName(order.material_id)} · {formatNumber(Number(order.quantity))}
                </div>
                <div className="text-xs text-muted-foreground">
                  {projectName(order.project_id)} · {order.supplier || "ohne Lieferant"} · Status {order.status}
                  {order.order_date ? ` · bestellt ${formatDate(order.order_date)}` : ""}
                </div>
              </div>
              <Select value={order.status} onValueChange={(status) => updateOrder.mutate({ id: order.id, status })}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="offen">Offen</SelectItem>
                  <SelectItem value="bestellt">Bestellt</SelectItem>
                  <SelectItem value="geliefert">Geliefert</SelectItem>
                  <SelectItem value="storniert">Storniert</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ))}
          {orders.length === 0 && (
            <p className="text-sm text-muted-foreground">Noch keine Bestellungen angelegt.</p>
          )}
        </div>

        {openOrders.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {openOrders.length} offene bzw. bestellte Position{openOrders.length === 1 ? "" : "en"}.
          </p>
        )}
      </section>
    </div>
  );
}
