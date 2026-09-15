// Browser auth storage for independent deployments.
// Supabase persists the session in localStorage; server-side rendering receives no browser storage.
export function brokeredPreviewStorage() {
  if (typeof window === "undefined") return undefined;
  return window.localStorage;
}
