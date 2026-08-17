import { useEffect, useMemo, useState } from "react";
import {
  addFlight,
  updateFlight,
  validateFlight,
  wallClockToInstant,
  instantToWallClock,
  formatFlightDate,
  formatFlightTime,
  FLIGHT_TIME_ZONES,
  DEFAULT_DEPARTURE_ZONE,
  DEFAULT_ARRIVAL_ZONE,
  CABIN_CLASSES,
} from "../../lib/userFlights";
import { findAirlineByName } from "../../lib/airlines";
import { lookupFlight, validateLookupInput } from "../../lib/flightLookup";
import AirlineCombobox from "./AirlineCombobox";

const inputClass =
  "w-full rounded-lg border border-surface-border dark:border-surface-darkBorder bg-white dark:bg-surface-darkCard px-3 py-2 text-sm text-ink-main dark:text-ink-onDark focus:outline-none focus:ring-2 focus:ring-du-gold";
const labelClass =
  "text-xs font-semibold text-ink-sub dark:text-ink-subOnDark mb-1";

/**
 * Split a stored instant into the date+time wall-clock string and keep the zone
 * separate, so the two date/time inputs and the zone dropdown stay independent.
 */
function splitInstant(instant, zone) {
  return instantToWallClock(instant, zone) || "";
}

/** The YYYY-MM-DD date part of a stored instant, in its own zone. */
function dateOfInstant(instant, zone) {
  return splitInstant(instant, zone).slice(0, 10);
}

/** Small "auto" chip shown next to a field the lookup populated. */
function AutoTag({ show }) {
  if (!show) return null;
  return (
    <span className="ml-1 align-middle rounded bg-du-gold/15 px-1 py-0.5 text-[10px] font-bold text-du-gold">
      auto
    </span>
  );
}

