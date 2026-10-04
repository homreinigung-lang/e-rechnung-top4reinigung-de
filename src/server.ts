import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { requireHttps, withSecurityHeaders } from "./lib/security-headers";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

function handleEnableBankingCallback(request: Request): Response | undefined {
  const url = new URL(request.url);
  if (request.method !== "GET" || url.pathname !== "/api/enable-banking/callback") {
    return undefined;
  }

  const target = new URL("/bankverbindung", url.origin);
  for (const key of ["code", "state", "error", "error_description"]) {
    const value = url.searchParams.get(key);
    if (value) target.searchParams.set(key, value);
  }

  return Response.redirect(target.toString(), 302);
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

    const bankingCallback = handleEnableBankingCallback(request);
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
