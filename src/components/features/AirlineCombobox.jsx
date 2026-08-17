import { useEffect, useRef, useState } from "react";
import { searchAirlines, findAirlineByName } from "../../lib/airlines";

const inputClass =
  "w-full rounded-lg border border-surface-border dark:border-surface-darkBorder bg-white dark:bg-surface-darkCard px-3 py-2 text-sm text-ink-main dark:text-ink-onDark focus:outline-none focus:ring-2 focus:ring-du-gold";
const labelClass =
  "text-xs font-semibold text-ink-sub dark:text-ink-subOnDark mb-1";

/**
 * Airline picker: a text input backed by the name→IATA table.
 *
 * The member types or picks a carrier by name; the parent stores the display
 * name (which the timeline renders verbatim) plus the 2-char IATA code that
 * keys the flight lookup. Free text is still allowed — a carrier that isn't in
 * the table saves as a name with no code, so the leg works manually, it just
 * can't be auto-filled. If a free-typed name happens to match a table entry
 * exactly, its code is recovered on blur.
 *
 * @param {object} props
 * @param {string} props.value - Current airline display name.
 * @param {string} props.iataCode - Current IATA code ("" if none).
 * @param {(airline: {name: string, iata: string}) => void} props.onSelect -
 *   Called when a carrier is chosen from the list.
 * @param {(name: string) => void} props.onFreeText - Called as the member types;
 *   updates the display name and clears the code (until a match resolves).
 * @param {boolean} [props.disabled]
 * @param {string} [props.error]
 */
export default function AirlineCombobox({
  value,
  iataCode,
  onSelect,
  onFreeText,
  disabled,
  error,
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef(null);

  const results = searchAirlines(value, 8);

  // Close the dropdown on an outside click (tap-away on mobile).
  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  function choose(airline) {
    onSelect(airline);
    setOpen(false);
  }

  function onKeyDown(e) {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true);
      return;
    }
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" && results[highlight]) {
      e.preventDefault();
      choose(results[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  // Recover a code when the typed name matches a table entry exactly.
  function onBlur() {
    if (!iataCode && value) {
      const exact = findAirlineByName(value);
      if (exact) onSelect(exact);
    }
  }

  return (
    <label className="block relative" ref={wrapRef}>
      <div className={labelClass}>Airline</div>
      <div className="relative">
        <input
          className={inputClass}
          value={value}
          onChange={(e) => {
            onFreeText(e.target.value);
            setOpen(true);
            setHighlight(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          placeholder="Singapore Airlines"
          disabled={disabled}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
        />
        {iataCode ? (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 rounded bg-du-gold/15 px-1.5 py-0.5 text-[10px] font-bold text-du-gold">
            {iataCode}
          </span>
        ) : null}
      </div>

      {open && results.length > 0 ? (
        <ul className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-surface-border dark:border-surface-darkBorder bg-white dark:bg-surface-darkCard shadow-card">
          {results.map((a, i) => (
            <li key={a.iata}>
              <button
                type="button"
                // onMouseDown (not onClick) so the pick registers before the
                // input's onBlur closes the list.
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(a);
                }}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${
                  i === highlight
                    ? "bg-du-gold/10"
                    : "hover:bg-du-gold/5"
                } text-ink-main dark:text-ink-onDark`}
              >
                <span>{a.name}</span>
                <span className="text-xs font-bold text-ink-sub dark:text-ink-subOnDark">
                  {a.iata}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {error ? <div className="mt-1 text-xs text-du-crimson">{error}</div> : null}
    </label>
  );
}
