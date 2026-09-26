import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { EinsatzKalender } from "@/components/EinsatzKalender";
import { LoadError, firstError } from "@/components/LoadError";

export function TeamKalenderPanel() {
  const { data: employees = [], error: employeesError } = useQuery({
    queryKey: ["employees", "team-calendar"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id,name,hourly_rate,weekly_hours")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: projects = [], error: projectsError } = useQuery({
    queryKey: ["projects", "team-calendar"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id,name,city")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Kalender</h2>
        <p className="text-sm text-muted-foreground">
          Zeigt dieselben Einsätze wie der Dienstplan – ohne doppelte Planungsdaten.
        </p>
      </div>
      <LoadError
        error={firstError(employeesError, projectsError)}
        title="Kalenderdaten konnten nicht geladen werden"
      />
      <EinsatzKalender employees={employees} projects={projects} />
    </div>
  );
}
