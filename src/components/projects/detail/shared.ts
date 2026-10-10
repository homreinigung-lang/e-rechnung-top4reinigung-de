import type { Database } from "@/integrations/supabase/types";

export type ProjectUpdate = Database["public"]["Tables"]["projects"]["Update"];

export type Room = {
  id: string;
  position: number;
  name: string;
  floor: string;
  usage_type: string;
  area_sqm: number;
  floor_covering: string;
  frequency: string;
  note: string;
  confirmed: boolean;
};

export type LvItem = {
  id: string;
  position: number;
  section: string;
  title: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  deadline: string | null;
  evidence: string;
  critical: boolean;
  done: boolean;
};
