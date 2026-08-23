import { Mic, MicOff, AudioLines } from "lucide-react";
import { toast } from "sonner";
import { useSpeechToText, type SpeechToTextStatus } from "@/hooks/useSpeechToText";
import { cn } from "@/lib/utils";
import { useEffect } from "react";

interface SpeechToTextButtonProps {
  /** Current value of the bound text input. */
  value: string;
  /** Setter that receives the new text (existing + transcribed). */
  onChange: (text: string) => void;
  /** BCP-47 language tag. Defaults to German. */
  lang?: string;
  /** Button label for screen readers. */
  label?: string;
  className?: string;
}

/**
 * Microphone toggle that transcribes speech into the bound text field using
 * the native Web Speech API. Handles permission denial and unsupported
 * browsers gracefully with a toast.
 */
export function SpeechToTextButton({
  value,
  onChange,
  lang = "de-DE",
  label = "Spracheingabe starten",
  className,
}: SpeechToTextButtonProps) {
  const { supported, status, isListening, toggle } = useSpeechToText({
    lang,
    onTranscript: (text) => {
      // Append transcribed text with a separating space (avoid double spaces).
      const sep = value && !value.endsWith(" ") && !value.endsWith("\n") ? " " : "";
      onChange(`${value}${sep}${text}`);
    },
  });

  // Surface permission/unsupported states exactly once when toggling.
  useEffect(() => {
    if (status === "denied") {
      toast.error("Mikrofonzugriff verweigert", {
        description: "Bitte erlaube den Mikrofonzugriff in den Browser-Einstellungen.",
        duration: 6000,
      });
    } else if (status === "unsupported") {
      toast.error("Spracherkennung nicht verfügbar", {
        description: "Dein Browser unterstützt die Web Speech API nicht.",
        duration: 6000,
      });
    } else if (status === "error") {
      toast.error("Spracherkennung fehlgeschlagen", { duration: 6000 });
    }
  }, [status]);

  if (!supported) {
    return (
      <button
        type="button"
        title="Spracherkennung wird von diesem Browser nicht unterstützt"
        disabled
        className={cn(
          "inline-flex items-center justify-center rounded-md border border-input bg-muted p-2 text-muted-foreground opacity-50",
          className,
        )}
      >
        <MicOff className="size-4" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isListening ? "Spracheingabe stoppen" : label}
      title={isListening ? "Aufnahme läuft…" : label}
      className={cn(
        "inline-flex items-center justify-center rounded-md border p-2 transition-colors",
        isListening
          ? "border-red-500/50 bg-red-500/10 text-red-600 animate-pulse"
          : "border-input bg-background hover:bg-accent hover:text-accent-foreground text-muted-foreground",
        className,
      )}
    >
      {isListening ? (
        <AudioLines className="size-4" />
      ) : (
        <Mic className="size-4" />
      )}
      {isListening && (
        <span className="ml-1.5 text-xs font-medium text-red-600">Aufnahme läuft…</span>
      )}
    </button>
  );
}

export type { SpeechToTextStatus };
