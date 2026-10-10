export type TeamMember = { rowId: string; employeeId: string; name: string };

export type DragPayload =
  | { kind: "entry"; id: string; employeeId: string | null; date: string }
  | { kind: "employee"; employeeId: string };
