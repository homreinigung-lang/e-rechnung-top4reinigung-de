import { z } from "zod";

const signatureSchema = z.object({
  name: z.string().trim().min(2).max(100),
  image: z
    .string()
    .max(500_000)
    .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/),
  signedAt: z.string().datetime(),
});
export type DeliverySignature = z.infer<typeof signatureSchema>;
const amount = z
  .string()
  .max(12)
  .refine(
    (v) => v === "" || /^\d{1,6}([.,]\d{1,3})?$/.test(v),
    "Bitte eine positive Menge eingeben, z. B. 2 oder 1,5.",
  );
export const deliveryNoteSchema = z
  .object({
    number: z.string().trim().min(1).max(60),
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    orderNumber: z.string().max(100),
    deliveryAddress: z.string().trim().min(1).max(450),
    quantityMode: z.literal("individual").optional(),
    packaging: z
      .object({
        toiletPaper: z.number().int().positive().max(1_000_000),
        handTowels: z.number().int().positive().max(1_000_000),
        soap: z.number().positive().max(1_000_000),
      })
      .optional(),
    rows: z
      .array(
        z.object({
          date: z
            .string()
            .refine(
              (v) =>
                v === "" ||
                (/^\d{4}-\d{2}-\d{2}$/.test(v) &&
                  !Number.isNaN(Date.parse(v)) &&
                  new Date(v).toISOString().slice(0, 10) === v),
              "Bitte ein gültiges Datum eingeben.",
            ),
          toiletPaper: amount,
          handTowels: amount,
          soap: amount,
          signature: signatureSchema.nullable(),
        }),
      )
      .length(5),
    supplierSignature: signatureSchema.nullable(),
    customerSignature: signatureSchema.nullable(),
  })
  .superRefine((note, ctx) => {
    note.rows.forEach((row, index) => {
      if (row.date && !row.date.startsWith(note.month)) {
        ctx.addIssue({
          code: "custom",
          path: ["rows", index, "date"],
          message: "Datum muss im gewählten Monat liegen.",
        });
      }
      if (
        (row.signature || [row.toiletPaper, row.handTowels, row.soap].some((v) => v !== "")) &&
        !row.date
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["rows", index, "date"],
          message: "Bitte das Lieferdatum dieser Woche eintragen.",
        });
      }
    });
  });
export type DeliveryNote = z.infer<typeof deliveryNoteSchema>;
export type DeliveryNoteRecord = {
  document_id: string;
  source_note_id?: string | null;
  data: DeliveryNote;
  scan_path: string | null;
  version: number;
};
export type ProjectDeliveryNoteRecord = DeliveryNoteRecord & {
  id: string;
  project_id: string;
  invoice_number?: string;
};
export const MATERIALS = [
  { key: "toiletPaper", label: "Toilettenpapier", detail: "3-lagig (Karton)", unit: "Kartons" },
  {
    key: "handTowels",
    label: "Handtuchpapier",
    detail: "2-lagig Z-Falz (Karton)",
    unit: "Kartons",
  },
  { key: "soap", label: "Flüssigseife", detail: "5-Liter-Kanister", unit: "Kanister" },
] as const;
/** Confirmed carton/canister contents; weekly entries remain rolls, packs and liters. */
export const DEFAULT_DELIVERY_PACKAGING = { toiletPaper: 32, handTowels: 15, soap: 5 } as const;
export function materialUnit(note: DeliveryNote, key: (typeof MATERIALS)[number]["key"]) {
  return note.quantityMode
    ? { toiletPaper: "Rollen", handTowels: "Packungen", soap: "Liter" }[key]
    : MATERIALS.find((m) => m.key === key)!.unit;
}
export function materialDetail(note: DeliveryNote, key: (typeof MATERIALS)[number]["key"]) {
  return note.quantityMode
    ? { toiletPaper: "3-lagig (Rollen)", handTowels: "Z-Falz (Packungen)", soap: "Liter" }[key]
    : MATERIALS.find((m) => m.key === key)!.detail;
}
export function deliveryTotals(note: DeliveryNote) {
  const sum = (key: (typeof MATERIALS)[number]["key"]) =>
    Math.round(
      note.rows.reduce((n, row) => n + Number((row[key] || "0").replace(",", ".")), 0) * 1000,
    ) / 1000;
  return { toiletPaper: sum("toiletPaper"), handTowels: sum("handTowels"), soap: sum("soap") };
}
export function deliveryMonthlyTotals(note: DeliveryNote) {
  const totals = deliveryTotals(note);
  if (!note.quantityMode) return totals;
  const contents = note.packaging ?? DEFAULT_DELIVERY_PACKAGING;
  const packages = (key: (typeof MATERIALS)[number]["key"]) =>
    Math.round((totals[key] / contents[key]) * 1000) / 1000;
  return {
    toiletPaper: packages("toiletPaper"),
    handTowels: packages("handTowels"),
    soap: packages("soap"),
  };
}
export function deliveryConversionLabel(note: DeliveryNote) {
  const p = note.packaging ?? DEFAULT_DELIVERY_PACKAGING;
  return `Umrechnung: ${deliveryNumber(p.toiletPaper)} Rollen/Karton · ${deliveryNumber(p.handTowels)} Packungen/Karton · ${deliveryNumber(p.soap)} Liter/Kanister`;
}
export function deliveryNumber(value: number) {
  return value.toLocaleString("de-DE", { maximumFractionDigits: 3 });
}
export function blankDeliveryNote(
  id: string,
  issueDate: string,
  orderNumber: string,
  address: string,
): DeliveryNote {
  const month = /^\d{4}-\d{2}/.exec(issueDate)?.[0] ?? new Date().toISOString().slice(0, 7);
  return {
    number: `LS-${month.slice(0, 4)}-${id.slice(0, 8).toUpperCase()}`,
    month,
    orderNumber,
    deliveryAddress: address,
    quantityMode: "individual",
    packaging: { ...DEFAULT_DELIVERY_PACKAGING },
    rows: Array.from({ length: 5 }, () => ({
      date: "",
      toiletPaper: "",
      handTowels: "",
      soap: "",
      signature: null,
    })),
    supplierSignature: null,
    customerSignature: null,
  };
}
export function assertDeliveryNoteComplete(note: DeliveryNote, hasScan: boolean) {
  deliveryNoteSchema.parse(note);

  if (
    !note.rows.some((r) =>
      [r.toiletPaper, r.handTowels, r.soap].some((v) => Number(v.replace(",", ".")) > 0),
    )
  ) {
    throw new Error("Bitte mindestens eine gelieferte Menge im Lieferschein eintragen.");
  }
  if (!hasScan && (!note.supplierSignature || !note.customerSignature)) {
    throw new Error(
      "Bitte den Lieferschein zum Monatsende beidseitig unterschreiben oder die unterschriebene Papierfassung hochladen.",
    );
  }
}
