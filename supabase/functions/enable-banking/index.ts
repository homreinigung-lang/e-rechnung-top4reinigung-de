import { createBankHandler } from "./core.ts";
import { createBankStore } from "./store.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

class HttpError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function b64url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function text64(value: string) {
  return b64url(new TextEncoder().encode(value));
}

function concat(...parts: Uint8Array[]) {
  const size = parts.reduce((n, part) => n + part.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function derLength(length: number) {
  if (length < 128) return new Uint8Array([length]);
  const bytes: number[] = [];
  for (let n = length; n > 0; n >>= 8) bytes.unshift(n & 0xff);
  return new Uint8Array([0x80 | bytes.length, ...bytes]);
}

function der(tag: number, content: Uint8Array) {
  return concat(new Uint8Array([tag]), derLength(content.length), content);
}

function pkcs1ToPkcs8(pkcs1: Uint8Array) {
  const version = new Uint8Array([0x02, 0x01, 0x00]);
  const rsaAlgorithmIdentifier = new Uint8Array([
    0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00,
  ]);
  const privateKey = der(0x04, pkcs1);
  return der(0x30, concat(version, rsaAlgorithmIdentifier, privateKey));
}

function decodeBase64(s: string): Uint8Array {
  const clean = s.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = clean + "=".repeat((4 - (clean.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function normalizeSecret(raw: string): string {
  let v = raw.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    const unquoted = v.slice(1, -1);
    try {
      v = JSON.parse(`"${unquoted.replace(/"/g, '\\"')}"`);
    } catch {
      v = unquoted;
    }
  }
  v = v
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\r/g, "");
  return v.trim();
}

function keyCandidates(raw: string): Uint8Array[] {
  const v = normalizeSecret(raw);
  const out: Uint8Array[] = [];

  const pemMatch = v.match(/-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/);
  if (pemMatch) {
    const type = pemMatch[1];
    const bytes = decodeBase64(pemMatch[2]);
    if (type === "PRIVATE KEY") out.push(bytes);
    else if (type === "RSA PRIVATE KEY") out.push(pkcs1ToPkcs8(bytes));
  }

  const compact = v.replace(/\s+/g, "");
  if (/^[A-Za-z0-9+/_=-]+$/.test(compact) && compact.length > 100) {
    try {
      const bytes = decodeBase64(compact);
      out.push(bytes);
      out.push(pkcs1ToPkcs8(bytes));
      const decodedText = new TextDecoder().decode(bytes);
      const nested = decodedText.match(/-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/);
      if (nested) {
        const nestedBytes = decodeBase64(nested[2]);
        if (nested[1] === "PRIVATE KEY") out.push(nestedBytes);
        if (nested[1] === "RSA PRIVATE KEY") out.push(pkcs1ToPkcs8(nestedBytes));
      }
    } catch {
      /* try other candidates */
    }
  }

  return out;
}

async function importPrivateKey(raw: string): Promise<CryptoKey> {
  const candidates = keyCandidates(raw);
  for (const bytes of candidates) {
    try {
      return await crypto.subtle.importKey(
        "pkcs8",
        new Uint8Array(bytes),
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["sign"],
      );
    } catch {
      /* try next */
    }
  }
  throw new Error(
    "Private-Key-Format ungültig. Bitte den originalen privaten Schlüssel aus Enable Banking verwenden.",
  );
}

async function jwt() {
  const appId = Deno.env.get("ENABLE_BANKING_APP_ID") ?? "";
  const pem = Deno.env.get("ENABLE_BANKING_PRIVATE_KEY") ?? "";
  if (!appId || !pem) throw new Error("Enable Banking ist noch nicht vollständig konfiguriert.");

  const now = Math.floor(Date.now() / 1000);
  const header = text64(JSON.stringify({ typ: "JWT", alg: "RS256", kid: appId }));
  const payload = text64(
    JSON.stringify({
      iss: "enablebanking.com",
      aud: "api.enablebanking.com",
      iat: now,
      exp: now + 3600,
    }),
  );
  const input = `${header}.${payload}`;

  const key = await importPrivateKey(pem);
  const sig = new Uint8Array(
    await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(input)),
  );
  return `${input}.${b64url(sig)}`;
}

async function eb(path: string, init: RequestInit = {}) {
  const response = await fetch(`https://api.enablebanking.com${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${await jwt()}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text };
  }
  if (!response.ok) {
    const err = new Error(`Enable Banking API (${response.status})`);
    (err as Error & { status?: number; data?: unknown }).status = response.status;
    (err as Error & { status?: number; data?: unknown }).data = data;
    throw err;
  }
  return data;
}

Deno.serve(async (request) => {
  // A fresh store per request prevents cross-user mutable auth context.
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    return await createBankHandler(
      createBankStore(),
      eb,
      Deno.env.get("ENABLE_BANKING_REDIRECT_URL") ?? "",
    )(request);
  } catch {
    return json({ error: "Bankdienst ist vorübergehend nicht verfügbar." }, 503);
  }
});
