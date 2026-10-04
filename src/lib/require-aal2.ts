import { redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

/**
 * Require a verified TOTP factor and an AAL2 session before entering a
 * sensitive client route. The security page itself stays available at AAL1 so
 * users can enroll a factor without locking themselves out.
 */
export async function requireAal2() {
  const { data: auth, error: userError } = await supabase.auth.getUser();
  if (userError || !auth.user) throw redirect({ to: "/auth" });

  const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aalError) throw redirect({ to: "/sicherheit" });
  if (aal?.currentLevel === "aal2") return;

  const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
  if (factorsError) throw redirect({ to: "/sicherheit" });

  const hasVerifiedTotp = (factors?.totp ?? []).some((factor) => factor.status === "verified");
  throw redirect({ to: hasVerifiedTotp ? "/mfa-verifizieren" : "/sicherheit" });
}
