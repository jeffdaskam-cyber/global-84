import { useEffect, useState } from "react";
import { completeEmailLinkSignIn } from "../lib/auth";

export default function FinishSignIn() {
  const [msg, setMsg] = useState("Finishing sign-in…");

  useEffect(() => {
    (async () => {
      try {
        const res = await completeEmailLinkSignIn();
        if (!res.didSignIn) {
          setMsg("This doesn’t look like a valid sign-in link.");
        } else {
          setMsg("Signed in. Redirecting…");
          window.location.replace("/");
        }
      } catch (e) {
        setMsg(e?.message || "Could not complete sign-in.");
      }
    })();
  }, []);

  return (
    <div className="min-h-screen bg-surface-light dark:bg-surface-dark flex items-center justify-center p-6">
      <div className="text-ink-main dark:text-ink-onDark">{msg}</div>
    </div>
  );
}