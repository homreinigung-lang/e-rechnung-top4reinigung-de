import { useCallback, useEffect, useState } from "react";
import { parseTimer, type ArbeitsTimer } from "@/lib/arbeits-timer";

const changed = "gebcalc-arbeitstimer-changed";
const key = (id: string) => `gebcalc-arbeitstimer-v1:${id}`;
function read(id: string) {
  try {
    return parseTimer(localStorage.getItem(key(id)));
  } catch {
    return null;
  }
}

export function useArbeitsTimer(employeeId: string) {
  const [timer, setTimer] = useState(() => read(employeeId));
  useEffect(() => {
    const update = () => setTimer(read(employeeId));
    update();
    window.addEventListener(changed, update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener(changed, update);
      window.removeEventListener("storage", update);
    };
  }, [employeeId]);
  const write = useCallback(
    (value: ArbeitsTimer | null) => {
      try {
        if (value) localStorage.setItem(key(employeeId), JSON.stringify(value));
        else localStorage.removeItem(key(employeeId));
      } catch {
        throw new Error("Timer konnte auf diesem Gerät nicht gespeichert werden.");
      }
      setTimer(value);
      window.dispatchEvent(new Event(changed));
    },
    [employeeId],
  );
  return { timer, write };
}
