import { today } from "@/lib/format";

export const CATEGORIES = [
  "Material",
  "Reinigungsmittel",
  "Fahrzeug",
  "Löhne",
  "Sozialabgaben / Arbeitgeberabgaben",
  "Miete",
  "Versicherung",
  "Sonstiges",
];

export type Form = {
  supplier: string;
  expense_date: string;
  category: string;
  document_number: string;
  net_amount: string;
  vat_amount: string;
  notes: string;
  receipt_url: string;
  project_id: string;
};

export const empty: Form = {
  supplier: "",
  expense_date: today(),
  category: "Sonstiges",
  document_number: "",
  net_amount: "",
  vat_amount: "",
  notes: "",
  receipt_url: "",
  project_id: "",
};

export function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Datei konnte nicht gelesen werden."));
    reader.readAsDataURL(file);
  });
}

export type ExpenseRowData = {
  id: string;
  supplier: string;
  expense_date: string;
  category: string;
  document_number: string;
  gross_amount: number;
  net_amount: number;
  receipt_url: string;
};
