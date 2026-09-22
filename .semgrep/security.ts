// Synthetic scanner fixtures; never imported by the application.
// ruleid: no-dynamic-code-execution
eval(untrusted);
// ruleid: no-dynamic-code-execution
new Function(untrusted);
// ok: no-dynamic-code-execution
JSON.parse(untrusted);
// ruleid: no-disabled-tls-verification
const insecure = { rejectUnauthorized: false };
// ok: no-disabled-tls-verification
const secure = { rejectUnauthorized: true };
// ruleid: no-user-metadata-authorization
const role = user.user_metadata.role;
// ok: no-user-metadata-authorization
const trustedRole = user.app_metadata.role;
// ruleid: no-public-privileged-key
const badSetting = "VITE_SUPABASE_SERVICE_ROLE_KEY";
// ruleid: no-shell-command-execution
import { exec } from "node:child_process";
