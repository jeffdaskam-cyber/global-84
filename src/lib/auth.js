import {
  EmailAuthProvider,
  isSignInWithEmailLink,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  sendSignInLinkToEmail,
  signInWithEmailAndPassword,
  signInWithEmailLink,
  signOut,
  updatePassword,
} from "firebase/auth";
import { clearIndexedDbPersistence, terminate } from "firebase/firestore";
import { auth, db, ALLOWED_DOMAIN } from "./firebase";

// Keep in sync with the Firebase Auth password policy (Console > Authentication
// > Settings > Password policy) and the reset page, which share this value.
export const MIN_PASSWORD_LENGTH = 8;

function assertDuEmail(email) {
  const e = (email || "").trim().toLowerCase();
  const domain = e.split("@")[1] || "";
  if (domain !== ALLOWED_DOMAIN) {
    throw new Error(`Please use your @${ALLOWED_DOMAIN} email address.`);
  }
  return e;
}

/** An Error carrying a short machine code alongside member-facing copy. */
export class AuthFlowError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/**
 * Member-facing copy for Firebase Auth errors. Unknown codes fall back to a
 * generic message rather than echoing Firebase's text at the member.
 */
export function friendlyAuthError(err) {
  if (err instanceof AuthFlowError) return err.message;
  switch (err?.code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
    case "auth/invalid-login-credentials":
      return "That email and password don't match. For first setup, use the temporary password sent to you individually.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a few minutes, or use Forgot password.";
    case "auth/user-disabled":
      return "This account is turned off. Contact the program team.";
    case "auth/network-request-failed":
      return "No connection. Check Wi-Fi or data and try again.";
    case "auth/weak-password":
    case "auth/password-does-not-meet-requirements":
      return `Choose a password with at least ${MIN_PASSWORD_LENGTH} characters.`;
    case "auth/invalid-email":
      return `Enter your full @${ALLOWED_DOMAIN} email address.`;
    case "auth/requires-recent-login":
      return "For your security, confirm your current password first.";
    default:
      return err?.message && !String(err.message).startsWith("Firebase:")
        ? err.message
        : "Something went wrong. Please try again.";
  }
}

/**
 * Client-side password checks. Firebase enforces the real policy; these give
 * the member an answer before a round trip. Passwords are never trimmed or
 * case-folded.
 */
export function validateNewPassword(newPassword, confirmPassword, previousPassword) {
  if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (newPassword !== confirmPassword) {
    return "The two passwords don't match.";
  }
  if (previousPassword && newPassword === previousPassword) {
    return "Choose a password different from your current one.";
  }
  return "";
}

// ── Password sign-in ───────────────────────────────────────────────────────────

export async function signInWithDuPassword(email, password) {
  const e = assertDuEmail(email);
  if (!password) throw new AuthFlowError("missing-password", "Enter your password.");
  const result = await signInWithEmailAndPassword(auth, e, password);
  return result.user;
}

/**
 * Send Firebase's password reset email. No continue URL: the email links to
 * the branded /reset-password page, which tells the member to go back to the
 * Home Screen icon instead of continuing in whatever browser opened the link.
 *
 * With email enumeration protection on, an unknown address succeeds silently,
 * so the result is neutral either way.
 */
export async function sendDuPasswordReset(email) {
  const e = assertDuEmail(email);
  try {
    await sendPasswordResetEmail(auth, e);
  } catch (err) {
    switch (err?.code) {
      case "auth/user-not-found":
        return true; // neutral: never reveal whether the address has an account
      case "auth/network-request-failed":
      case "auth/too-many-requests":
      case "auth/invalid-email":
        throw err;
      default:
        throw new AuthFlowError(
          "reset-unavailable",
          "Couldn't send the reset email; contact the program team."
        );
    }
  }
  return true;
}

export async function reauthenticateWithPassword(password) {
  const u = auth.currentUser;
  if (!u?.email) throw new AuthFlowError("signed-out", "Sign in again to continue.");
  await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, password));
  await u.getIdToken(true);
}

/**
 * Required first-time setup. Right after a successful sign-in the session is
 * recent enough for updatePassword, so the temporary password is not asked for
 * again. If it has gone stale, `currentPassword` (collected only after Firebase
 * asks for it) reauthenticates first.
 */
export async function setInitialPassword(newPassword, currentPassword) {
  const u = auth.currentUser;
  if (!u) throw new AuthFlowError("signed-out", "Sign in again to continue.");
  if (currentPassword) await reauthenticateWithPassword(currentPassword);
  await updatePassword(u, newPassword);
  // Fresh token so the completion call carries the post-change session.
  await u.getIdToken(true);
}

