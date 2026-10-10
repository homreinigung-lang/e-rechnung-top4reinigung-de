import { useAuthPageState } from "@/components/auth/useAuthPageState";
import { AuthPageView } from "@/components/auth/AuthPageView";
export function AuthPage({ employeeOnly = false }: { employeeOnly?: boolean }) {
  const state = useAuthPageState({ employeeOnly: employeeOnly });
  return <AuthPageView state={state} />;
}
