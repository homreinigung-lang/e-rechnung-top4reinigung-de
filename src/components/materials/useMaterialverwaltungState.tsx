import type { SupabaseClient } from "@supabase/supabase-js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

import {
  type Material,
  type Project,
  type ProjectMaterial,
  type MaterialOrder,
  type MaterialConsumption,
} from "./shared";

export function useMaterialverwaltungState() {
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

  const [consumeProject, setConsumeProject] = useState("");
  const [consumeMaterial, setConsumeMaterial] = useState("");
  const [consumeQuantity, setConsumeQuantity] = useState("1");
  const [consumeDate, setConsumeDate] = useState(new Date().toISOString().slice(0, 10));
  const [consumeNote, setConsumeNote] = useState("");

  const {
    data: materials = [],
    isLoading: materialsLoading,
    error: materialsError,
  } = useQuery({
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

  const { data: consumptions = [] } = useQuery({
    queryKey: ["material_consumptions"],
    queryFn: async () => {
      const { data, error } = await db
        .from("material_consumptions")
        .select("*")
        .order("consumed_on", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as MaterialConsumption[];
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
  const assignedForConsumption = projectMaterials.filter(
    (row) => row.project_id === consumeProject,
  );
  const consumptionCost = consumptions.reduce(
    (sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_cost || 0),
    0,
  );
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
    void queryClient.invalidateQueries({ queryKey: ["material_consumptions"] });
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
      if (!assignProject || !assignMaterial)
        throw new Error("Bitte Objekt und Material auswählen.");
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

  const addConsumption = useMutation({
    mutationFn: async () => {
      if (!consumeProject || !consumeMaterial) {
        throw new Error("Bitte Objekt und Material auswählen.");
      }
      const qty = Number(consumeQuantity);
      if (!(qty > 0)) throw new Error("Verbrauchsmenge muss größer als 0 sein.");

      const assignment = projectMaterials.find(
        (row) => row.project_id === consumeProject && row.material_id === consumeMaterial,
      );
      if (!assignment) throw new Error("Material ist diesem Objekt noch nicht zugeordnet.");
      if (qty > Number(assignment.object_stock || 0)) {
        throw new Error("Nicht genügend Bestand im Objekt.");
      }

      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Nicht angemeldet");
      const material = materials.find((item) => item.id === consumeMaterial);
      const { error } = await db.from("material_consumptions").insert({
        user_id: uid,
        project_id: consumeProject,
        material_id: consumeMaterial,
        quantity: qty,
        unit_cost: Number(material?.unit_cost || 0),
        consumed_on: consumeDate,
        note: consumeNote.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setConsumeMaterial("");
      setConsumeQuantity("1");
      setConsumeNote("");
      invalidate();
      toast.success("Materialverbrauch gebucht");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeConsumption = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("material_consumptions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Verbrauch entfernt und Bestand zurückgebucht");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateOrder = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const patch: Record<string, unknown> = { status };
      if (status === "bestellt") patch["order_date"] = new Date().toISOString().slice(0, 10);
      const { error } = await db.from("material_orders").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  return {
    ready: true as const,
    addConsumption,
    addMaterial,
    archiveMaterial,
    assignMaterial,
    assignProject,
    assignToProject,
    assignedForConsumption,
    consumeDate,
    consumeMaterial,
    consumeNote,
    consumeProject,
    consumeQuantity,
    consumptionCost,
    consumptions,
    createOrder,
    lowStock,
    materialName,
    materials,
    materialsError,
    materialsLoading,
    minStock,
    name,
    objectStock,
    openOrders,
    orderMaterial,
    orderNote,
    orderProject,
    orderQuantity,
    orderSupplier,
    orders,
    projectMaterials,
    projectName,
    projects,
    removeConsumption,
    removeProjectMaterial,
    setAssignMaterial,
    setAssignProject,
    setConsumeDate,
    setConsumeMaterial,
    setConsumeNote,
    setConsumeProject,
    setConsumeQuantity,
    setMinStock,
    setName,
    setObjectStock,
    setOrderMaterial,
    setOrderNote,
    setOrderProject,
    setOrderQuantity,
    setOrderSupplier,
    setSku,
    setStock,
    setSupplier,
    setTargetStock,
    setUnit,
    setUnitCost,
    sku,
    stock,
    stockValue,
    supplier,
    targetStock,
    unit,
    unitCost,
    updateMaterial,
    updateOrder,
    updateProjectMaterial,
  };
}
export type MaterialverwaltungState = Extract<
  ReturnType<typeof useMaterialverwaltungState>,
  { ready: true }
>;
