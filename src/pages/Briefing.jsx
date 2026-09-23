import { useState } from "react";

const BASE_URL = "https://country-briefing-ten.vercel.app";

const DESKS = [
  {
    key: "politics-risk",
    icon: "🏛️",
    name: "Politics & Risk",
    description: "Political landscape, regulatory environment, and risk assessment for business operations.",
    path: "/politics-risk/briefing/need-to-know",
    status: "complete",
    team: { name: "Team Poesis", members: ["Terese Rainwater", "Allison Eaby", "Zach Van Valkenburg", "Erik Loyd"] },
  },
  {
    key: "hr-culture",
    icon: "👥",
    name: "HR & Cultural Implications",
    description: "Workforce norms, hiring practices, and cultural considerations for international teams.",
    path: "/hr-culture/briefing/introduction",
    status: "in-progress",
  },
  {
    key: "marketing",
    icon: "📣",
    name: "Marketing Practices",
    description: "Consumer behavior, media landscape, and go-to-market strategies in Southeast Asia.",
    path: "/marketing/briefing/introduction",
    status: "in-progress",
  },
  {
    key: "supply-chain",
    icon: "🚢",
    name: "Supply Chain & Infrastructure",
    description: "Logistics networks, trade corridors, and infrastructure readiness for regional operations.",
    path: "/supply-chain/briefing/introduction",
    status: "in-progress",
  },
  {
    key: "finance-economics",
    icon: "💰",
    name: "Finance & Economics",
    description: "Economic indicators, financial regulations, and investment climate overview.",
    path: "/finance-economics/briefing/introduction",
    status: "in-progress",
    team: { name: "Team Money", members: ["Garett Brownlee", "Mel Swayne", "Brian Friedman", "Justin Alexander", "Jeff Daskam"] },
  },
];

function BackBar({ onBack, deskName }) {
  return (
    <div
      className="sticky top-0 z-10 flex items-center gap-3 border-b border-surface-border dark:border-surface-darkBorder bg-surface-light/95 dark:bg-surface-dark/95 backdrop-blur"
      style={{ padding: "10px 16px" }}
    >
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors bg-surface-card dark:bg-surface-darkCard border border-surface-border dark:border-surface-darkBorder text-ink-main dark:text-ink-onDark hover:bg-surface-border dark:hover:bg-surface-darkBorder"
      >
        <span aria-hidden>&#8592;</span>
        Back to Desks
      </button>
      <span
        className="text-xs text-ink-sub dark:text-ink-subOnDark truncate"
        style={{ fontFamily: "Georgia, serif" }}
      >
        {deskName}
      </span>
    </div>
  );
}

function DeskCard({ desk, onSelect }) {
  return (
    <button
      onClick={() => onSelect(desk)}
      className="w-full text-left rounded-xl bg-surface-card dark:bg-surface-darkCard shadow-card border border-surface-border dark:border-surface-darkBorder p-5 transition-all hover:shadow-lg hover:border-du-gold/30 active:scale-[0.98]"
    >
      <div className="flex items-start gap-4">
        <span className="text-2xl leading-none mt-0.5">{desk.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="text-base text-ink-main dark:text-ink-onDark"
              style={{ fontFamily: "Georgia, serif", fontWeight: 700 }}
            >
              {desk.name}
            </span>
            {desk.status === "in-progress" && (
              <span
                className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                style={{
                  background: "rgba(196,150,42,0.15)",
                  color: "#C4962A",
                }}
              >
                Coming Soon
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-ink-sub dark:text-ink-subOnDark leading-relaxed">
            {desk.description}
          </p>
          {desk.team?.members.length > 0 && (
            <p className="mt-2 text-xs text-ink-muted dark:text-ink-subOnDark leading-relaxed">
              <span className="font-semibold text-du-gold">{desk.team.name}</span>
              {" "}&middot;{" "}
              {desk.team.members.join(", ")}
            </p>
          )}
        </div>
        <span className="text-ink-muted dark:text-ink-subOnDark mt-1 text-lg shrink-0" aria-hidden>
          &#8250;
        </span>
      </div>
    </button>
  );
}

export default function Briefing() {
  const [activeDesk, setActiveDesk] = useState(null);

  if (activeDesk) {
    const src = BASE_URL + activeDesk.path;
    return (
      <div className="flex flex-col" style={{ height: "calc(100vh - 64px)", maxHeight: "100dvh" }}>
        <div className="lg:hidden flex flex-col" style={{ height: "calc(100vh - 64px)" }}>
          <BackBar onBack={() => setActiveDesk(null)} deskName={activeDesk.name} />
          <iframe
            src={src}
            title={`${activeDesk.name} — Country Briefing`}
            sandbox="allow-scripts allow-same-origin allow-popups"
            loading="lazy"
            className="flex-1 w-full border-0"
          />
        </div>
        <div className="hidden lg:flex lg:flex-col" style={{ height: "100vh" }}>
          <BackBar onBack={() => setActiveDesk(null)} deskName={activeDesk.name} />
          <iframe
            src={src}
            title={`${activeDesk.name} — Country Briefing`}
            sandbox="allow-scripts allow-same-origin allow-popups"
            loading="lazy"
            className="flex-1 w-full border-0"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="px-5 pt-8 pb-10 lg:pt-10 lg:pb-14 max-w-3xl mx-auto">
      {/* Hero */}
      <div className="mb-8">
        <h1
          className="text-ink-main dark:text-ink-onDark"
          style={{
            fontFamily: "Georgia, serif",
            fontSize: "28px",
            fontWeight: 700,
            letterSpacing: "-0.3px",
            lineHeight: 1.2,
          }}
        >
          Country{" "}
          <span
            style={{
              background: "linear-gradient(135deg, #e8b84b 0%, #f5d47a 45%, #c4862a 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Briefing
          </span>
        </h1>
        <p className="mt-2 text-sm text-ink-sub dark:text-ink-subOnDark leading-relaxed" style={{ fontFamily: "Georgia, serif" }}>
          Business briefings on Singapore &amp; Vietnam, prepared by Cohort 84
        </p>
        <p className="mt-1.5 text-xs text-ink-muted dark:text-ink-subOnDark">
          Built by Erik Loyd and Team Poesis &mdash;{" "}
          <a
            href={BASE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-du-gold transition-colors"
          >
            View Full Site
          </a>
        </p>
      </div>

      {/* Desk cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {DESKS.map((desk) => (
          <DeskCard key={desk.key} desk={desk} onSelect={setActiveDesk} />
        ))}
      </div>
    </div>
  );
}