export default function FlightEditorModal({ open, onClose, uid, flight }) {
  const isEdit = !!flight?.id;

  const [airline, setAirline] = useState("");
  const [iataCode, setIataCode] = useState("");
  const [flightNumber, setFlightNumber] = useState("");
  const [confirmationNumber, setConfirmationNumber] = useState("");
  const [departureAirport, setDepartureAirport] = useState("");
  const [arrivalAirport, setArrivalAirport] = useState("");
  const [departureWall, setDepartureWall] = useState("");
  const [departureTimeZone, setDepartureTimeZone] = useState(DEFAULT_DEPARTURE_ZONE);
  const [arrivalWall, setArrivalWall] = useState("");
  const [arrivalTimeZone, setArrivalTimeZone] = useState(DEFAULT_ARRIVAL_ZONE);
  const [seatNumber, setSeatNumber] = useState("");
  const [cabinClass, setCabinClass] = useState("");
  const [terminal, setTerminal] = useState("");
  const [gate, setGate] = useState("");
  const [bookingClass, setBookingClass] = useState("");
  const [notes, setNotes] = useState("");

  // Auto-fill state.
  const [source, setSource] = useState("manual");
  const [autoFilled, setAutoFilled] = useState(() => new Set());
  const [flightStatus, setFlightStatus] = useState("");
  const [aircraftType, setAircraftType] = useState("");
  const [lookupDate, setLookupDate] = useState("");
  const [lookupState, setLookupState] = useState("idle"); // idle | loading
  const [lookupError, setLookupError] = useState("");
  const [matches, setMatches] = useState([]);
  const [showChooser, setShowChooser] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Field errors stay hidden until the first save attempt, so a fresh form
  // isn't lit up red before the member has typed anything.
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    if (!open) return;

    if (isEdit) {
      const depZone = flight.departureTimeZone || DEFAULT_DEPARTURE_ZONE;
      const arrZone = flight.arrivalTimeZone || DEFAULT_ARRIVAL_ZONE;
      setAirline(flight.airline || "");
      // Recover the code from the stored field, or from the display name.
      setIataCode(flight.iataCode || findAirlineByName(flight.airline)?.iata || "");
      setFlightNumber(flight.flightNumber || "");
      setConfirmationNumber(flight.confirmationNumber || "");
      setDepartureAirport(flight.departureAirport || "");
      setArrivalAirport(flight.arrivalAirport || "");
      setDepartureTimeZone(depZone);
      setArrivalTimeZone(arrZone);
      setDepartureWall(splitInstant(flight.departureDateTime, depZone));
      setArrivalWall(splitInstant(flight.arrivalDateTime, arrZone));
      setSeatNumber(flight.seatNumber || "");
      setCabinClass(flight.cabinClass || "");
      setTerminal(flight.terminal || "");
      setGate(flight.gate || "");
      setBookingClass(flight.bookingClass || "");
      setNotes(flight.notes || "");
      setSource(flight.source === "api" ? "api" : "manual");
      setAutoFilled(new Set(Array.isArray(flight.autoFilledFields) ? flight.autoFilledFields : []));
      setFlightStatus(flight.flightStatus || "");
      setAircraftType(flight.aircraftType || "");
      // Seed the lookup date from the existing departure so a Refresh just works.
      setLookupDate(dateOfInstant(flight.departureDateTime, depZone));
    } else {
      setAirline("");
      setIataCode("");
      setFlightNumber("");
      setConfirmationNumber("");
      setDepartureAirport("");
      setArrivalAirport("");
      setDepartureWall("");
      setDepartureTimeZone(DEFAULT_DEPARTURE_ZONE);
      setArrivalWall("");
      setArrivalTimeZone(DEFAULT_ARRIVAL_ZONE);
      setSeatNumber("");
      setCabinClass("");
      setTerminal("");
      setGate("");
      setBookingClass("");
      setNotes("");
      setSource("manual");
      setAutoFilled(new Set());
      setFlightStatus("");
      setAircraftType("");
      setLookupDate("");
    }
    setError("");
    setAttempted(false);
    setLookupError("");
    setLookupState("idle");
    setMatches([]);
    setShowChooser(false);
  }, [open, isEdit, flight]);

  // Assemble the payload with absolute instants, the shape validateFlight and
  // add/updateFlight both expect.
  const payload = useMemo(
    () => ({
      airline,
      iataCode,
      flightNumber,
      confirmationNumber,
      departureAirport,
      arrivalAirport,
      departureDateTime: wallClockToInstant(departureWall, departureTimeZone),
      arrivalDateTime: wallClockToInstant(arrivalWall, arrivalTimeZone),
      departureTimeZone,
      arrivalTimeZone,
      seatNumber,
      cabinClass,
      terminal,
      gate,
      bookingClass,
      notes,
      source,
      autoFilledFields: Array.from(autoFilled),
      flightStatus,
      aircraftType,
    }),
    [
      airline,
      iataCode,
      flightNumber,
      confirmationNumber,
      departureAirport,
      arrivalAirport,
      departureWall,
      departureTimeZone,
      arrivalWall,
      arrivalTimeZone,
      seatNumber,
      cabinClass,
      terminal,
      gate,
      bookingClass,
      notes,
      source,
      autoFilled,
      flightStatus,
      aircraftType,
    ]
  );

  const validation = useMemo(() => validateFlight(payload), [payload]);
  // Only surface field errors once the member has tried to save.
  const fieldErrors = attempted ? validation.errors : {};

  if (!open) return null;

  // Drop a field's "auto" badge once the member edits it — the value is now
  // their override, not the API's.
  function forget(key) {
    setAutoFilled((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }

  // Apply a single lookup match to the form. Only fields the API actually
  // returned are set and badged; anything null is left for manual entry.
  function applyMatch(match) {
    const filled = new Set();
    if (match.airlineName) setAirline(match.airlineName);
    if (match.iataCode) setIataCode(match.iataCode);
    if (match.departureAirport) {
      setDepartureAirport(match.departureAirport);
      filled.add("departureAirport");
    }
    if (match.arrivalAirport) {
      setArrivalAirport(match.arrivalAirport);
      filled.add("arrivalAirport");
    }
    if (match.departureTimeZone) {
      setDepartureTimeZone(match.departureTimeZone);
      filled.add("departureTimeZone");
    }
    if (match.arrivalTimeZone) {
      setArrivalTimeZone(match.arrivalTimeZone);
      filled.add("arrivalTimeZone");
    }
    if (match.departureTimeUtc && match.departureTimeZone) {
      setDepartureWall(instantToWallClock(match.departureTimeUtc, match.departureTimeZone));
      filled.add("departureWall");
    }
    if (match.arrivalTimeUtc && match.arrivalTimeZone) {
      setArrivalWall(instantToWallClock(match.arrivalTimeUtc, match.arrivalTimeZone));
      filled.add("arrivalWall");
    }
    if (match.departureTerminal) {
      setTerminal(match.departureTerminal);
      filled.add("terminal");
    }
    if (match.departureGate) {
      setGate(match.departureGate);
      filled.add("gate");
    }
    setFlightStatus(match.status || "");
    setAircraftType(match.aircraftType || "");
    setSource("api");
    setAutoFilled(filled);
    setShowChooser(false);
    setMatches([]);
    setLookupError("");
  }

  async function runLookup(forceRefresh = false) {
    setLookupError("");
    const check = validateLookupInput({ iataCode, flightNumber, date: lookupDate });
    if (!check.valid) {
      setLookupError(
        check.errors.iataCode || check.errors.flightNumber || check.errors.date ||
          "Check the lookup fields."
      );
      return;
    }
    setLookupState("loading");
    try {
      const result = await lookupFlight({ iataCode, flightNumber, date: lookupDate, forceRefresh });
      if (result.matches.length === 0) {
        setLookupError("No flight found for that number and date. Enter the details manually below.");
      } else if (result.matches.length === 1) {
        applyMatch(result.matches[0]);
      } else {
        setMatches(result.matches);
        setShowChooser(true);
      }
    } catch (e) {
      setLookupError(e?.message || "Flight lookup failed.");
    } finally {
      setLookupState("idle");
    }
  }

  async function submit() {
    setError("");
    setAttempted(true);
    if (!validation.valid) {
      setError("Please fix the highlighted fields.");
      return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        await updateFlight(uid, flight.id, payload);
      } else {
        await addFlight(uid, payload);
      }
      onClose();
    } catch (e) {
      setError(
        e?.message || (isEdit ? "Could not update flight." : "Could not add flight.")
      );
    } finally {
      setSaving(false);
    }
  }

  const looking = lookupState === "loading";
  const autoNoticeVisible = source === "api" && autoFilled.size > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 overflow-y-auto">
      <div className="w-full max-w-md my-6 rounded-xl overflow-hidden bg-surface-card dark:bg-surface-darkCard shadow-card border border-surface-border dark:border-surface-darkBorder p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-base font-semibold text-du-crimson">
              {isEdit ? "Edit Flight" : "Add Flight"}
            </div>
            <div className="mt-1 text-xs text-ink-sub dark:text-ink-subOnDark">
              One leg of your itinerary. Times are in each airport's local zone.
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="text-sm font-semibold text-ink-sub dark:text-ink-subOnDark"
          >
            Close
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <AirlineCombobox
              value={airline}
              iataCode={iataCode}
              onSelect={(a) => {
                setAirline(a.name);
                setIataCode(a.iata);
              }}
              onFreeText={(name) => {
                setAirline(name);
                setIataCode("");
              }}
              disabled={saving}
              error={fieldErrors.airline}
            />
            <Field
              label="Flight number"
              value={flightNumber}
              onChange={setFlightNumber}
              placeholder="37"
              disabled={saving}
              error={fieldErrors.flightNumber}
            />
          </div>

          {/* Auto-fill panel */}
          <div className="rounded-lg border border-du-gold/40 bg-du-gold/5 p-3 space-y-2">
            <div className="text-xs font-semibold text-du-crimson">
              Auto-fill from flight number
            </div>
            <div className="text-[11px] text-ink-sub dark:text-ink-subOnDark">
              Pick the airline, enter the flight number and departure date, and we'll fill in
              the airports, times, and gate. You can edit anything afterwards.
            </div>
            <div className="flex items-end gap-2">
              <label className="block flex-1">
                <div className={labelClass}>Departure date</div>
                <input
                  type="date"
                  className={inputClass}
                  value={lookupDate}
                  onChange={(e) => setLookupDate(e.target.value)}
                  disabled={saving || looking}
                />
              </label>
              <button
                type="button"
                onClick={() => runLookup(false)}
                disabled={saving || looking}
                className="rounded-lg bg-du-crimson text-white px-3 py-2 text-sm font-semibold hover:bg-du-crimsonDark transition disabled:opacity-40 whitespace-nowrap"
              >
                {looking ? "Looking…" : "Look up flight"}
              </button>
            </div>

            {isEdit && source === "api" ? (
              <button
                type="button"
                onClick={() => runLookup(true)}
                disabled={saving || looking}
                className="text-xs font-semibold text-du-gold disabled:opacity-40"
              >
                Refresh from flight data
              </button>
            ) : null}

            {lookupError ? (
              <div className="text-xs text-du-crimson">{lookupError}</div>
            ) : null}
            {autoNoticeVisible ? (
              <div className="text-[11px] text-ink-sub dark:text-ink-subOnDark">
                Auto-filled from flight data. Edit any field to override it.
              </div>
            ) : null}

            {/* Multiple-match chooser */}
            {showChooser && matches.length > 0 ? (
              <div className="mt-1 space-y-1">
                <div className="text-[11px] font-semibold text-ink-sub dark:text-ink-subOnDark">
                  More than one flight matched. Pick yours:
                </div>
                {matches.map((m, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => applyMatch(m)}
                    className="block w-full rounded-lg border border-surface-border dark:border-surface-darkBorder bg-white dark:bg-surface-darkCard px-3 py-2 text-left text-sm hover:bg-du-gold/5 text-ink-main dark:text-ink-onDark"
                  >
                    <div className="font-semibold">
                      {m.departureAirport || "?"} → {m.arrivalAirport || "?"}
                    </div>
                    <div className="text-xs text-ink-sub dark:text-ink-subOnDark">
                      {formatFlightDate(m.departureTimeUtc, m.departureTimeZone)}
                      {m.departureTimeUtc
                        ? ` · ${formatFlightTime(m.departureTimeUtc, m.departureTimeZone)}`
                        : ""}
                    </div>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setShowChooser(false);
                    setMatches([]);
                  }}
                  className="text-xs font-semibold text-ink-sub dark:text-ink-subOnDark"
                >
                  Cancel
                </button>
              </div>
            ) : null}
          </div>

          <Field
            label="Confirmation number (optional)"
            value={confirmationNumber}
            onChange={setConfirmationNumber}
            placeholder="ABC123"
            disabled={saving}
          />

          <div className="grid grid-cols-2 gap-2">
            <Field
              label="From (airport)"
              value={departureAirport}
              onChange={(v) => {
                setDepartureAirport(v);
                forget("departureAirport");
              }}
              placeholder="SFO"
              disabled={saving}
              error={fieldErrors.departureAirport}
              auto={autoFilled.has("departureAirport")}
            />
            <Field
              label="To (airport)"
              value={arrivalAirport}
              onChange={(v) => {
                setArrivalAirport(v);
                forget("arrivalAirport");
              }}
              placeholder="SIN"
              disabled={saving}
              error={fieldErrors.arrivalAirport}
              auto={autoFilled.has("arrivalAirport")}
            />
          </div>

          {/* Departure */}
          <div className="rounded-lg border border-surface-border dark:border-surface-darkBorder p-3 space-y-2">
            <div className="text-xs font-semibold text-du-crimson">Departure</div>
            <label className="block overflow-hidden">
              <div className={labelClass}>
                Date &amp; time (local)
                <AutoTag show={autoFilled.has("departureWall")} />
              </div>
              <div className="overflow-hidden rounded-lg">
                <input
                  type="datetime-local"
                  className={`${inputClass} block`}
                  value={departureWall}
                  onChange={(e) => {
                    setDepartureWall(e.target.value);
                    forget("departureWall");
                  }}
                  disabled={saving}
                />
              </div>
              {fieldErrors.departureDateTime ? (
                <div className="mt-1 text-xs text-du-crimson">
                  {fieldErrors.departureDateTime}
                </div>
              ) : null}
            </label>
            <ZoneSelect
              label="Departure time zone"
              value={departureTimeZone}
              onChange={(v) => {
                setDepartureTimeZone(v);
                forget("departureTimeZone");
              }}
              disabled={saving}
              error={fieldErrors.departureTimeZone}
              auto={autoFilled.has("departureTimeZone")}
            />
          </div>

          {/* Arrival */}
          <div className="rounded-lg border border-surface-border dark:border-surface-darkBorder p-3 space-y-2">
            <div className="text-xs font-semibold text-du-crimson">Arrival</div>
            <label className="block overflow-hidden">
              <div className={labelClass}>
                Date &amp; time (local)
                <AutoTag show={autoFilled.has("arrivalWall")} />
              </div>
              <div className="overflow-hidden rounded-lg">
                <input
                  type="datetime-local"
                  className={`${inputClass} block`}
                  value={arrivalWall}
                  onChange={(e) => {
                    setArrivalWall(e.target.value);
                    forget("arrivalWall");
                  }}
                  disabled={saving}
                />
              </div>
              {fieldErrors.arrivalDateTime ? (
                <div className="mt-1 text-xs text-du-crimson">
                  {fieldErrors.arrivalDateTime}
                </div>
              ) : null}
            </label>
            <ZoneSelect
              label="Arrival time zone"
              value={arrivalTimeZone}
              onChange={(v) => {
                setArrivalTimeZone(v);
                forget("arrivalTimeZone");
              }}
              disabled={saving}
              error={fieldErrors.arrivalTimeZone}
              auto={autoFilled.has("arrivalTimeZone")}
            />
          </div>

          {(flightStatus || aircraftType) ? (
            <div className="text-xs text-ink-sub dark:text-ink-subOnDark">
              {flightStatus ? <span>Status: {flightStatus}</span> : null}
              {flightStatus && aircraftType ? <span> · </span> : null}
              {aircraftType ? <span>Aircraft: {aircraftType}</span> : null}
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <Field
              label="Seat (optional)"
              value={seatNumber}
              onChange={setSeatNumber}
              placeholder="34K"
              disabled={saving}
            />
            <label className="block">
              <div className={labelClass}>Cabin class (optional)</div>
              <select
                className={inputClass}
                value={cabinClass}
                onChange={(e) => setCabinClass(e.target.value)}
                disabled={saving}
              >
                <option value="">—</option>
                {CABIN_CLASSES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Field
              label="Terminal"
              value={terminal}
              onChange={(v) => {
                setTerminal(v);
                forget("terminal");
              }}
              placeholder="1"
              disabled={saving}
              auto={autoFilled.has("terminal")}
            />
            <Field
              label="Gate"
              value={gate}
              onChange={(v) => {
                setGate(v);
                forget("gate");
              }}
              placeholder="A12"
              disabled={saving}
              auto={autoFilled.has("gate")}
            />
            <Field
              label="Fare code"
              value={bookingClass}
              onChange={setBookingClass}
              placeholder="Y"
              disabled={saving}
            />
          </div>

          <label className="block">
            <div className={labelClass}>Notes (optional)</div>
            <textarea
              rows={2}
              className={inputClass}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Meal, baggage, seat preference…"
              disabled={saving}
            />
          </label>

          {error ? <div className="text-sm text-du-crimson">{error}</div> : null}

          <button
            onClick={submit}
            disabled={saving}
            className="w-full rounded-lg bg-du-crimson text-white py-3 text-sm font-semibold hover:bg-du-crimsonDark transition disabled:opacity-40"
          >
            {saving ? "Saving…" : isEdit ? "Save changes" : "Add flight"}
          </button>

          <button
            onClick={onClose}
            disabled={saving}
            className="w-full rounded-lg border border-du-gold text-du-gold py-3 text-sm font-semibold hover:bg-du-gold/10 transition disabled:opacity-40"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, disabled, error, auto }) {
  return (
    <label className="block">
      <div className={labelClass}>
        {label}
        <AutoTag show={auto} />
      </div>
      <input
        className={inputClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
      />
      {error ? <div className="mt-1 text-xs text-du-crimson">{error}</div> : null}
    </label>
  );
}

function ZoneSelect({ label, value, onChange, disabled, error, auto }) {
  // Tolerate a zone the API returned that isn't in the curated trip list (e.g.
  // an off-itinerary connection). Show it as its own option so the select still
  // reflects the stored value instead of falling back to the first entry.
  const known = FLIGHT_TIME_ZONES.some((tz) => tz.zone === value);
  const options = known
    ? FLIGHT_TIME_ZONES
    : [{ zone: value, label: value }, ...FLIGHT_TIME_ZONES];

  return (
    <label className="block">
      <div className={labelClass}>
        {label}
        <AutoTag show={auto} />
      </div>
      <select
        className={inputClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        {options.map((tz) => (
          <option key={tz.zone} value={tz.zone}>
            {tz.label}
          </option>
        ))}
      </select>
      {error ? <div className="mt-1 text-xs text-du-crimson">{error}</div> : null}
    </label>
  );
}
