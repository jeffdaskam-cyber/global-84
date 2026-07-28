/**
 * Shown when a Firestore listener drops and the view behind it is no longer live.
 *
 * Firestore does not reattach a listener that has errored, so there is nothing
 * the app can retry on the member's behalf — reloading is genuinely the fix, and
 * the button says so instead of implying a background retry that will not happen.
 */
export default function ListenerError({ message, onRetry }) {
  if (!message) return null;

  return (
    <div
      role="alert"
      className="rounded-xl border border-amber-300/60 bg-amber-50 p-4 text-sm dark:border-amber-400/30 dark:bg-amber-950/40"
    >
      <p className="font-semibold text-amber-900 dark:text-amber-200">
        Not up to date
      </p>
      <p className="mt-1 text-amber-800 dark:text-amber-300/90">{message}</p>
      <button
        type="button"
        onClick={onRetry || (() => window.location.reload())}
        className="mt-3 rounded-lg border border-amber-400/70 px-3 py-1.5 font-semibold text-amber-900 dark:border-amber-400/40 dark:text-amber-200"
      >
        Reload
      </button>
    </div>
  );
}
