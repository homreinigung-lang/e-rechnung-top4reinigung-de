import { useZeiterfassungState } from "@/components/time-tracking/useZeiterfassungState";
import { ZeiterfassungView } from "@/components/time-tracking/ZeiterfassungView";
export function Zeiterfassung() {
  const state = useZeiterfassungState();
  return <ZeiterfassungView state={state} />;
}
