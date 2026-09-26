import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Pencil, Plus } from "lucide-react";

const ROLES = ["Reinigungskraft", "Vorarbeiter", "Objektleiter", "Springer", "Verwaltung"];
const CONTRACTS = ["Vollzeit", "Teilzeit", "Minijob", "Werkstudent", "Befristet", "Unbefristet", "Ausbildung"];

type Form = {
  id?: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  personnel_number: string;
  birth_date: string;
  address_line: string;
  postal_code: string;
  city: string;
  contract_type: string;
  contract_start: string;
  contract_end: string;
  weekly_hours: string;
  hourly_rate: string;
  vacation_days_per_year: string;
  has_driving_license: boolean;
  driving_license_classes: string;
  qualification: string;
  has_experience_certificate: boolean;
  experience_details: string;
  personnel_notes: string;
  active: boolean;
};

const empty: Form = {
  name: "", role: "Reinigungskraft", email: "", phone: "", personnel_number: "",
  birth_date: "", address_line: "", postal_code: "", city: "", contract_type: "",
  contract_start: "", contract_end: "", weekly_hours: "0", hourly_rate: "0",
  vacation_days_per_year: "0", has_driving_license: false, driving_license_classes: "",
  qualification: "", has_experience_certificate: false, experience_details: "",
  personnel_notes: "", active: true,
};

const n = (v: string) => Number(v.replace(",", ".")) || 0;

