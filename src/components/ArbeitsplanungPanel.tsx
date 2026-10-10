import { type CalculationPlanSeed } from "@/components/planning/shared";
import { useArbeitsplanungState } from "@/components/planning/useArbeitsplanungState";
import { ArbeitsplanungView } from "@/components/planning/ArbeitsplanungView";
export function Arbeitsplanung({ initialPlan }: { initialPlan?: CalculationPlanSeed | undefined }) {
  const state = useArbeitsplanungState({ initialPlan: initialPlan });
  return <ArbeitsplanungView state={state} />;
}
