import { useCallback, useEffect, useRef, useState } from "react";

// Minimal typing for the Web Speech API (vendor-prefixed in Chromium).
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechCtor = new () => SpeechRecognitionLike;

function getSpeechCtor(): SpeechCtor | null {
  if (typeof window === "undefined") return null;
  return (
    (window as unknown as { SpeechRecognition?: SpeechCtor }).SpeechRecognition ??
    (window as unknown as { webkitSpeechRecognition?: SpeechCtor }).webkitSpeechRecognition ??
    null
  );
}

export type SpeechToTextStatus = "idle" | "listening" | "unsupported" | "denied" | "error";

export interface UseSpeechToTextOptions {
  /** Default recognition language (BCP-47 tag). Defaults to German. */
  lang?: string;
  /** Called with each finalized transcript chunk (appended/inserted by caller). */
  onTranscript?: (text: string) => void;
}

export interface UseSpeechToTextResult {
  supported: boolean;
  status: SpeechToTextStatus;
  isListening: boolean;
  /** Toggle listening on/off. Safe to call when unsupported (shows a status). */
  toggle: () => void;
  start: () => void;
  stop: () => void;
}

/**
 * Thin wrapper around the native Web Speech API. Real-time transcription is
 * delivered to `onTranscript`. SSR-safe (no window access at module scope).
 */
export function useSpeechToText({
  lang = "de-DE",
  onTranscript,
}: UseSpeechToTextOptions = {}): UseSpeechToTextResult {
  const [status, setStatus] = useState<SpeechToTextStatus>("idle");
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  const shouldListenRef = useRef(false);

  // Keep the latest callback without restarting the recognition engine.
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  const supported = typeof window !== "undefined" && !!getSpeechCtor();

  useEffect(() => {
    const Ctor = getSpeechCtor();
    if (!Ctor) {
      setStatus("unsupported");
      return;
    }
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (e) => {
      let finalChunk = "";
      for (let i = 0; i < e.results.length; i++) {
        const result = e.results[i];
        if (!result) continue;
        const alt = result[0];
        if (alt) finalChunk += alt.transcript;
      }
      const trimmed = finalChunk.trim();
      if (trimmed) onTranscriptRef.current?.(trimmed);
    };

    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setStatus("denied");
        setIsListening(false);
        shouldListenRef.current = false;
      } else if (e.error === "no-speech" || e.error === "aborted") {
        // benign; let onend decide whether to restart
      } else {
        setStatus("error");
        setIsListening(false);
        shouldListenRef.current = false;
      }
    };

    rec.onend = () => {
      // Chromium stops after a silence; restart if the user still wants to listen.
      if (shouldListenRef.current) {
        try {
          rec.start();
        } catch {
          setIsListening(false);
          shouldListenRef.current = false;
        }
      } else {
        setIsListening(false);
        setStatus("idle");
      }
    };

    recognitionRef.current = rec;
    return () => {
      shouldListenRef.current = false;
      try {
        rec.abort();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    };
  }, [lang]);

  const start = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) {
      setStatus("unsupported");
      return;
    }
    shouldListenRef.current = true;
    setStatus("listening");
    setIsListening(true);
    try {
      rec.start();
    } catch {
      // start() throws if already started — ignore, we are already listening.
    }
  }, []);

  const stop = useCallback(() => {
    shouldListenRef.current = false;
    setIsListening(false);
    setStatus("idle");
    const rec = recognitionRef.current;
    if (rec) {
      try {
        rec.stop();
      } catch {
        // ignore
      }
    }
  }, []);

  const toggle = useCallback(() => {
    if (isListening || shouldListenRef.current) stop();
    else start();
  }, [isListening, start, stop]);

  return { supported, status, isListening, toggle, start, stop };
}
