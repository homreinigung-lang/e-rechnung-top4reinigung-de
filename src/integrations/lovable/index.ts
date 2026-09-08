import { supabase } from "../supabase/client";

type SignInOptions = {
  redirect_uri?: string;
  extraParams?: Record<string, string>;
};

type SupportedProvider = "google" | "apple" | "microsoft" | "lovable";

/**
 * Temporary compatibility wrapper while the auth route is migrated away from
 * the old Lovable module name. OAuth itself goes directly through Supabase.
 */
export const lovable = {
  auth: {
    signInWithOAuth: async (provider: SupportedProvider, opts?: SignInOptions) => {
      if (provider === "lovable") {
        return {
          redirected: false,
          error: new Error("Dieser OAuth-Anbieter wird nicht mehr unterstützt."),
        };
      }

      const supabaseProvider = provider === "microsoft" ? "azure" : provider;
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: supabaseProvider,
        options: {
          redirectTo: opts?.redirect_uri ?? window.location.origin,
          ...(opts?.extraParams ? { queryParams: opts.extraParams } : {}),
        },
      });

      return {
        redirected: Boolean(data?.url) && !error,
        error: error ?? null,
      };
    },
  },
};
