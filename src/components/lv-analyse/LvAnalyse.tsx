import { useLvAnalyseState } from "@/components/lv-analyse/analysis/useLvAnalyseState";
import { LvAnalyseView } from "@/components/lv-analyse/analysis/LvAnalyseView";
export default function LvAnalyse() {
  const state = useLvAnalyseState();
  return <LvAnalyseView state={state} />;
}
