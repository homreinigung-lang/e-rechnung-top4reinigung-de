import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { CheckCircle2, FileDown, FileSignature, RotateCcw, Save } from "lucide-react";
import { formatDate } from "@/lib/format";

const SERVICES = [
  "Unterhaltsreinigung",
  "Sanitärreinigung",
  "Bodenreinigung",
  "Glasreinigung",
  "Treppenhausreinigung",
  "Grundreinigung",
  "Sonderreinigung",
  "Desinfektionsreinigung",
];

type Entry = {
  id: string;
  employee_name?: string | null;
  work_date: string;
  start_time?: string | null;
  end_time?: string | null;
  break_minutes?: number | null;
  hours?: number | null;
  location?: string | null;
  note?: string | null;
  photo_paths?: string[] | null;
  performance_services?: string[] | null;
  performance_note?: string | null;
  employee_signature?: string | null;
  customer_signature?: string | null;
  customer_signer_name?: string | null;
  performance_status?: string | null;
  performance_completed_at?: string | null;
};

type Project = {
  id: string;
  name: string;
  address_line: string;
  postal_code: string;
  city: string;
  customer_name?: string;
};

function SignaturePad({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  const drawing = React.useRef(false);

  const redraw = React.useCallback(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      img.src = value;
    }
  }, [value]);

  React.useEffect(() => redraw(), [redraw]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = ref.current!;
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (canvas.width / r.width), y: (e.clientY - r.top) * (canvas.height / r.height) };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    const p = point(e);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111827";
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };
  const end = () => {
    drawing.current = false;
    const canvas = ref.current;
    if (canvas) onChange(canvas.toDataURL("image/png"));
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <canvas ref={ref} width={600} height={180} className="h-32 w-full touch-none rounded-md border bg-white" onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />
      <Button type="button" size="sm" variant="ghost" onClick={() => onChange("")}>
        <RotateCcw className="size-4" /> Unterschrift löschen
      </Button>
    </div>
  );
}

