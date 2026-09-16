import { supabase } from "@/integrations/supabase/client";
import { fetchStoredBlob } from "@/lib/storage";
import {
  assertFahrtenbuchVehicleData,
  buildAccountantFahrtenbuchPdf,
  type FahrtenbuchBranding,
} from "@/lib/fahrtenbuch-accountant-pdf";

type TripRow = Record<string, string>;

/** Decode a private or public company logo into an embedded JPEG (no remote image URLs in the PDF). */
async function logoAsJpeg(pathOrUrl: string): Promise<string> {
  const blob = await fetchStoredBlob(pathOrUrl);
  if (!blob.type.startsWith("image/")) throw new Error("Das gespeicherte Firmenlogo ist keine Bilddatei.");
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("Firmenlogo konnte nicht gelesen werden.");
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 600 / image.naturalWidth, 300 / image.naturalHeight);
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Firmenlogo konnte nicht verarbeitet werden.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.88);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** Validate the trip's vehicle identification before reading account data or rendering a PDF. */
export async function buildBrandedFahrtenbuchPdf(rows: TripRow[], from: string, to: string): Promise<Blob> {
  assertFahrtenbuchVehicleData(rows);
  const { data, error } = await supabase
    .from("company_settings")
    .select("company_name,logo_url")
    .maybeSingle();
  if (error) throw new Error(`Firmeneinstellungen konnten nicht geladen werden: ${error.message}`);
  const companyName = data?.company_name?.trim();
  const logoUrl = data?.logo_url?.trim();
  if (!companyName || !logoUrl) {
    throw new Error("Bitte Firmenname und Firmenlogo in den Firmeneinstellungen hinterlegen.");
  }
  const branding: FahrtenbuchBranding = { companyName, logoDataUrl: await logoAsJpeg(logoUrl) };
  return buildAccountantFahrtenbuchPdf(rows, from, to, branding);
}
