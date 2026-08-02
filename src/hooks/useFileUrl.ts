import { useQuery } from "@tanstack/react-query";
import { fileUrl } from "@/lib/storage";

/** Liefert eine anzeigbare URL für einen gespeicherten Datei-Pfad. */
export function useFileUrl(pathOrUrl: string | null | undefined) {
  const { data } = useQuery({
    queryKey: ["file-url", pathOrUrl ?? ""],
    queryFn: () => fileUrl(pathOrUrl),
    enabled: Boolean(pathOrUrl),
    staleTime: 1000 * 60 * 60,
  });
  return data ?? "";
}
