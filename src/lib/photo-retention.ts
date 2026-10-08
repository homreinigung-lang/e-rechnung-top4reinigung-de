/**
 * Remove expired work-proof photos before clearing their database references.
 * If either step fails, preserve the references so the next cron run can retry.
 */
type OperationResult = { error: { message: string } | null };

export function assertWorkPhotoPaths(
  paths: string[],
  ownerId: string,
  entryId: string,
  employeeAuthId?: string | null,
): void {
  const prefixes = [ownerId, employeeAuthId]
    .filter(Boolean)
    .map((id) => `${id}/arbeitsnachweis/${entryId}/`);
  for (const path of paths) {
    const prefix = prefixes.find((prefix) => path.startsWith(prefix));
    const filename = prefix ? path.slice(prefix.length) : "";
    if (
      !filename ||
      filename.includes("/") ||
      filename.includes("\\") ||
      filename.includes("%") ||
      Array.from(filename).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) ||
      filename === "." ||
      filename === ".."
    ) {
      throw new Error("Ungültiger Foto-Pfad für diesen Arbeitsnachweis.");
    }
  }
}

export async function removeRetainedPhotos(
  paths: string[],
  scope: { ownerId: string; entryId: string; employeeAuthId?: string | null },
  removeFiles: (paths: string[]) => Promise<OperationResult>,
  clearReferences: () => Promise<OperationResult & { updatedRows: number }>,
): Promise<number> {
  if (paths.length === 0) return 0;
  assertWorkPhotoPaths(paths, scope.ownerId, scope.entryId, scope.employeeAuthId);

  const removed = await removeFiles(paths);
  if (removed.error) throw new Error(`Storage deletion failed: ${removed.error.message}`);

  const cleared = await clearReferences();
  if (cleared.error) throw new Error(`Photo reference update failed: ${cleared.error.message}`);
  if (cleared.updatedRows !== 1) {
    throw new Error("Photo reference update did not affect exactly one entry");
  }

  return paths.length;
}
