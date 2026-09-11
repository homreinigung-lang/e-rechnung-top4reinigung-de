declare module "cloudflare:workers" {
  export const env: {
    SUPABASE_URL?: string;
    SUPABASE_PUBLISHABLE_KEY?: string;
    SUPABASE_SECRET_KEY?: string;
    GEMINI_API_KEY?: string;
    RESEND_API_KEY?: string;
    RESEND_FROM?: string;
    PUBLIC_SITE_URL?: string;
    [key: string]: string | undefined;
  };
}
