import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const db = supabase as SupabaseClient;
const labels: Record<string,string> = {rest:"Restmüll",gelb:"Gelbe Tonne",papier:"Papier",bio:"Biomüll"};
type WasteTask = {id:string;project_id:string;bin_type:string;collection_date:string;put_out_done:boolean;return_done:boolean};
function dayOffset(date:string) {
  const now = new Date(); const today = Date.UTC(now.getFullYear(),now.getMonth(),now.getDate());
  const [y = 1970, m = 1, d = 1] = date.split("-").map(Number);
  return Math.round((Date.UTC(y,m-1,d)-today)/86400000);
}
export function EmployeeWasteTasks({employeeId}:{employeeId:string}) {
  const client = useQueryClient();
  const [busy,setBusy] = useState<string|null>(null);
  const {data:tasks=[],error,isLoading} = useQuery({
    queryKey:["employee-waste-tasks",employeeId],
    enabled:!!employeeId,
    refetchInterval:60000,
    queryFn:async()=>{
      const from = new Date(); from.setDate(from.getDate()-7);
      const until = new Date(); until.setDate(until.getDate()+14);
      const dateKey=(d:Date)=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
      const {data,error}=await db.from("project_waste_dates").select("id,project_id,bin_type,collection_date,put_out_done,return_done").eq("employee_id",employeeId).gte("collection_date",dateKey(from)).lte("collection_date",dateKey(until)).order("collection_date");
      if(error)throw error;
      const entries=(data??[]) as WasteTask[];
      const ids=[...new Set(entries.map(x=>x.project_id))];
      if(!ids.length)return [];
      const projects=await db.from("projects").select("id,name").in("id",ids);
      // Employee RLS may restrict project names; task visibility is independent.
      const names=new Map((projects.data??[]).map((p:{id:string;name:string})=>[p.id,p.name]));
      return entries.map(t=>({...t,project_name:names.get(t.project_id)??"Objekt"}));
    }
  });
  async function done(id:string,action:"out"|"return"){
    setBusy(id+action);
    const {error}=await db.rpc("complete_my_waste_task",{p_date_id:id,p_action:action});
    setBusy(null);
    if(error)toast.error(error.message);
    else {toast.success("Aufgabe erledigt.");void client.invalidateQueries({queryKey:["employee-waste-tasks",employeeId]});}
  }
  return <section className="surface space-y-3 p-4 sm:p-5">
    <h2 className="text-lg font-semibold">Meine Mülltonnen-Aufgaben</h2>
    <p className="text-sm text-muted-foreground">Erinnerungen zum Rausstellen und Zurückstellen Ihrer zugewiesenen Tonnen.</p>
    {isLoading?<p>Lädt …</p>:error?<p className="text-sm text-destructive">Aufgaben konnten nicht geladen werden.</p>:
    tasks.filter(t=>!t.return_done).length===0?<p className="text-sm text-muted-foreground">Keine offenen Mülltonnen-Aufgaben.</p>:
    <div className="space-y-3">{tasks.filter(t=>!t.return_done).map(t=>{
      const diff=dayOffset(t.collection_date);
      const status=diff<0?"Überfällig":diff===0?"Heute fällig":diff===1?"Morgen fällig":`In ${diff} Tagen`;
      return <article key={t.id} className="rounded-lg border p-3 space-y-2">
        <div className="font-medium">{t.project_name} · {labels[t.bin_type]??t.bin_type}</div>
        <p className="text-sm">{t.collection_date} · {status}</p>
        {!t.put_out_done?<Button disabled={busy!==null} onClick={()=>void done(t.id,"out")}>Rausgestellt bestätigen</Button>:
        <Button disabled={busy!==null || diff>0} onClick={()=>void done(t.id,"return")}>Zurückgestellt bestätigen</Button>}
      </article>;
    })}</div>}
  </section>;
}
