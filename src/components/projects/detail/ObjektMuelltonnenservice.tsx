import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Bin = "rest" | "gelb" | "papier" | "bio";
type WasteDate = { id: string; bin_type: Bin; collection_date: string; put_out_done: boolean; return_done: boolean };
const bins: { id: Bin; name: string }[] = [
  { id: "rest", name: "Restmüll (Schwarz)" },
  { id: "gelb", name: "Gelbe Tonne" },
  { id: "papier", name: "Papier (Blau)" },
  { id: "bio", name: "Biomüll (Braun)" },
];
const db = supabase as SupabaseClient;

export function ObjektMuelltonnenservice({ projectId }: { projectId: string }) {
  const [enabled, setEnabled] = useState(false);
  const [selected, setSelected] = useState<Bin[]>([]);
  const [days, setDays] = useState(1);
  const [dates, setDates] = useState<WasteDate[]>([]);
  const [newDate, setNewDate] = useState("");
  const [newBin, setNewBin] = useState<Bin>("rest");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [preview, setPreview] = useState<{bin_type:Bin;collection_date:string}[]>([]);

  async function reload() {
    const [settings, entries] = await Promise.all([
      db.from("project_waste_settings").select("*").eq("project_id", projectId).maybeSingle(),
      db.from("project_waste_dates").select("*").eq("project_id", projectId).order("collection_date"),
    ]);
    if (settings.error || entries.error) {
      toast.error("Mülltonnenservice konnte nicht geladen werden. Datenbankmigration prüfen.");
      return;
    }
    setEnabled(settings.data?.enabled ?? false);
    setSelected(settings.data?.selected_bins ?? []);
    setDays(settings.data?.reminder_days ?? 1);
    setDates(entries.data ?? []);
    setLoaded(true);
  }
  useEffect(() => { void reload(); }, [projectId]);

  async function save() {
    setBusy(true);
    const {data:{user}} = await db.auth.getUser();
    if (!user) { toast.error("Bitte anmelden."); setBusy(false); return; }
    const {error} = await db.from("project_waste_settings").upsert({
      project_id:projectId,user_id:user.id,enabled,selected_bins:selected,reminder_days:days,
    });
    setBusy(false);
    if (error) toast.error(error.message); else toast.success("Vertragsumfang gespeichert.");
  }
  async function addDates(items: {bin_type:Bin;collection_date:string}[]) {
    if (!items.length) return;
    setBusy(true);
    const {data:{user}} = await db.auth.getUser();
    if (!user) { toast.error("Bitte anmelden."); setBusy(false); return; }
    const {error} = await db.from("project_waste_dates").upsert(
      items.map(item=>({...item,project_id:projectId,user_id:user.id})),
      {onConflict:"project_id,bin_type,collection_date",ignoreDuplicates:true}
    );
    setBusy(false);
    if(error) toast.error(error.message);
    else { toast.success("Abfuhrtermine gespeichert."); setPreview([]); await reload(); }
  }
  async function mark(item:WasteDate, field:"put_out_done"|"return_done") {
    const {error}=await db.from("project_waste_dates").update({[field]:!item[field]}).eq("id",item.id).eq("project_id",projectId);
    if(error) toast.error(error.message); else await reload();
  }
  async function readCalendar(file:File) {
    if(!file.name.toLowerCase().endsWith(".pdf")) {toast.error("Bitte PDF hochladen.");return;}
    if(file.size>10_000_000){toast.error("PDF darf maximal 10 MB groß sein.");return;}
    setBusy(true);
    try {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
      const doc=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
      const found:{bin_type:Bin;collection_date:string}[]=[];
      for(let p=1;p<=Math.min(doc.numPages,24);p++){
        const page=await doc.getPage(p);
        const text=(await page.getTextContent()).items.map(item=>("str" in item?String(item.str):"")).join(" ");
        // Only unambiguous single-line text associations are imported; complex calendar grids require manual entry.
        for(const line of text.split(/(?<=\d{4})\s+|\n/g)){
          const match=line.match(/(\d{1,2})\.(\d{1,2})\.(20\d{2})/);
          if(!match)continue;
          const label=line.toLowerCase();
          const types:Bin[]=[];
          if(/restmüll|restabfall|schwarze tonne/.test(label))types.push("rest");
          if(/gelbe tonne|gelber sack|leichtverpackung/.test(label))types.push("gelb");
          if(/papier|pappe|blaue tonne/.test(label))types.push("papier");
          if(/bioabfall|biomüll|biotonne/.test(label))types.push("bio");
          const date=`${match[3]}-${match[2].padStart(2,"0")}-${match[1].padStart(2,"0")}`;
          if(Number.isNaN(new Date(date+"T12:00:00").getTime()))continue;
          for(const type of types) if(selected.includes(type))found.push({bin_type:type,collection_date:date});
        }
      }
      const unique=[...new Map(found.map(x=>[x.bin_type+x.collection_date,x])).values()];
      setPreview(unique.sort((a,b)=>a.collection_date.localeCompare(b.collection_date)));
      toast.info(unique.length?"Erkannte Termine bitte vor dem Speichern prüfen.":"Keine eindeutigen Termine erkannt. Bitte manuell eintragen.");
    }catch{toast.error("PDF konnte nicht gelesen werden. Bitte Termine manuell eintragen.");}
    finally{setBusy(false);}
  }
  const today=new Date().toLocaleDateString("sv-SE");
  const upcoming=dates.filter(d=>selected.includes(d.bin_type)&&d.collection_date>=today);
  return <section className="surface space-y-4 p-5">
    <h2 className="text-lg font-semibold">Mülltonnen & Abfuhrkalender</h2>
    {!loaded?<p>Lade Einstellungen …</p>:<>
      <label className="flex items-center gap-2"><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/> Mülltonnenservice im Vertrag</label>
      {enabled&&<>
        <p className="text-sm text-muted-foreground">Nur manuell ausgewählte Tonnen gehören zum Vertragsumfang.</p>
        <div className="grid gap-2 sm:grid-cols-2">{bins.map(bin=><label key={bin.id} className="flex gap-2 items-center">
          <input type="checkbox" checked={selected.includes(bin.id)} onChange={e=>setSelected(old=>e.target.checked?[...old,bin.id]:old.filter(x=>x!==bin.id))}/>{bin.name}
        </label>)}</div>
        <label className="block text-sm">Erinnerung (Tage vor Abfuhr)
          <select className="ml-2 rounded border bg-background p-2" value={days} onChange={e=>setDays(Number(e.target.value))}>{[0,1,2,3,4,5,6,7].map(n=><option key={n} value={n}>{n}</option>)}</select>
        </label>
      </>}
      <button className="rounded border px-3 py-2" disabled={busy} onClick={save}>Vertragsumfang speichern</button>
      {enabled&&selected.length>0&&<>
        <div className="space-y-2 border-t pt-4">
          <label className="block text-sm font-medium">Abfuhrkalender (PDF, max. 10 MB)
            <input className="mt-2 block w-full text-sm" type="file" accept=".pdf,application/pdf" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file)void readCalendar(file);e.target.value="";}}/>
          </label>
          <p className="text-xs text-muted-foreground">Automatische Erkennung nur bei eindeutigem Text. Termine vor Übernahme kontrollieren; grafische Kalender bitte manuell erfassen.</p>
          {preview.length>0&&<div className="rounded border p-3 space-y-2"><p className="font-medium">Erkannte Termine prüfen ({preview.length})</p>
            <div className="max-h-40 overflow-auto text-sm">{preview.map((d,i)=><div key={i}>{d.collection_date} · {bins.find(b=>b.id===d.bin_type)?.name}</div>)}</div>
            <button className="rounded border px-3 py-2" disabled={busy} onClick={()=>addDates(preview)}>Geprüfte Termine übernehmen</button>
            <button className="ml-2 underline" onClick={()=>setPreview([])}>Verwerfen</button>
          </div>}
          <div className="flex flex-wrap gap-2 items-center">
            <input aria-label="Abfuhrdatum" className="rounded border bg-background p-2" type="date" value={newDate} onChange={e=>setNewDate(e.target.value)}/>
            <select aria-label="Tonnenart" className="rounded border bg-background p-2" value={selected.includes(newBin)?newBin:selected[0]} onChange={e=>setNewBin(e.target.value as Bin)}>{bins.filter(b=>selected.includes(b.id)).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select>
            <button className="rounded border px-3 py-2" disabled={!newDate||busy} onClick={()=>addDates([{bin_type:selected.includes(newBin)?newBin:selected[0],collection_date:newDate}])}>Termin hinzufügen</button>
          </div>
        </div>
        <div className="space-y-2"><h3 className="font-medium">Nächste Abfuhrtermine</h3>
          {upcoming.length===0?<p className="text-sm text-muted-foreground">Keine bevorstehenden Termine gespeichert.</p>:upcoming.slice(0,20).map(d=>{
            const diff=Math.ceil((new Date(d.collection_date+"T12:00:00").getTime()-new Date(today+"T12:00:00").getTime())/86400000);
            return <div key={d.id} className="rounded border p-3 text-sm">
              <strong>{d.collection_date} · {bins.find(b=>b.id===d.bin_type)?.name}</strong>
              {diff<=days&&<span className="ml-2 text-amber-600">⚠ Bald fällig</span>}
              <div className="flex flex-wrap gap-4 mt-2">
                <label><input type="checkbox" checked={d.put_out_done} onChange={()=>mark(d,"put_out_done")}/> Rausgestellt</label>
                <label><input type="checkbox" checked={d.return_done} onChange={()=>mark(d,"return_done")}/> Zurückgestellt</label>
              </div>
            </div>;
          })}</div>
      </>}
    </>}
  </section>;
}
