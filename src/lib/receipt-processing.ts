/** PDFs need no OCR metadata to be stored, so upload can overlap analysis.
 * Images retain sequential conversion to preserve the recognized PDF heading.
 * Analyze should return null for a recoverable recognition failure.
 */
export async function processReceipt<T>(file: File, tasks: {
  analyze: (file: File) => Promise<T>;
  prepare: (file: File, scan: T) => Promise<File>;
  upload: (file: File) => Promise<string>;
}): Promise<string> {
  if (file.type === "application/pdf") {
    const [analysis, upload] = await Promise.allSettled([tasks.analyze(file), tasks.upload(file)]);
    if (upload.status === "rejected") throw upload.reason;
    if (analysis.status === "rejected") throw analysis.reason;
    return upload.value;
  }
  const scan = await tasks.analyze(file);
  return tasks.upload(await tasks.prepare(file, scan));
}

export function includeSavedExpense<T extends { id: string; expense_date: string }>(rows: T[] | undefined, saved: T): T[] {
  return [saved, ...(rows ?? []).filter(row => row.id !== saved.id)]
    .sort((a, b) => b.expense_date.localeCompare(a.expense_date));
}