/** Optional change from the Me page: always confirms the current password. */
export async function changeMyPassword(currentPassword, newPassword) {
  await reauthenticateWithPassword(currentPassword);
  const u = auth.currentUser;
  await updatePassword(u, newPassword);
  await u.getIdToken(true);
}

/**
 * Sign out and drop this device's cached Firestore data, so the next person to
 * sign in on it never sees the previous member's content. Firestore cannot be
 * used again after terminate(), so the page reloads into a clean signed-out app.
 */
export async function signOutUser() {
  try {
    await signOut(auth);
  } finally {
    try {
      await terminate(db);
      await clearIndexedDbPersistence(db);
    } catch {
      // Another tab may still hold the cache; the next load clears state anyway.
    }
    window.location.replace("/");
  }
}

// ── Email-link sign-in (MIGRATION ONLY) ────────────────────────────────────────
// Kept for the announced compatibility window so approved members who are
// signed out still have a way in before their temporary password arrives.
// Remove these helpers, their UI in AuthGate, and VITE_AUTH_REDIRECT_URL at
// final cutover (see docs/password-signin-runbook.md).

const REDIRECT_URL =
  import.meta.env.VITE_AUTH_REDIRECT_URL || window.location.origin;

export async function sendDuSignInLink(email) {
  const e = assertDuEmail(email);

  await sendSignInLinkToEmail(auth, e, {
    url: REDIRECT_URL,
    handleCodeInApp: true,
  });

  // Save email locally so we can complete sign-in after link click
  window.localStorage.setItem("global84EmailForSignIn", e);
  return true;
}

export async function completeEmailLinkSignIn() {
  const href = window.location.href;

  if (!isSignInWithEmailLink(auth, href)) return { didSignIn: false };

  const storedEmail = window.localStorage.getItem("global84EmailForSignIn") || "";
  const email = storedEmail ? storedEmail : window.prompt("Confirm your DU email to finish sign-in:");

  const e = assertDuEmail(email);

  const result = await signInWithEmailLink(auth, e, href);

  window.localStorage.removeItem("global84EmailForSignIn");

  return { didSignIn: true, user: result.user };
}

/**
 * Complete sign-in from a link the member pasted in by hand.
 *
 * This exists because of a quirk with no in-app workaround on iOS. A home
 * screen web app and Safari keep separate storage, and Mail always opens links
 * in Safari — so a member who gets signed out mid-trip requests a link from the
 * installed app, taps it in Mail, signs in successfully in Safari, and finds
 * the installed app still signed out. Repeating the flow repeats the outcome.
 *
 * Pasting works because the link is not bound to the device or browser that
 * requested it: signInWithEmailLink takes the URL as an argument and the
 * backend validates the code against the email. The existing prompt fallback in
 * completeEmailLinkSignIn already relies on this. What is new is the entry
 * point — a text field rather than the address bar the manifest's standalone
 * display mode does not give us.
 *
 * @param {string} link - The full URL copied out of the sign-in email.
 * @param {string} [emailHint] - Address from the form, used when the stored one
 *   is missing (the usual case, since it was stored in the other context).
 */
export async function signInWithPastedLink(link, emailHint) {
  const href = (link || "").trim();

  if (!href) {
    throw new Error("Paste the sign-in link from your email first.");
  }

  if (!isSignInWithEmailLink(auth, href)) {
    throw new Error(
      "That doesn't look like a sign-in link. Copy the whole link from the email, including the https:// part."
    );
  }

  const stored = window.localStorage.getItem("global84EmailForSignIn") || "";
  const candidate = (emailHint || "").trim() || stored;

  if (!candidate) {
    throw new Error("Enter the email address you requested the link with.");
  }

  const e = assertDuEmail(candidate);

  let result;
  try {
    result = await signInWithEmailLink(auth, e, href);
  } catch (err) {
    // The single most likely mistake here, by construction: the member is in
    // this panel *because* they already tapped a link, and tapping it spends
    // the one-time code. Firebase reports that as a bare "invalid action code",
    // which reads like the paste went wrong rather than like the link was
    // already used — so say what actually happened and what to do about it.
    if (
      err?.code === "auth/invalid-action-code" ||
      err?.code === "auth/expired-action-code"
    ) {
      throw new Error(
        'That link has already been used or has expired. Tap "Send sign-in link" above for a new one, then copy it without tapping it.'
      );
    }
    throw err;
  }

  window.localStorage.removeItem("global84EmailForSignIn");

  return { didSignIn: true, user: result.user };
}
