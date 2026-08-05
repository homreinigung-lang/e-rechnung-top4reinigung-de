import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";

const LTR = "text-left [direction:ltr] tabular-nums";

function isoToDe(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso || "";
}

function deToIso(de: string) {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(de);
  if (!m) return "";
  const [, d, mo, y] = m;
  const day = Number(d);
  const mon = Number(mo);
  if (mon < 1 || mon > 12 || day < 1 || day > 31) return "";
  return `${y}-${mo}-${d}`;
}

/** Reines Textfeld für Datum im Format TT.MM.JJJJ (immer LTR, latin. Ziffern). */
export function GermanDateInput({
  id,
  value,
  onChange,
}: {
  id?: string;
  value: string;
  onChange: (iso: string) => void;
}) {
  const [text, setText] = useState(() => isoToDe(value));

  useEffect(() => {
    setText(isoToDe(value));
  }, [value]);

  function handle(raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, 8);
    let out = digits;
    if (digits.length > 4) out = `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
    else if (digits.length > 2) out = `${digits.slice(0, 2)}.${digits.slice(2)}`;
    setText(out);
    const iso = deToIso(out);
    if (iso) onChange(iso);
    else if (out === "") onChange("");
  }

  return (
    <Input
      id={id}
      type="text"
      inputMode="numeric"
      dir="ltr"
      lang="de-DE"
      autoComplete="off"
      placeholder="TT.MM.JJJJ"
      maxLength={10}
      className={LTR}
      value={text}
      onChange={(e) => handle(e.target.value)}
      onBlur={() => setText(isoToDe(value))}
    />
  );
}

/** Reines Textfeld für Uhrzeit im 24-Stunden-Format HH:MM (immer LTR). */
export function GermanTimeInput({
  id,
  value,
  onChange,
}: {
  id?: string;
  value: string;
  onChange: (time: string) => void;
}) {
  const [text, setText] = useState(() => value || "");

  useEffect(() => {
    setText(value || "");
  }, [value]);

  function handle(raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, 4);
    const out = digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
    setText(out);
    const m = /^(\d{2}):(\d{2})$/.exec(out);
    if (m && Number(m[1]) < 24 && Number(m[2]) < 60) onChange(out);
    else if (out === "") onChange("");
  }

  return (
    <Input
      id={id}
      type="text"
      inputMode="numeric"
      dir="ltr"
      lang="de-DE"
      autoComplete="off"
      placeholder="HH:MM"
      maxLength={5}
      className={LTR}
      value={text}
      onChange={(e) => handle(e.target.value)}
      onBlur={() => setText(value || "")}
    />
  );
}
