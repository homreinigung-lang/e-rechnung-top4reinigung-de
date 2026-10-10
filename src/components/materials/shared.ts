export type Material = {
  id: string;
  user_id: string;
  name: string;
  sku: string;
  unit: string;
  current_stock: number;
  min_stock: number;
  unit_cost: number;
  supplier: string;
  notes: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type Project = {
  id: string;
  name: string | null;
  customer_name: string | null;
  city: string | null;
};

export type ProjectMaterial = {
  id: string;
  user_id: string;
  project_id: string;
  material_id: string;
  target_stock: number;
  object_stock: number;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type MaterialOrder = {
  id: string;
  user_id: string;
  project_id: string | null;
  material_id: string;
  quantity: number;
  status: string;
  supplier: string;
  order_date: string | null;
  expected_date: string | null;
  note: string;
  created_at: string;
  updated_at: string;
};

export type MaterialConsumption = {
  id: string;
  user_id: string;
  project_id: string;
  material_id: string;
  quantity: number;
  unit_cost: number;
  consumed_on: string;
  note: string;
  created_at: string;
  updated_at: string;
};