export function PersonalStammdatenPanel() {
  const qc = useQueryClient();
  const [open,setOpen] = React.useState(false);
  const [form,setForm] = React.useState<Form>(empty);

  const {data: employees=[]} = useQuery({
    queryKey:["employees","stammdaten"],
    queryFn: async()=> {
      const {data,error}=await supabase.from("employees").select("*").order("name");
      if(error) throw error;
      return data ?? [];
    }
  });

  const save = useMutation({
    mutationFn: async (v:Form) => {
      const {data:auth}=await supabase.auth.getUser();
      if(!auth.user?.id) throw new Error("Nicht angemeldet");
      const payload = {
        name:v.name.trim(), role:v.role, email:v.email.trim(), phone:v.phone.trim(),
        personnel_number:v.personnel_number.trim(), birth_date:v.birth_date||null,
        address_line:v.address_line.trim(), postal_code:v.postal_code.trim(), city:v.city.trim(),
        contract_type:v.contract_type, contract_start:v.contract_start||null, contract_end:v.contract_end||null,
        weekly_hours:n(v.weekly_hours), hourly_rate:n(v.hourly_rate),
        vacation_days_per_year:n(v.vacation_days_per_year),
        has_driving_license:v.has_driving_license,
        driving_license_classes:v.has_driving_license?v.driving_license_classes.trim():"",
        qualification:v.qualification.trim(),
        has_experience_certificate:v.has_experience_certificate,
        experience_details:v.has_experience_certificate?v.experience_details.trim():"",
        personnel_notes:v.personnel_notes.trim(), active:v.active,
      };
      if(v.id){
        const {error}=await supabase.from("employees").update(payload as never).eq("id",v.id);
        if(error) throw error;
      }else{
        const {error}=await supabase.from("employees").insert({...payload,user_id:auth.user.id} as never);
        if(error) throw error;
      }
    },
    onSuccess:()=>{toast.success("Personalakte gespeichert");setOpen(false);setForm(empty);qc.invalidateQueries({queryKey:["employees"]});},
    onError:(e:Error)=>toast.error(e.message)
  });

  const edit=(e:any)=>{setForm({
    id:e.id,name:e.name??"",role:e.role||"Reinigungskraft",email:e.email??"",phone:e.phone??"",
    personnel_number:e.personnel_number??"",birth_date:e.birth_date??"",address_line:e.address_line??"",
    postal_code:e.postal_code??"",city:e.city??"",contract_type:e.contract_type??"",
    contract_start:e.contract_start??"",contract_end:e.contract_end??"",weekly_hours:String(e.weekly_hours??0),
    hourly_rate:String(e.hourly_rate??0),vacation_days_per_year:String(e.vacation_days_per_year??0),
    has_driving_license:Boolean(e.has_driving_license),driving_license_classes:e.driving_license_classes??"",
    qualification:e.qualification??"",has_experience_certificate:Boolean(e.has_experience_certificate),
    experience_details:e.experience_details??"",personnel_notes:e.personnel_notes??"",active:e.active!==false
  });setOpen(true)};

  const field=(key:keyof Form,label:string,type="text")=>(
    <div className="space-y-2"><Label htmlFor={String(key)}>{label}</Label><Input id={String(key)} type={type}
      value={typeof form[key]==="string"?String(form[key]):""}
      onChange={e=>setForm({...form,[key]:e.target.value})}/></div>
  );

  return <div className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="text-xl font-semibold">Personalstammdaten</h2>
      <p className="text-sm text-muted-foreground">Nur Mitarbeiterakten und vollständige Personaldaten.</p></div>
      <Dialog open={open} onOpenChange={o=>{setOpen(o);if(!o)setForm(empty)}}>
        <DialogTrigger asChild><Button><Plus className="size-4"/>Mitarbeiter anlegen</Button></DialogTrigger>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader><DialogTitle>{form.id?"Personalakte bearbeiten":"Neue Personalakte"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            {field("name","Name")}
            {field("personnel_number","Personalnummer")}
            {field("birth_date","Geburtsdatum","date")}
            <div className="space-y-2"><Label>Funktion</Label><Select value={form.role} onValueChange={v=>setForm({...form,role:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{ROLES.map(x=><SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select></div>
            {field("email","E-Mail","email")}{field("phone","Telefon")}
            {field("address_line","Straße und Hausnummer")}
            {field("postal_code","PLZ")}{field("city","Ort")}
            <div className="space-y-2"><Label>Vertragsart</Label><Select value={form.contract_type} onValueChange={v=>setForm({...form,contract_type:v})}><SelectTrigger><SelectValue placeholder="Vertragsart wählen"/></SelectTrigger><SelectContent>{CONTRACTS.map(x=><SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select></div>
            {field("contract_start","Vertragsbeginn","date")}{field("contract_end","Vertragsende","date")}
            {field("weekly_hours","Wochenstunden")}{field("hourly_rate","Stundenlohn €")}
            {field("vacation_days_per_year","Urlaubstage / Jahr")}
            <div className="space-y-3 sm:col-span-2">
              <label className="flex items-center gap-2"><Checkbox checked={form.has_driving_license} onCheckedChange={v=>setForm({...form,has_driving_license:Boolean(v)})}/>Führerschein vorhanden</label>
              {form.has_driving_license&&field("driving_license_classes","Führerscheinklassen, z. B. B, BE")}
            </div>
            <div className="space-y-2 sm:col-span-2"><Label>Qualifikation / Ausbildung</Label><Input value={form.qualification} onChange={e=>setForm({...form,qualification:e.target.value})} placeholder="z. B. Gebäudereiniger-Ausbildung, Schulung, Zertifikat"/></div>
            <div className="space-y-3 sm:col-span-2">
              <label className="flex items-center gap-2"><Checkbox checked={form.has_experience_certificate} onCheckedChange={v=>setForm({...form,has_experience_certificate:Boolean(v)})}/>Arbeits-/Erfahrungsnachweis vorhanden</label>
              {form.has_experience_certificate&&<div className="space-y-2"><Label>Nachweis / Erfahrung</Label><Textarea value={form.experience_details} onChange={e=>setForm({...form,experience_details:e.target.value})}/></div>}
            </div>
            <div className="space-y-2 sm:col-span-2"><Label>Personalnotizen</Label><Textarea rows={4} value={form.personnel_notes} onChange={e=>setForm({...form,personnel_notes:e.target.value})}/></div>
            <label className="flex items-center gap-2 sm:col-span-2"><Checkbox checked={form.active} onCheckedChange={v=>setForm({...form,active:Boolean(v)})}/>Mitarbeiter aktiv</label>
          </div>
          <DialogFooter><Button onClick={()=>save.mutate(form)} disabled={!form.name.trim()||save.isPending}>Speichern</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>

    <div className="surface overflow-x-auto">
      <table className="w-full min-w-[900px] text-sm">
        <thead><tr className="border-b text-left text-muted-foreground">
          <th className="px-4 py-3">Mitarbeiter</th><th className="px-4 py-3">Geburtsdatum</th>
          <th className="px-4 py-3">Vertrag</th><th className="px-4 py-3">Führerschein</th>
          <th className="px-4 py-3">Qualifikation</th><th className="px-4 py-3">Status</th><th/>
        </tr></thead>
        <tbody>{employees.map((e:any)=><tr key={e.id} className="border-b last:border-0">
          <td className="px-4 py-3"><div className="font-medium">{e.name}</div><div className="text-xs text-muted-foreground">{e.personnel_number||"Keine Personalnr."} · {e.role||"—"}</div></td>
          <td className="px-4 py-3">{e.birth_date||"—"}</td>
          <td className="px-4 py-3">{e.contract_type||"—"}<div className="text-xs text-muted-foreground">{[e.contract_start,e.contract_end].filter(Boolean).join(" – ")}</div></td>
          <td className="px-4 py-3">{e.has_driving_license?(e.driving_license_classes||"Ja"):"Nein"}</td>
          <td className="px-4 py-3">{e.qualification||"—"}</td>
          <td className="px-4 py-3">{e.active===false?"Inaktiv":"Aktiv"}</td>
          <td className="px-4 py-3 text-right"><Button variant="ghost" size="icon" onClick={()=>edit(e)}><Pencil className="size-4"/></Button></td>
        </tr>)}</tbody>
      </table>
    </div>
  </div>
}
