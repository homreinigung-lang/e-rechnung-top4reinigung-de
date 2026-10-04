import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { requireHttps, withSecurityHeaders } from "./lib/security-headers";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

const SUPABASE_URL = "https://squkjqvofugkanzuqtqn.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNxdWtqcXZvZnVna2FuenVxdHFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2MTA4NTIsImV4cCI6MjEwMjE4Njg1Mn0.Oq7zuIAaKqh32zyY6n4n0KYw13UjeKg3QLmogNzrJ58";

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

function callbackErrorRedirect(url: URL, error: string, description?: string) {
  const target = new URL("/bankverbindung", url.origin);
  target.searchParams.set("error", error);
  if (description) target.searchParams.set("error_description", description);
  return Response.redirect(target.toString(), 302);
}

async function handleEnableBankingCallback(request: Request): Promise<Response | undefined> {
  const url = new URL(request.url);
  if (request.method !== "GET" || url.pathname !== "/api/enable-banking/callback") {
    return undefined;
  }

  const bankError = url.searchParams.get("error");
  if (bankError) {
    return callbackErrorRedirect(
      url,
      bankError,
      url.searchParams.get("error_description") ?? "Bankfreigabe wurde abgebrochen.",
    );
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  if (!code) {
    return callbackErrorRedirect(url, "missing_code", "Die Bank hat keinen Autorisierungscode geliefert.");
  }

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/enable-banking`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ action: "exchange_code", code }),
    });

    const data = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok || !data || data.error) {
      const message = typeof data?.error === "string" ? data.error : `HTTP ${response.status}`;
      console.error("Enable Banking callback exchange failed:", message, data);
      return callbackErrorRedirect(url, "session_exchange_failed", message);
    }

    const safeSession = JSON.stringify(data).replace(/</g, "\\u003c");
    const safeState = JSON.stringify(state).replace(/</g, "\\u003c");
    const html = `<!doctype html>
<html lang="de">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bankkonto wird verbunden…</title></head>
<body>
<script>
(function () {
  try {
    var returnedState = ${safeState};
    var expectedState = localStorage.getItem("enable_banking_state");
    if (expectedState && returnedState && expectedState !== returnedState) {
      location.replace("/bankverbindung?error=state_mismatch&error_description=" + encodeURIComponent("Die Bankfreigabe konnte nicht bestätigt werden."));
      return;
    }
    localStorage.setItem("enable_banking_session", JSON.stringify(${safeSession}));
    localStorage.removeItem("enable_banking_state");
    location.replace("/bankverbindung?bank_connected=1");
  } catch (e) {
    location.replace("/bankverbindung?error=callback_storage_failed&error_description=" + encodeURIComponent(String(e)));
  }
})();
</script>
</body>
</html>`;

    return new Response(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    console.error("Enable Banking callback failed:", error);
    return callbackErrorRedirect(
      url,
      "callback_failed",
      error instanceof Error ? error.message : "Bankverbindung fehlgeschlagen.",
    );
  }
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async scheduled(
    _controller: unknown,
    env: Record<string, string | undefined>,
    ctx: { waitUntil(promise: Promise<unknown>): void },
  ) {
    ctx.waitUntil(
      import("./lib/recurring-auto.server")
        .then(({ runAutomaticRecurringInvoices }) => runAutomaticRecurringInvoices(env))
        .then((results) => {
          const sent = results.filter((item) => item.status === "sent").length;
          const failed = results.filter((item) => item.status === "failed").length;
          console.info(`Automatic recurring invoices: ${sent} sent, ${failed} failed.`);
        })
        .catch((error) => {
          console.error("Automatic recurring invoice job failed:", error);
        }),
    );
  },

  async fetch(request: Request, env: unknown, ctx: unknown) {
    const redirect = requireHttps(request);
    if (redirect) return withSecurityHeaders(redirect, request);

    const bankingCallback = await handleEnableBankingCallback(request);
    if (bankingCallback) return withSecurityHeaders(bankingCallback, request);

    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return withSecurityHeaders(await normalizeCatastrophicSsrResponse(response), request);
    } catch (error) {
      console.error(error);
      return withSecurityHeaders(
        new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
        request,
      );
    }
  },
};
