import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CHAT_BUCKET, type ChatAttachment as Attachment } from "@/lib/chat";
import { Button } from "@/components/ui/button";
import { Download, FileText } from "lucide-react";
import { toast } from "sonner";

export function ChatAttachment({ file }: { file: Attachment }) {
  const image = file.mime.startsWith("image/");
  const { data: url } = useQuery({
    queryKey: ["chat_image", file.path],
    enabled: image,
    staleTime: 40 * 60_000,
    gcTime: 45 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(CHAT_BUCKET)
        .createSignedUrl(file.path, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  });
  async function download() {
    const { data, error } = await supabase.storage.from(CHAT_BUCKET).download(file.path);
    if (error) {
      toast.error("Anhang konnte nicht geladen werden.");
      return;
    }
    const objectUrl = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
  }
  return (
    <div className="mt-2 max-w-full rounded-md border bg-background/60 p-2">
      {url ? (
        <img
          src={url}
          alt={file.name}
          className="mb-2 max-h-52 max-w-full rounded object-contain"
        />
      ) : image ? (
        <p className="text-xs text-muted-foreground">Bildvorschau wird geladen …</p>
      ) : (
        <FileText className="size-5" />
      )}
      <Button
        size="sm"
        variant="ghost"
        className="h-auto max-w-full whitespace-normal break-all text-left"
        onClick={() => void download()}
      >
        <Download className="size-4 shrink-0" /> {file.name} ({(file.size / 1024).toFixed(0)} KB)
      </Button>
    </div>
  );
}
