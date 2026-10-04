import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/enable-banking/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const target = new URL("/bankverbindung", url.origin);

        for (const key of ["code", "state", "error", "error_description"]) {
          const value = url.searchParams.get(key);
          if (value) target.searchParams.set(key, value);
        }

        return Response.redirect(target.toString(), 302);
      },
    },
  },
});
