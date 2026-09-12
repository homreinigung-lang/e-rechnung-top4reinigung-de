import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// The checked-in generated Database type predates the Fahrtenbuch migrations.
// Keep these read models explicit until types can be generated from a verified database.
type Trip = {
  id: string;
  user_id: string;
  vehicle_id: string | null;
  trip_date: string;
  trip_time: string | null;
  return_time: string | null;
  trip_type: string;
  from_location: string;
  customer_name: string;
  to_location: string;
  start_km: number;
  end_km: number;
  distance_km: number;
  notes: string;
};

type Vehicle = {
  id: string;
  user_id: string;
  vehicle_name: string;
  license_plate: string;
};

type ReadTable<Row extends Record<string, unknown>> = {
  Row: Row;
  Insert: never;
  Update: never;
  Relationships: [];
};

type FahrtenbuchDatabase = {
  public: {
    Tables: {
      fahrtenbuch_entries: ReadTable<Trip>;
      fahrtenbuch_vehicles: ReadTable<Vehicle>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
};

export const fahrtenbuchClient = supabase as unknown as SupabaseClient<FahrtenbuchDatabase>;
