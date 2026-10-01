type SenderSettings = Record<string, unknown> | null | undefined;

export function buildDocumentSenderLine(settings: SenderSettings) {
  return [
    settings?.["company_name"] ?? "",
    settings?.["address_line"] ?? "",
    `${settings?.["postal_code"] ?? ""} ${settings?.["city"] ?? ""}`.trim(),
  ]
    .filter(Boolean)
    .join(", ");
}
