export type QmEvent = {
  id: number;
  event_type: string;
  created_at: string;
  details: Record<string, unknown>;
};

export type QmCase = {
  id: string;
  customer_id: string | null;
  project_id: string | null;
  assigned_employee_id: string | null;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  due_date: string | null;
  employee_instruction: string;
  action_note: string;
  solution: string;
  attachment_paths: string[];
  occurred_at: string;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

export const emptyForm = {
  id: "",
  customer_id: "",
  project_id: "",
  assigned_employee_id: "",
  title: "",
  description: "",
  category: "reinigung",
  priority: "mittel",
  status: "neu",
  due_date: "",
  employee_instruction: "",
  action_note: "",
  solution: "",
  occurred_at: new Date().toISOString().slice(0, 10),
  attachment_paths: [] as string[],
};

export const statusLabel: Record<string, string> = {
  neu: "Neu",
  in_bearbeitung: "In Bearbeitung",
  erledigt: "Erledigt",
};

export const priorityLabel: Record<string, string> = {
  niedrig: "Niedrig",
  mittel: "Mittel",
  hoch: "Hoch",
};

export const categoryLabel: Record<string, string> = {
  reinigung: "Reinigung",
  personal: "Personal",
  termin: "Termin",
  material: "Material",
  sonstiges: "Sonstiges",
};
