import { useMutation } from "@tanstack/react-query";

import { toast } from "sonner";

import { createStorno } from "@/lib/gobd";

import type { useDocumentDetailForm } from "./useDocumentDetailForm";

export function useDocumentCancellation(input: {
  id: ReturnType<typeof useDocumentDetailForm>["id"];
  navigate: ReturnType<typeof useDocumentDetailForm>["navigate"];
  queryClient: ReturnType<typeof useDocumentDetailForm>["queryClient"];
  setStornoOpen: ReturnType<typeof useDocumentDetailForm>["setStornoOpen"];
  setStornoReason: ReturnType<typeof useDocumentDetailForm>["setStornoReason"];
}) {
  const { id, navigate, queryClient, setStornoOpen, setStornoReason } = input;
  const storno = useMutation({
    mutationFn: (reason: string) => createStorno(id, reason),
    onSuccess: (newId) => {
      setStornoOpen(false);
      setStornoReason("");
      toast.success("Stornorechnung erstellt");
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["document", id] });
      navigate({ to: "/dokumente/$id", params: { id: newId } });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return { storno };
}
