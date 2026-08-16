import { useEffect, useMemo, useState } from "react";
import {
  addFlight,
  updateFlight,
  validateFlight,
  wallClockToInstant,
  instantToWallClock,
  FLIGHT_TIME_ZONES,
  DEFAULT_DEPARTURE_ZONE,
  DEFAULT_ARRIVAL_ZONE,
  CABIN_CLASSES,
} from "../../lib/userFlights";

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

export default function FlightEditorModal({ open, onClose, uid, flight }) {
  const isEdit = !!flight?.id;

  const [airline, setAirline] = useState("");
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

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    if (!open) return;

    if (isEdit) {
      const depZone = flight.departureTimeZone || DEFAULT_DEPARTURE_ZONE;
      const arrZone = flight.arrivalTimeZone || DEFAULT_ARRIVAL_ZONE;
      setAirline(flight.airline || "");
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
    } else {
      setAirline("");
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
    }
    setError("");
    setFieldErrors({});
  }, [open, isEdit, flight]);

  // Assemble the payload with absolute instants, the shape validateFlight and
  // add/updateFlight both expect.
  const payload = useMemo(
    () => ({
      airline,
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
    }),
    [
      airline,
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
    ]
  );

  const canSave = useMemo(() => validateFlight(payload).valid, [payload]);

  if (!open) return null;

  async function submit() {
    setError("");
    const { valid, errors } = validateFlight(payload);
    if (!valid) {
      setFieldErrors(errors);
      setError("Please fix the highlighted fields.");
      return;
    }
    setFieldErrors({});
    setSaving(true);
    try {
      if (isEdit) {
        await updateFlight(uid, flight.id, payload);
      } else {
        await addFlight(uid, payload);
      }
      onClose();
    } catch (e) {
      if (e?.fieldErrors) setFieldErrors(e.fieldErrors);
      setError(
        e?.message || (isEdit ? "Could not update flight." : "Could not add flight.")
      );
    } finally {
      setSaving(false);
    }
  }

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
            <Field
              label="Airline"
              value={airline}
              onChange={setAirline}
              placeholder="Singapore Airlines"
              disabled={saving}
              error={fieldErrors.airline}
            />
            <Field
              label="Flight number"
              value={flightNumber}
              onChange={setFlightNumber}
              placeholder="SQ 37"
              disabled={saving}
              error={fieldErrors.flightNumber}
            />
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
              onChange={setDepartureAirport}
              placeholder="SFO"
              disabled={saving}
              error={fieldErrors.departureAirport}
            />
            <Field
              label="To (airport)"
              value={arrivalAirport}
              onChange={setArrivalAirport}
              placeholder="SIN"
              disabled={saving}
              error={fieldErrors.arrivalAirport}
            />
          </div>

          {/* Departure */}
          <div className="rounded-lg border border-surface-border dark:border-surface-darkBorder p-3 space-y-2">
            <div className="text-xs font-semibold text-du-crimson">Departure</div>
            <label className="block overflow-hidden">
              <div className={labelClass}>Date &amp; time (local)</div>
              <div className="overflow-hidden rounded-lg">
                <input
                  type="datetime-local"
                  className={`${inputClass} block`}
                  value={departureWall}
                  onChange={(e) => setDepartureWall(e.target.value)}
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
              onChange={setDepartureTimeZone}
              disabled={saving}
              error={fieldErrors.departureTimeZone}
            />
          </div>

          {/* Arrival */}
          <div className="rounded-lg border border-surface-border dark:border-surface-darkBorder p-3 space-y-2">
            <div className="text-xs font-semibold text-du-crimson">Arrival</div>
            <label className="block overflow-hidden">
              <div className={labelClass}>Date &amp; time (local)</div>
              <div className="overflow-hidden rounded-lg">
                <input
                  type="datetime-local"
                  className={`${inputClass} block`}
                  value={arrivalWall}
                  onChange={(e) => setArrivalWall(e.target.value)}
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
              onChange={setArrivalTimeZone}
              disabled={saving}
              error={fieldErrors.arrivalTimeZone}
            />
          </div>

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
              onChange={setTerminal}
              placeholder="1"
              disabled={saving}
            />
            <Field
              label="Gate"
              value={gate}
              onChange={setGate}
              placeholder="A12"
              disabled={saving}
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
            disabled={!canSave || saving}
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

function Field({ label, value, onChange, placeholder, disabled, error }) {
  return (
    <label className="block">
      <div className={labelClass}>{label}</div>
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

function ZoneSelect({ label, value, onChange, disabled, error }) {
  return (
    <label className="block">
      <div className={labelClass}>{label}</div>
      <select
        className={inputClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        {FLIGHT_TIME_ZONES.map((tz) => (
          <option key={tz.zone} value={tz.zone}>
            {tz.label}
          </option>
        ))}
      </select>
      {error ? <div className="mt-1 text-xs text-du-crimson">{error}</div> : null}
    </label>
  );
}
