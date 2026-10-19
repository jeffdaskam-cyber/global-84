/**
 * Phrasebook.jsx — Vietnamese survival phrasebook for Global 84.
 *
 * Two levels: a grid of situations (Food, Hotel, Emergencies…) with a search
 * box that matches across every phrase, then one situation's phrases at a
 * time. Each situation has its own URL so the phone's back button returns to
 * the grid. Tapping a phrase opens "show to a local" mode: the Vietnamese in
 * large type, for holding the phone up to a driver or vendor.
 *
 * Phrases are static data in src/config/phrasebook.json. Edit there and
 * redeploy to update.
 *
 * Route: /phrases and /phrases/:situationId  (Explore "On the ground", drawer, sidebar)
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import PHRASEBOOK from "../config/phrasebook.json";

const { meta: META, situations: SITUATIONS } = PHRASEBOOK;
const EMERGENCY_ID = "emergency";

// Lowercase and strip Vietnamese diacritics so "cam on" finds "Cảm ơn".
// NFD splits most tone marks off their letters; đ is its own letter, so it
// needs mapping by hand.
function fold(text) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

// Every phrase, tagged with where it lives, precomputed once for search.
const SEARCH_INDEX = SITUATIONS.flatMap((situation) =>
  situation.phrases.map((phrase, index) => ({
    situation,
    phrase,
    index,
    haystack: fold(`${phrase.vi} ${phrase.en} ${phrase.say}`),
  }))
);

// ── Sub-components (light cream/crimson/gold design system) ──────────────────

/** Renders "___" placeholders as a fill-in line instead of raw underscores. */
function WithBlanks({ text }) {
  return text.split(/(___)/).map((part, i) =>
    part === "___" ? (
      <span
        key={i}
        aria-label="blank"
        className="inline-block align-baseline border-b-2 border-current opacity-50 mx-1"
        style={{ width: "2.2em" }}
      />
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

/** One tappable phrase. Tapping opens show-to-a-local mode. */
function PhraseCard({ phrase, situationLabel, onShow }) {
  return (
    <button
      onClick={onShow}
      className="w-full text-left rounded-xl bg-surface-card dark:bg-surface-darkCard border border-surface-border dark:border-surface-darkBorder shadow-card px-4 py-3.5 flex items-start gap-3 transition active:scale-[0.99] hover:border-du-goldDeep focus:outline-none focus:ring-2 focus:ring-du-crimson"
      aria-label={`${phrase.en}. Show to a local.`}
    >
      <span className="min-w-0 flex-1">
        {situationLabel && (
          <span className="block mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-du-gold">
            {situationLabel}
          </span>
        )}
        <span
          className="block text-[17px] font-bold leading-snug text-ink-main dark:text-ink-onDark"
          style={{ fontFamily: "Georgia, serif" }}
          lang="vi"
        >
          <WithBlanks text={phrase.vi} />
        </span>
        <span className="block mt-0.5 text-[13px] italic text-du-crimson dark:text-du-goldBright">
          “<WithBlanks text={phrase.say} />”
        </span>
        <span className="block mt-1 text-sm text-ink-sub dark:text-ink-subOnDark">
          <WithBlanks text={phrase.en} />
        </span>
        {phrase.note && (
          <span className="block mt-1.5 text-xs text-ink-muted">{phrase.note}</span>
        )}
      </span>
      <span className="flex-shrink-0 mt-0.5 text-ink-muted" aria-hidden="true">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4" />
        </svg>
      </span>
    </button>
  );
}

/** Full-screen large-type view of one phrase, for showing to a local. */
function ShowToLocal({ phrase, onClose }) {
  // Escape closes; the page underneath shouldn't scroll while this is up.
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Show to a local"
      className="fixed inset-0 z-[70] flex flex-col bg-surface-card dark:bg-surface-darkCard"
    >
      <div className="flex items-center justify-between px-5 pt-5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-du-gold">
          Show this to a local
        </span>
        <button
          onClick={onClose}
          autoFocus
          className="rounded-full px-4 py-2 text-sm font-semibold bg-du-crimson text-white hover:bg-du-crimsonDark focus:outline-none focus:ring-2 focus:ring-du-crimson focus:ring-offset-2"
        >
          Done
        </button>
      </div>

      <div className="flex-1 flex flex-col justify-center px-6 py-8 overflow-y-auto">
        <p
          className="m-0 font-bold leading-tight text-ink-main dark:text-ink-onDark break-words"
          style={{ fontFamily: "Georgia, serif", fontSize: "clamp(2.25rem, 10vw, 5rem)" }}
          lang="vi"
        >
          <WithBlanks text={phrase.vi} />
        </p>
        <div className="h-1 w-12 rounded-full bg-du-gold mt-6" />
        <p className="mt-5 mb-0 text-lg text-ink-sub dark:text-ink-subOnDark">
          <WithBlanks text={phrase.en} />
        </p>
        <p className="mt-1 mb-0 text-base italic text-du-crimson dark:text-du-goldBright">
          “<WithBlanks text={phrase.say} />”
        </p>
      </div>
    </div>
  );
}

/** Tap-to-call buttons for 113/114/115 and the US consulate. */
function EmergencyNumbers() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2.5">
        {META.emergency.map((line) => (
          <a
            key={line.tel}
            href={`tel:${line.tel}`}
            className="rounded-xl bg-du-crimson text-white text-center py-3 shadow-card hover:bg-du-crimsonDark transition focus:outline-none focus:ring-2 focus:ring-du-crimson focus:ring-offset-2"
          >
            <span className="block text-2xl font-bold" style={{ fontFamily: "Georgia, serif" }}>
              {line.number}
            </span>
            <span className="block text-xs font-semibold">{line.label}</span>
            <span className="block text-[11px] opacity-75" lang="vi">{line.vi}</span>
          </a>
        ))}
      </div>
      <div className="rounded-xl bg-surface-card dark:bg-surface-darkCard border border-surface-border dark:border-surface-darkBorder shadow-card px-4 py-3">
        <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-du-gold">
          {META.consulate.label}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {META.consulate.numbers.map((n) => (
            <a
              key={n.tel}
              href={`tel:${n.tel}`}
              className="rounded-full px-3.5 py-1.5 text-sm font-semibold border border-du-crimson/30 bg-du-crimsonSoft text-du-crimsonDark dark:bg-du-crimson/15 dark:text-ink-onDark"
            >
              📞 {n.display}{n.label ? ` (${n.label})` : ""}
            </a>
          ))}
        </div>
      </div>
      <p className="m-0 text-xs text-ink-muted">Emergency operators speak Vietnamese.</p>
    </div>
  );
}

