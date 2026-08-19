import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/kunden")({
  head: () => ({
    meta: [
      { title: "Kunden – Rechnungen & Angebote" },
      { name: "description", content: "Kundenstamm mit Adresse und USt-IdNr. verwalten." },
      { property: "og:title", content: "Kunden verwalten" },
      { property: "og:description", content: "Kundenstamm für Angebote und Rechnungen pflegen." },
    ],
  }),
  component: Kunden,
});

type CustomerForm = {
  id?: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  address_line: string;
  postal_code: string;
  city: string;
  country: string;
  vat_id: string;
  is_eu_customer: boolean;
  notes: string;
  status: string;
};

/** Vertragsstatus für die langfristige Verwaltung von Unterhaltsreinigungsverträgen. */
const STATUS: { value: string; label: string; className: string }[] = [
  { value: "active", label: "Aktiv", className: "bg-emerald-100 text-emerald-800" },
  { value: "paused", label: "Pausiert", className: "bg-amber-100 text-amber-900" },
  { value: "terminated", label: "Gekündigt", className: "bg-rose-100 text-rose-800" },
];

function statusInfo(value: string | null | undefined) {
  return STATUS.find((s) => s.value === value) ?? STATUS[0]!;
}

const empty: CustomerForm = {
  name: "",
  company: "",
  email: "",
  phone: "",
  address_line: "",
  postal_code: "",
  city: "",
  country: "Deutschland",
  vat_id: "",
  is_eu_customer: false,
  notes: "",
  status: "active",
};

function Kunden() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CustomerForm>(empty);

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async (values: CustomerForm) => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");
      if (values.id) {
        const { id, ...rest } = values;
        const { error } = await supabase.from("customers").update(rest).eq("id", id);
        if (error) throw error;
      } else {
        const { id: _ignored, ...rest } = values;
        // Kundennummer wird automatisch fortlaufend vergeben (z. B. KU-2026-0001).
        const { data: number, error: numberError } = await supabase.rpc("next_customer_number");
        if (numberError) throw numberError;
        const { error } = await supabase
          .from("customers")
          .insert({ ...rest, customer_number: String(number ?? ""), user_id: userId });
        if (error) throw error;
      }
    },

    onSuccess: () => {
      toast.success("Kunde gespeichert");
      setOpen(false);
      setForm(empty);
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("customers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Kunde gelöscht");
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function field(key: keyof CustomerForm, label: string, type = "text") {
    return (
      <div className="space-y-2">
        <Label htmlFor={key}>{label}</Label>
        <Input
          id={key}
          type={type}
          value={typeof form[key] === "string" ? form[key] : ""}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Kunden</h1>
          <p className="mt-1 text-muted-foreground">
            Kundenstamm inklusive USt-IdNr. für Reverse-Charge-Rechnungen.
          </p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) setForm(empty);
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4" /> Neuer Kunde
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{form.id ? "Kunde bearbeiten" : "Neuer Kunde"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="customer_number">Kundennummer (automatisch)</Label>
                <Input
                  id="customer_number"
                  readOnly
                  disabled
                  className="bg-muted"
                  value={
                    form.id
                      ? (customers.find((c) => c.id === form.id)?.customer_number ?? "")
                      : "Wird beim Speichern automatisch vergeben"
                  }
                />
              </div>
              {field("name", "Ansprechpartner / Name")}

              {field("company", "Firma")}
              {field("email", "E-Mail", "email")}
              {field("phone", "Telefon")}
              {field("address_line", "Straße und Hausnummer")}
              {field("vat_id", "USt-IdNr.")}
              {field("postal_code", "PLZ")}
              {field("city", "Ort")}
              {field("country", "Land")}
              <div className="space-y-2">
                <Label htmlFor="is_eu_customer">Kunde im EU-Ausland</Label>
                <div className="flex h-9 items-center gap-2">
                  <input
                    id="is_eu_customer"
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={form.is_eu_customer}
                    onChange={(e) => setForm({ ...form, is_eu_customer: e.target.checked })}
                  />
                  <span className="text-xs text-muted-foreground">
                    Mit USt-IdNr. wird automatisch Reverse-Charge (0 % MwSt.) gewählt.
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="notes">Notizen</Label>
                <Textarea
                  id="notes"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => save.mutate(form)}
                disabled={!form.name.trim() || save.isPending}
              >
                Speichern
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="surface overflow-hidden">
        {customers.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">
            Noch keine Kunden angelegt.
          </p>
        ) : (
          <ul className="divide-y">
            {customers.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {c.company || c.name}
                    {c.customer_number && (
                      <span className="ml-2 rounded bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
                        {c.customer_number}
                      </span>
                    )}
                    <span
                      className={`ml-2 rounded px-2 py-0.5 text-xs font-medium ${statusInfo(c.status).className}`}
                    >
                      {statusInfo(c.status).label}
                    </span>
                  </div>

                  <div className="truncate text-sm text-muted-foreground">
                    {[c.name, c.email, c.city].filter(Boolean).join(" · ")}
                  </div>
                  {c.vat_id && (
                    <div className="text-xs text-muted-foreground">USt-IdNr.: {c.vat_id}</div>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setForm({
                      id: c.id,
                      name: c.name,
                      company: c.company,
                      email: c.email,
                      phone: c.phone,
                      address_line: c.address_line,
                      postal_code: c.postal_code,
                      city: c.city,
                      country: c.country,
                      vat_id: c.vat_id,
                      is_eu_customer: Boolean((c as { is_eu_customer?: boolean }).is_eu_customer),
                      notes: c.notes,
                      status: c.status ?? "active",
                    });
                    setOpen(true);
                  }}
                >
                  <Pencil className="size-4" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Kunde wirklich löschen?</AlertDialogTitle>
                      <AlertDialogDescription>
                        {`Der Kunde „${c.company || c.name || "ohne Namen"}" wird unwiderruflich gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.`}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                      <AlertDialogAction
                        className={buttonVariants({ variant: "destructive" })}
                        onClick={() => remove.mutate(c.id)}
                      >
                        Löschen
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
