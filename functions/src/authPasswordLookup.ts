/**
 * Read an account's passwordUpdatedAt from Identity Platform.
 *
 * The Admin SDK's UserRecord does not expose when a password last changed, but
 * the documented projects.accounts.lookup endpoint does. Password setup
 * completion depends on that timestamp moving past the baseline recorded at
 * issuance, so this is the one place the backend calls the REST API directly.
 *
 * Only the fields named in AccountPasswordState are extracted. The raw response
 * includes password hashes and salts and is never logged or returned.
 *
 * Runtime requirement: the function's service account needs
 * firebaseauth.users.get (the default compute service account has it through
 * Editor). See docs/password-signin-runbook.md.
 */

import { applicationDefault } from "firebase-admin/app";

export interface AccountPasswordState {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  disabled: boolean;
  // Milliseconds since the epoch, or null when the account has no password.
  passwordUpdatedAtMs: number | null;
}

export class PasswordLookupError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

function projectId(): string {
  const id = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
  if (!id) throw new PasswordLookupError("missing-project-id");
  return id;
}

// Identity Platform documents this field as milliseconds. A value that reads
// as seconds would make every comparison wrong in the same direction, so treat
// anything implausibly small as unusable rather than guessing a unit.
const EARLIEST_PLAUSIBLE_MS = Date.UTC(2015, 0, 1);

export function parsePasswordUpdatedAt(raw: unknown): number | null {
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === "string" ? Number(raw) : raw;
  if (typeof n !== "number" || !Number.isFinite(n) || n < EARLIEST_PLAUSIBLE_MS) {
    throw new PasswordLookupError("unexpected-timestamp");
  }
  return n;
}

export async function lookupAccountPasswordState(uid: string): Promise<AccountPasswordState> {
  let token: string;
  try {
    token = (await applicationDefault().getAccessToken()).access_token;
  } catch {
    throw new PasswordLookupError("credential-unavailable");
  }

  const project = projectId();
  let res: Response;
  try {
    res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(project)}/accounts:lookup`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          "x-goog-user-project": project,
        },
        body: JSON.stringify({ localId: [uid] }),
      },
    );
  } catch {
    throw new PasswordLookupError("network");
  }

  if (!res.ok) {
    // Status only. The body can echo request details and is not needed.
    throw new PasswordLookupError(`http-${res.status}`);
  }

  const body = (await res.json()) as { users?: Array<Record<string, unknown>> };
  const user = body.users?.find((u) => u.localId === uid);
  if (!user) throw new PasswordLookupError("user-not-found");

  return {
    uid,
    email: typeof user.email === "string" ? user.email.toLowerCase() : null,
    emailVerified: user.emailVerified === true,
    disabled: user.disabled === true,
    passwordUpdatedAtMs: parsePasswordUpdatedAt(user.passwordUpdatedAt),
  };
}
