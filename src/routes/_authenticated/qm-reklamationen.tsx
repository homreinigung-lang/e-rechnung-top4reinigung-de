import { createFileRoute } from "@tanstack/react-router";

import { useQmReklamationenState } from "@/components/quality/useQmReklamationenState";
import { QmReklamationenView } from "@/components/quality/QmReklamationenView";
export const Route = createFileRoute("/_authenticated/qm-reklamationen")({
  head: () => ({ meta: [{ title: "QM / Reklamationen" }] }),
  component: QmReklamationen,
});
function QmReklamationen() {
  const state = useQmReklamationenState();
  return <QmReklamationenView state={state} />;
}
