/** Read every visible row, including when the API caps a requested page. */
type Page<T> = { data: T[] | null; error: unknown };
type PagedQuery<T> = {
  order(
    column: string,
    options: { ascending: boolean },
  ): {
    range(from: number, to: number): PromiseLike<Page<T>>;
  };
};

export async function fetchAllRows<T extends { id: string }>(
  createQuery: () => PagedQuery<T>,
): Promise<T[]> {
  const rows: T[] = [];
  const seen = new Set<string>();
  // A unique secondary order keeps page boundaries stable for equal dates.
  // Each query must include its table's id and must not have an explicit limit.
  for (;;) {
    const { data, error } = await createQuery()
      .order("id", { ascending: true })
      .range(rows.length, rows.length + 499);
    if (error) throw error;
    if (!data) throw new Error("Die Auswertung konnte nicht vollständig geladen werden.");
    if (data.length === 0) return rows;
    for (const row of data) {
      if (seen.has(row.id)) {
        throw new Error("Die Daten haben sich beim Laden geändert. Bitte erneut laden.");
      }
      seen.add(row.id);
      rows.push(row);
    }
    // Do not stop on a short page: the server's row limit may be below 500.
  }
}
