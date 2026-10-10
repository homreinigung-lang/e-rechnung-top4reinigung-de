import { useMaterialverwaltungState } from "@/components/materials/useMaterialverwaltungState";
import { MaterialverwaltungView } from "@/components/materials/MaterialverwaltungView";
export function Materialverwaltung() {
  const state = useMaterialverwaltungState();
  return <MaterialverwaltungView state={state} />;
}
