import { useEffect, useState, useCallback } from "react";

const CURRENCIES = [
  {
    code: "SGD",
    name: "Singapore Dollar",
    flag: "🇸🇬",
    symbol: "$",
    locale: "en-SG",
    decimals: 2,
    color: "#c4862a",
    hint: "S$1 ≈ US$0.75 — quick tip: divide SGD by 4, multiply by 3",
  },
  {
    code: "VND",
    name: "Vietnamese Dong",
    flag: "🇻🇳",
    symbol: "₫",
    locale: "vi-VN",
    decimals: 0,
    color: "#c0392b",
    hint: "₫25,000 ≈ US$1 — quick tip: drop 4 zeros, divide by 2.5",
  },
];

function formatCurrency(value, currency) {
  if (value === "" || isNaN(value)) return "";
  return new Intl.NumberFormat(currency.locale, {
    minimumFractionDigits: currency.decimals,
    maximumFractionDigits: currency.decimals,
  }).format(value);
}

function ConverterCard({ currency, rate, rateLoading }) {
  const [usdInput, setUsdInput] = useState("");
  const [foreignInput, setForeignInput] = useState("");
  const [lastEdited, setLastEdited] = useState("usd");

  // Recalculate when rate changes
  useEffect(() => {
    if (!rate) return;
    if (lastEdited === "usd" && usdInput !== "") {
      const val = parseFloat(usdInput.replace(/,/g, ""));
      if (!isNaN(val)) setForeignInput(String(+(val * rate).toFixed(currency.decimals)));
    } else if (lastEdited === "foreign" && foreignInput !== "") {
      const val = parseFloat(foreignInput.replace(/,/g, ""));
      if (!isNaN(val)) setUsdInput(String(+(val / rate).toFixed(2)));
    }
  }, [rate]);

  function handleUsdChange(e) {
    const raw = e.target.value.replace(/[^0-9.]/g, "");
    setUsdInput(raw);
    setLastEdited("usd");
    if (rate && raw !== "") {
      const val = parseFloat(raw);
      if (!isNaN(val)) setForeignInput(String(+(val * rate).toFixed(currency.decimals)));
      else setForeignInput("");
    } else {
      setForeignInput("");
    }
  }

  function handleForeignChange(e) {
    const raw = e.target.value.replace(/[^0-9.]/g, "");
    setForeignInput(raw);
    setLastEdited("foreign");
    if (rate && raw !== "") {
      const val = parseFloat(raw);
      if (!isNaN(val)) setUsdInput(String(+(val / rate).toFixed(2)));
      else setUsdInput("");
    } else {
      setUsdInput("");
    }
  }

  function handleClear() {
    setUsdInput("");
    setForeignInput("");
  }

  const displayForeign = foreignInput !== ""
    ? formatCurrency(parseFloat(foreignInput), currency)
    : "";
  const displayUsd = usdInput !== ""
    ? formatCurrency(parseFloat(usdInput), { locale: "en-US", decimals: 2 })
    : "";

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: "linear-gradient(160deg, #1c0408 0%, #2a0a10 100%)",
        border: "1px solid rgba(196,150,42,0.2)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
      }}
    >
      {/* Card header */}
      <div
        className="flex items-center gap-3 px-5 py-4"
        style={{ borderBottom: "1px solid rgba(196,150,42,0.15)" }}
      >
        <span style={{ fontSize: "28px" }}>{currency.flag}</span>
        <div>
          <div style={{ fontFamily: "Georgia, serif", fontSize: "17px", fontWeight: 700, color: "#fff" }}>
            {currency.name}
          </div>
          <div style={{ fontSize: "12px", color: "rgba(196,150,42,0.75)", letterSpacing: "0.08em" }}>
            {currency.code} · US Dollar
          </div>
        </div>
      </div>

      {/* Inputs */}
      <div className="px-5 py-5 space-y-4">
        {/* USD field */}
        <div>
          <label style={{ fontSize: "11px", letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.45)", display: "block", marginBottom: "6px" }}>
            🇺🇸 US Dollar (USD)
          </label>
          <div className="relative">
            <span style={{
              position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)",
              color: "rgba(255,255,255,0.5)", fontSize: "16px", fontWeight: 600, pointerEvents: "none"
            }}>$</span>
            <input
              type="text"
              inputMode="decimal"
              value={usdInput}
              onChange={handleUsdChange}
              placeholder="0.00"
              style={{
                width: "100%", paddingLeft: "32px", paddingRight: "12px",
                paddingTop: "12px", paddingBottom: "12px",
                background: "rgba(255,255,255,0.07)", border: "1px solid rgba(196,150,42,0.25)",
                borderRadius: "10px", color: "#fff", fontSize: "20px", fontWeight: 600,
                outline: "none", boxSizing: "border-box",
              }}
              onFocus={e => e.target.style.borderColor = "rgba(196,150,42,0.6)"}
              onBlur={e => e.target.style.borderColor = "rgba(196,150,42,0.25)"}
            />
          </div>
        </div>

        {/* Swap arrow */}
        <div className="flex items-center justify-center">
          <div style={{
            width: "36px", height: "36px", borderRadius: "50%",
            background: "rgba(196,150,42,0.12)", border: "1px solid rgba(196,150,42,0.25)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "16px", color: "rgba(196,150,42,0.8)"
          }}>
            ⇅
          </div>
        </div>

        {/* Foreign currency field */}
        <div>
          <label style={{ fontSize: "11px", letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.45)", display: "block", marginBottom: "6px" }}>
            {currency.flag} {currency.name} ({currency.code})
          </label>
          <div className="relative">
            <span style={{
              position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)",
              color: "rgba(255,255,255,0.5)", fontSize: "16px", fontWeight: 600, pointerEvents: "none"
            }}>{currency.symbol}</span>
            <input
              type="text"
              inputMode="decimal"
              value={foreignInput}
              onChange={handleForeignChange}
              placeholder={currency.decimals === 0 ? "0" : "0.00"}
              style={{
                width: "100%", paddingLeft: "32px", paddingRight: "12px",
                paddingTop: "12px", paddingBottom: "12px",
                background: "rgba(255,255,255,0.07)", border: "1px solid rgba(196,150,42,0.25)",
                borderRadius: "10px", color: "#fff", fontSize: "20px", fontWeight: 600,
                outline: "none", boxSizing: "border-box",
              }}
              onFocus={e => e.target.style.borderColor = "rgba(196,150,42,0.6)"}
              onBlur={e => e.target.style.borderColor = "rgba(196,150,42,0.25)"}
            />
          </div>
        </div>

        {/* Live rate display */}
        <div style={{
          background: "rgba(196,150,42,0.08)", borderRadius: "8px",
          padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center"
        }}>
          {rateLoading ? (
            <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)" }}>Fetching rate…</span>
          ) : rate ? (
            <>
              <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.55)" }}>
                $1 USD = {formatCurrency(rate, currency)} {currency.code}
              </span>
              <span style={{ fontSize: "11px", color: "rgba(196,150,42,0.6)" }}>Live</span>
            </>
          ) : (
            <span style={{ fontSize: "13px", color: "rgba(255,100,100,0.7)" }}>Rate unavailable</span>
          )}
        </div>

        {/* Quick tip */}
        <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.35)", fontStyle: "italic", margin: 0 }}>
          {currency.hint}
        </p>

        {/* Clear button */}
        {(usdInput || foreignInput) && (
          <button
            onClick={handleClear}
            style={{
              width: "100%", padding: "10px", borderRadius: "10px",
              background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
              color: "rgba(255,255,255,0.5)", fontSize: "13px", cursor: "pointer",
            }}
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

export default function Currency() {
  const [rates, setRates] = useState({ SGD: null, VND: null });
  const [loading, setLoading] = useState(true);
  const [rateDate, setRateDate] = useState(null);
  const [error, setError] = useState(false);

  const fetchRates = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(
        "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json"
      );
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();
      setRates({
        SGD: data.usd?.sgd ?? null,
        VND: data.usd?.vnd ?? null,
      });
      setRateDate(data.date ?? null);
    } catch {
      // Try fallback URL
      try {
        const res2 = await fetch(
          "https://latest.currency-api.pages.dev/v1/currencies/usd.json"
        );
        const data2 = await res2.json();
        setRates({
          SGD: data2.usd?.sgd ?? null,
          VND: data2.usd?.vnd ?? null,
        });
        setRateDate(data2.date ?? null);
      } catch {
        setError(true);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRates();
  }, [fetchRates]);

  return (
    <div className="min-h-screen" style={{ background: "#0d0103" }}>
      {/* Header */}
      <div
        className="px-5 pt-10 pb-6"
        style={{
          background: "linear-gradient(160deg, #1c0408 0%, #2a0a10 100%)",
          borderBottom: "1px solid rgba(196,150,42,0.2)",
        }}
      >
        <div style={{ fontFamily: "Georgia, serif", fontSize: "26px", fontWeight: 700, color: "#fff", letterSpacing: "-0.3px" }}>
          Currency{" "}
          <span style={{
            background: "linear-gradient(135deg, #e8b84b 0%, #f5d47a 45%, #c4862a 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
          }}>
            Converter
          </span>
        </div>
        <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.45)", marginTop: "4px" }}>
          Live rates · USD ↔ SGD &amp; VND
        </p>

        {/* Rate date + refresh */}
        <div className="flex items-center justify-between mt-4">
          <span style={{ fontSize: "12px", color: "rgba(196,150,42,0.6)" }}>
            {rateDate ? `Rates as of ${rateDate}` : loading ? "Loading rates…" : error ? "Could not load rates" : ""}
          </span>
          <button
            onClick={fetchRates}
            disabled={loading}
            style={{
              fontSize: "12px", color: loading ? "rgba(196,150,42,0.35)" : "rgba(196,150,42,0.75)",
              background: "rgba(196,150,42,0.1)", border: "1px solid rgba(196,150,42,0.2)",
              borderRadius: "20px", padding: "4px 12px", cursor: loading ? "default" : "pointer",
            }}
          >
            {loading ? "Refreshing…" : "↻ Refresh"}
          </button>
        </div>
      </div>

      {/* Cards */}
      <div className="px-4 py-6 space-y-5 max-w-lg mx-auto">
        {error && (
          <div style={{
            background: "rgba(180,30,30,0.15)", border: "1px solid rgba(180,30,30,0.3)",
            borderRadius: "12px", padding: "14px 16px",
            color: "rgba(255,180,180,0.85)", fontSize: "13px", textAlign: "center"
          }}>
            Could not fetch live rates. Check your connection and tap Refresh.
          </div>
        )}

        {CURRENCIES.map((currency) => (
          <ConverterCard
            key={currency.code}
            currency={currency}
            rate={rates[currency.code]}
            rateLoading={loading}
          />
        ))}

        {/* Attribution (required by API terms) */}
        <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.2)", textAlign: "center", paddingBottom: "8px" }}>
          Exchange data via{" "}
          <a
            href="https://github.com/fawazahmed0/exchange-api"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "rgba(196,150,42,0.45)", textDecoration: "underline" }}
          >
            fawazahmed0/exchange-api
          </a>
          . Rates are indicative — verify before large transactions.
        </p>
      </div>
    </div>
  );
}
