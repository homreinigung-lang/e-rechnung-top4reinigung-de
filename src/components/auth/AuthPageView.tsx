import { AuthPageBestätigungscode } from "./AuthPageBestätigungscode";
import type { AuthPageState } from "./useAuthPageState";
export function AuthPageView({ state }: { state: AuthPageState }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <AuthPageBestätigungscode state={state} />
    </div>
  );
}
