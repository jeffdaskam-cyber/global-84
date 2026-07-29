import {
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  signOut,
} from "firebase/auth";
import { auth, ALLOWED_DOMAIN } from "./firebase";

const REDIRECT_URL =
  import.meta.env.VITE_AUTH_REDIRECT_URL || window.location.origin;
function assertDuEmail(email) {
  const e = (email || "").trim().toLowerCase();
  const domain = e.split("@")[1] || "";
  if (domain !== ALLOWED_DOMAIN) {
    throw new Error(`Please use your @${ALLOWED_DOMAIN} email address.`);
  }
  return e;
}

// Step 1: send magic link
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

// Step 2: complete sign-in when user returns via email link
export async function completeEmailLinkSignIn() {
  const href = window.location.href;

  if (!isSignInWithEmailLink(auth, href)) return { didSignIn: false };

  // Get the email from storage (best UX). If missing, we’ll ask user.
  const storedEmail = window.localStorage.getItem("global84EmailForSignIn") || "";
  const email = storedEmail ? storedEmail : window.prompt("Confirm your DU email to finish sign-in:");

  const e = assertDuEmail(email);

  const result = await signInWithEmailLink(auth, e, href);

  // Clean up
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
  const result = await signInWithEmailLink(auth, e, href);

  window.localStorage.removeItem("global84EmailForSignIn");

  return { didSignIn: true, user: result.user };
}

export function signOutUser() {
  return signOut(auth);
}