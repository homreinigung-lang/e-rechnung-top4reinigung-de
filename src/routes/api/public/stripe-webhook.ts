import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/stripe-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { handleStripeWebhook } = await import("@/lib/stripe-billing.server");
          return await handleStripeWebhook(request);
        } catch {
          // A non-2xx response makes Stripe retry; never acknowledge a failed DB write.
          return new Response("Webhook processing failed", { status: 500 });
        }
      },
    },
  },
});