export function LeistungsnachweisDialog({ entry, project }: { entry: Entry; project?: Project }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [services, setServices] = React.useState<string[]>(entry.performance_services ?? []);
  const [note, setNote] = React.useState(entry.performance_note ?? "");
  const [employeeSignature, setEmployeeSignature] = React.useState(entry.employee_signature ?? "");
  const [customerSignature, setCustomerSignature] = React.useState(entry.customer_signature ?? "");
  const [customerSignerName, setCustomerSignerName] = React.useState(entry.customer_signer_name ?? "");

  React.useEffect(() => {
    if (!open) return;
    setServices(entry.performance_services ?? []);
    setNote(entry.performance_note ?? "");
    setEmployeeSignature(entry.employee_signature ?? "");
    setCustomerSignature(entry.customer_signature ?? "");
    setCustomerSignerName(entry.customer_signer_name ?? "");
  }, [open, entry]);

  const save = useMutation({
    mutationFn: async (completed: boolean) => {
      if (services.length === 0) throw new Error("Bitte mindestens eine ausgeführte Leistung auswählen.");
      if (completed && !employeeSignature) throw new Error("Bitte die Unterschrift des Mitarbeiters erfassen.");
      if (completed && !customerSignature) throw new Error("Bitte die Unterschrift des Kunden erfassen.");
      const payload = {
        performance_services: services,
        performance_note: note.trim(),
        employee_signature: employeeSignature,
        customer_signature: customerSignature,
        customer_signer_name: customerSignerName.trim(),
        performance_status: completed ? "completed" : "draft",
        performance_completed_at: completed ? new Date().toISOString() : null,
      };
      const { error } = await supabase.from("time_entries").update(payload as never).eq("id", entry.id);
      if (error) throw error;
      return completed;
    },
    onSuccess: (completed) => {
      queryClient.invalidateQueries({ queryKey: ["my_time_entries"] });
      queryClient.invalidateQueries({ queryKey: ["time_entries"] });
      toast.success(completed ? "Leistungsnachweis abgeschlossen" : "Leistungsnachweis gespeichert");
      if (completed) setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function createPdf() {
    if (services.length === 0) {
      toast.error("Bitte mindestens eine ausgeführte Leistung auswählen.");
      return;
    }
    const [{ jsPDF }, settingsResult] = await Promise.all([
      import("jspdf"),
      supabase.from("company_settings").select("company_name,address_line,postal_code,city,email,phone").maybeSingle(),
    ]);
    const settings = settingsResult.data;
    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    let y = 18;
    pdf.setFontSize(17);
    pdf.text("Leistungsnachweis", 18, y);
    y += 9;
    pdf.setFontSize(10);
    pdf.text(settings?.company_name || "Unternehmen", 18, y);
    y += 5;
    const companyLine = [settings?.address_line, [settings?.postal_code, settings?.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    if (companyLine) { pdf.text(companyLine, 18, y); y += 5; }
    y += 4;
    const rows: Array<[string, string]> = [
      ["Nachweis-Nr.", `LN-${entry.work_date.replaceAll("-", "")}-${entry.id.slice(0, 8).toUpperCase()}`],
      ["Kunde", project?.customer_name || "—"],
      ["Objekt", project?.name || entry.location || "—"],
      ["Einsatzort", project ? [project.address_line, project.postal_code, project.city].filter(Boolean).join(", ") : (entry.location || "—")],
      ["Datum", formatDate(entry.work_date)],
      ["Mitarbeiter", entry.employee_name || "—"],
      ["Arbeitszeit", entry.start_time && entry.end_time ? `${String(entry.start_time).slice(0,5)}–${String(entry.end_time).slice(0,5)} Uhr` : "—"],
      ["Pause", `${Number(entry.break_minutes ?? 0)} Min.`],
      ["Gesamt", `${Number(entry.hours ?? 0).toFixed(2).replace(".", ",")} Std.`],
    ];
    for (const [label, value] of rows) {
      pdf.setFont(undefined, "bold"); pdf.text(label, 18, y);
      pdf.setFont(undefined, "normal"); pdf.text(value, 55, y);
      y += 6;
    }
    y += 4;
    pdf.setFont(undefined, "bold"); pdf.text("Ausgeführte Leistungen", 18, y); y += 6;
    pdf.setFont(undefined, "normal");
    for (const service of services) { pdf.text(`• ${service}`, 22, y); y += 5; }
    if (note.trim()) {
      y += 3; pdf.setFont(undefined, "bold"); pdf.text("Bemerkungen", 18, y); y += 6;
      pdf.setFont(undefined, "normal");
      const lines = pdf.splitTextToSize(note.trim(), 170);
      pdf.text(lines, 18, y); y += lines.length * 5;
    }
    const photoCount = entry.photo_paths?.length ?? 0;
    y += 4; pdf.text(`Fotodokumentation: ${photoCount} Foto(s) zum Arbeitsnachweis gespeichert.`, 18, y); y += 10;
    pdf.setFont(undefined, "bold"); pdf.text("Unterschrift Mitarbeiter", 18, y); pdf.text("Unterschrift Kunde", 108, y); y += 4;
    if (employeeSignature) pdf.addImage(employeeSignature, "PNG", 18, y, 75, 24);
    if (customerSignature) pdf.addImage(customerSignature, "PNG", 108, y, 75, 24);
    y += 28;
    pdf.setFont(undefined, "normal");
    pdf.text(entry.employee_name || "", 18, y);
    pdf.text(customerSignerName || "Kunde", 108, y);
    pdf.save(`Leistungsnachweis_${entry.work_date}_${(entry.employee_name || "Mitarbeiter").replace(/\s+/g, "_")}.pdf`);
  }

  const completed = entry.performance_status === "completed";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant={completed ? "secondary" : "outline"}>
          {completed ? <CheckCircle2 className="size-4" /> : <FileSignature className="size-4" />}
          {completed ? "Leistungsnachweis" : "Leistungsnachweis erstellen"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Leistungsnachweis</DialogTitle>
          <DialogDescription>
            {formatDate(entry.work_date)} · {project?.name || entry.location || "Objekt"} · {Number(entry.hours ?? 0).toFixed(2)} Std.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label>Ausgeführte Leistungen</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {SERVICES.map((service) => (
                <label key={service} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                  <Checkbox
                    checked={services.includes(service)}
                    onCheckedChange={(checked) => setServices((current) => checked ? [...current, service] : current.filter((x) => x !== service))}
                  />
                  {service}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Bemerkungen</Label>
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="z. B. Reinigung gemäß Leistungsverzeichnis durchgeführt." />
          </div>

          <SignaturePad label="Unterschrift Mitarbeiter" value={employeeSignature} onChange={setEmployeeSignature} />

          <div className="space-y-2">
            <Label>Name des Kunden / Ansprechpartners</Label>
            <Input value={customerSignerName} onChange={(e) => setCustomerSignerName(e.target.value)} placeholder="Vor- und Nachname" />
          </div>

          <SignaturePad label="Unterschrift Kunde" value={customerSignature} onChange={setCustomerSignature} />
        </div>

        <DialogFooter className="flex-wrap sm:justify-between">
          <Button type="button" variant="outline" onClick={() => void createPdf()}>
            <FileDown className="size-4" /> PDF erstellen
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" disabled={save.isPending} onClick={() => save.mutate(false)}>
              <Save className="size-4" /> Entwurf speichern
            </Button>
            <Button type="button" disabled={save.isPending} onClick={() => save.mutate(true)}>
              <CheckCircle2 className="size-4" /> Leistungsnachweis abschließen
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
