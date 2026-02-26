import {
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  signOut,
} from "firebase/auth";
import { auth, ALLOWED_DOMAIN } from "./firebase";

const REDIRECT_URL = import.meta.env.VITE_AUTH_REDIRECT_URL;

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

export function signOutUser() {
  return signOut(auth);
}