// ── Level 1: situation grid + search ─────────────────────────────────────────

function SituationGrid({ query, setQuery, onShow }) {
  const folded = fold(query.trim());
  const results = useMemo(
    () => (folded ? SEARCH_INDEX.filter((entry) => entry.haystack.includes(folded)) : []),
    [folded]
  );

  const emergency = SITUATIONS.find((s) => s.id === EMERGENCY_ID);
  const others = SITUATIONS.filter((s) => s.id !== EMERGENCY_ID);

  return (
    <div className="space-y-4">
      <div className="relative">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" aria-hidden="true">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="7" strokeWidth={2} />
            <path strokeLinecap="round" strokeWidth={2} d="M20 20l-3.5-3.5" />
          </svg>
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search phrases, e.g. water, cảm ơn"
          aria-label="Search phrases"
          className="w-full pl-10 pr-3 py-3 rounded-lg bg-surface-card dark:bg-surface-darkCard border border-surface-border dark:border-surface-darkBorder text-[15px] text-ink-main dark:text-ink-onDark outline-none focus:border-du-gold placeholder:text-ink-muted"
        />
      </div>

      {folded ? (
        results.length > 0 ? (
          <div className="space-y-2.5">
            <p className="m-0 text-xs text-ink-muted">
              {results.length} {results.length === 1 ? "phrase" : "phrases"}
            </p>
            {results.map(({ situation, phrase, index }) => (
              <PhraseCard
                key={`${situation.id}-${index}`}
                phrase={phrase}
                situationLabel={`${situation.icon} ${situation.title}`}
                onShow={() => onShow(situation.id, index)}
              />
            ))}
          </div>
        ) : (
          <p className="m-0 py-8 text-center text-sm text-ink-sub dark:text-ink-subOnDark">
            No phrases match “{query.trim()}”.
          </p>
        )
      ) : (
        <>
          {/* Emergencies first and full width, so nobody hunts for it. */}
          {emergency && (
            <Link
              to={`/phrases/${emergency.id}`}
              className="flex items-center gap-3.5 rounded-xl bg-du-crimson text-white px-4 py-4 shadow-card hover:bg-du-crimsonDark transition focus:outline-none focus:ring-2 focus:ring-du-crimson focus:ring-offset-2"
            >
              <span className="text-[28px]" aria-hidden="true">{emergency.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-bold" style={{ fontFamily: "Georgia, serif" }}>
                  {emergency.title}
                </span>
                <span className="block text-xs opacity-85">
                  {META.emergency.map((l) => `${l.label} ${l.number}`).join(" · ")}
                </span>
              </span>
              <svg className="w-5 h-5 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {others.map((situation) => (
              <Link
                key={situation.id}
                to={`/phrases/${situation.id}`}
                className="rounded-xl bg-surface-card dark:bg-surface-darkCard border border-surface-border dark:border-surface-darkBorder shadow-card px-4 py-3.5 transition active:scale-[0.98] hover:border-du-goldDeep focus:outline-none focus:ring-2 focus:ring-du-crimson"
              >
                <span className="block text-[26px] leading-none" aria-hidden="true">{situation.icon}</span>
                <span
                  className="block mt-2 text-sm font-bold leading-snug text-ink-main dark:text-ink-onDark"
                  style={{ fontFamily: "Georgia, serif" }}
                >
                  {situation.title}
                </span>
                <span className="block mt-0.5 text-[11px] text-ink-muted">
                  {situation.phrases.length} phrases
                </span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Level 2: one situation ───────────────────────────────────────────────────

function SituationView({ situation, onShow }) {
  const activeChipRef = useRef(null);

  // Keep the current situation's chip in view when switching via chips.
  useEffect(() => {
    activeChipRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [situation.id]);

  return (
    <div className="space-y-4">
      <Link
        to="/phrases"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-sub dark:text-ink-subOnDark hover:text-ink-main dark:hover:text-ink-onDark"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        All situations
      </Link>

      {/* Jump between situations without going back. `replace` keeps the
          back button pointed at the grid instead of every chip tapped. */}
      <div className="-mx-5 px-5 flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
        {SITUATIONS.map((s) => {
          const active = s.id === situation.id;
          return (
            <Link
              key={s.id}
              ref={active ? activeChipRef : undefined}
              to={`/phrases/${s.id}`}
              replace
              aria-current={active ? "page" : undefined}
              className={`flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold border whitespace-nowrap transition ${
                active
                  ? "bg-du-crimson border-du-crimson text-white"
                  : "bg-surface-card dark:bg-surface-darkCard border-surface-border dark:border-surface-darkBorder text-ink-sub dark:text-ink-subOnDark hover:border-du-goldDeep"
              }`}
            >
              <span aria-hidden="true">{s.icon}</span> {s.title}
            </Link>
          );
        })}
      </div>

      <div>
        <h2
          className="m-0 text-lg font-bold text-ink-main dark:text-ink-onDark"
          style={{ fontFamily: "Georgia, serif" }}
        >
          <span aria-hidden="true">{situation.icon}</span> {situation.title}
        </h2>
        <p className="mt-1 mb-0 text-sm text-ink-sub dark:text-ink-subOnDark">{situation.when}</p>
      </div>

      {situation.id === EMERGENCY_ID && <EmergencyNumbers />}

      <div className="space-y-2.5">
        {situation.phrases.map((phrase, index) => (
          <PhraseCard key={index} phrase={phrase} onShow={() => onShow(situation.id, index)} />
        ))}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function Phrasebook() {
  const { situationId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  // Whether the open show-to-a-local view was pushed from this mount. If so,
  // closing pops that history entry, so the phone's back button and "Done"
  // behave the same; otherwise (e.g. after a reload) it just clears the state.
  const pushedShowRef = useRef(false);

  const situation = situationId ? SITUATIONS.find((s) => s.id === situationId) : null;
  const show = location.state?.show;
  const shownPhrase = show
    ? SITUATIONS.find((s) => s.id === show.situationId)?.phrases[show.index]
    : null;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [situationId]);

  function openShow(sid, index) {
    pushedShowRef.current = true;
    navigate(location.pathname, { state: { show: { situationId: sid, index } } });
  }

  function closeShow() {
    if (pushedShowRef.current) {
      pushedShowRef.current = false;
      navigate(-1);
    } else {
      navigate(location.pathname, { replace: true, state: null });
    }
  }

  if (situationId && !situation) return <Navigate to="/phrases" replace />;

  return (
    <>
      <div className="p-5 space-y-5">

        {/* ── Page header ── */}
        <div>
          <div className="text-xl font-semibold text-ink-main dark:text-ink-onDark" style={{ fontFamily: "Georgia, serif" }}>
            Vietnamese <span className="text-du-crimson">Phrasebook</span>
          </div>
          <div className="h-1 w-10 rounded-full bg-du-gold mt-2" />
          <p className="mt-3 text-sm text-ink-sub dark:text-ink-subOnDark">
            {META.accent} phrases · tap any phrase to show it to a local
          </p>
        </div>

        <div className="max-w-2xl mx-auto">
          {situation ? (
            <SituationView situation={situation} onShow={openShow} />
          ) : (
            <SituationGrid query={query} setQuery={setQuery} onShow={openShow} />
          )}
        </div>
      </div>

      {/* Outside the space-y wrapper, whose sibling margin would push it down. */}
      {shownPhrase && <ShowToLocal phrase={shownPhrase} onClose={closeShow} />}
    </>
  );
}
