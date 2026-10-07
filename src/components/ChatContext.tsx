import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { chatDb, type ChatContext as Context } from "@/lib/chat";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { LoadError } from "@/components/LoadError";
import { formatDate } from "@/lib/format";

export function ChatContext({ context, employee }: { context: Context; employee: boolean }) {
  const [open, setOpen] = useState(false);
  const { data, error, isLoading } = useQuery({
    queryKey: ["chat_context", context.assignment_id, context.report_id],
    enabled: open,
    queryFn: async () => {
      if (context.report_id) {
        const { data, error } = await chatDb
          .from("employee_task_reports")
          .select(
            "description,material_name,status,admin_reply,work_date,assignment_id,project_id,projects(name)",
          )
          .eq("id", context.report_id)
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("Meldung nicht mehr verfügbar.");
        return {
          ...data,
          name: (data.projects as unknown as { name: string } | null)?.name ?? "Objekt",
          assignment_id: data.assignment_id as string | null,
        };
      }
      const { data, error } = await chatDb
        .from("project_assignments")
        .select("id,project_id,projects(name)")
        .eq("id", context.assignment_id!)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Einsatz nicht mehr verfügbar.");
      return {
        name: (data.projects as unknown as { name: string } | null)?.name ?? "Objekt",
        project_id: data.project_id as string,
        assignment_id: data.id as string,
        description: "",
        material_name: "",
        status: "",
        admin_reply: "",
        work_date: context.work_date,
      };
    },
  });
  if (!context.assignment_id && !context.report_id) return null;
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="mt-2 h-auto whitespace-normal text-left"
        onClick={() => setOpen(true)}
      >
        {context.report_id ? "Meldung ansehen" : "Einsatz ansehen"}
        {context.work_date ? ` · ${formatDate(context.work_date)}` : ""}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{context.report_id ? "Meldung zum Einsatz" : "Einsatz"}</DialogTitle>
            <DialogDescription>{data?.name || "Details zum Verweis"}</DialogDescription>
          </DialogHeader>
          <LoadError error={error} />
          {isLoading ? <p>Details werden geladen …</p> : null}
          {data ? (
            <div className="space-y-3 text-sm">
              <p>
                {data.work_date ? formatDate(data.work_date) : ""}{" "}
                {data.status ? `· ${data.status.replaceAll("_", " ")}` : ""}
              </p>
              {data.material_name ? <p className="font-medium">{data.material_name}</p> : null}
              <p className="whitespace-pre-wrap break-words">{data.description}</p>
              {data.admin_reply ? (
                <p className="whitespace-pre-wrap rounded bg-muted p-3">
                  Verwaltung: {data.admin_reply}
                </p>
              ) : null}
              {employee && data.assignment_id && data.work_date ? (
                <Button asChild>
                  <Link
                    to="/meine-zeiten"
                    search={{
                      projekt: data.project_id,
                      einsatz: data.assignment_id,
                      datum: data.work_date,
                    }}
                  >
                    Einsatz öffnen
                  </Link>
                </Button>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
