/**
 * Remove expired work-proof photos before clearing their database references.
 * If either step fails, preserve the references so the next cron run can retry.
 */
type OperationResult = { error: { message: string } | null };

export async function removeRetainedPhotos(
  paths: string[],
  removeFiles: (paths: string[]) => Promise<OperationResult>,
  clearReferences: () => Promise<OperationResult & { updatedRows: number }>,
): Promise<number> {
  if (paths.length === 0) return 0;

  const removed = await removeFiles(paths);
  if (removed.error) throw new Error(`Storage deletion failed: ${removed.error.message}`);

  const cleared = await clearReferences();
  if (cleared.error) throw new Error(`Photo reference update failed: ${cleared.error.message}`);
  if (cleared.updatedRows !== 1) {
    throw new Error("Photo reference update did not affect exactly one entry");
  }

  return paths.length;
}
