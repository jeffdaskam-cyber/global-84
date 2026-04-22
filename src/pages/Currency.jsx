import { useCallback, useEffect, useMemo, useState } from "react";

const CURRENCIES = [
  {
    code: "SGD",
    name: "Singapore Dollar",
    symbol: "$",
    locale: "en-SG",
    decimals: 2,
    hint: "S$1 is roughly US$0.75. A quick estimate is divide by 4 and multiply by 3.",
  },
  {
    code: "VND",
    name: "Vietnamese Dong",
    symbol: "₫",
    locale: "vi-VN",
    decimals: 0,
    hint: "25,000 VND is roughly US$1. Drop four zeros and divide by 2.5 for a fast estimate.",
  },
];

function formatCurrency(value, currency) {
  if (value === "" || Number.isNaN(value)) return "";
  return new Intl.NumberFormat(currency.locale, {
    minimumFractionDigits: currency.decimals,
    maximumFractionDigits: currency.decimals,
  }).format(value);
}

function ConverterCard({ currency, rate, rateLoading }) {
  const [amount, setAmount] = useState("");
  const [lastEdited, setLastEdited] = useState("usd");

  const { usdInput, foreignInput } = useMemo(() => {
    if (!amount) {
      return { usdInput: "", foreignInput: "" };
    }

    const value = parseFloat(amount);
    if (Number.isNaN(value) || !rate) {
      return {
        usdInput: lastEdited === "usd" ? amount : "",
        foreignInput: lastEdited === "foreign" ? amount : "",
      };
    }

    if (lastEdited === "usd") {
      return {
        usdInput: amount,
        foreignInput: String(+(value * rate).toFixed(currency.decimals)),
      };
    }

    return {
      usdInput: String(+(value / rate).toFixed(2)),
      foreignInput: amount,
    };
  }, [amount, currency.decimals, lastEdited, rate]);

  function handleUsdChange(event) {
    setLastEdited("usd");
    setAmount(event.target.value.replace(/[^0-9.]/g, ""));
  }

  function handleForeignChange(event) {
    setLastEdited("foreign");
    setAmount(event.target.value.replace(/[^0-9.]/g, ""));
  }

  function handleClear() {
    setAmount("");
    setLastEdited("usd");
  }

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: "linear-gradient(160deg, #1c0408 0%, #2a0a10 100%)",
        border: "1px solid rgba(196,150,42,0.2)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
      }}
    >
      <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: "1px solid rgba(196,150,42,0.15)" }}>
        <div>
          <div style={{ fontFamily: "Georgia, serif", fontSize: "17px", fontWeight: 700, color: "#fff" }}>
            {currency.name}
          </div>
          <div style={{ fontSize: "12px", color: "rgba(196,150,42,0.75)", letterSpacing: "0.08em" }}>
            {currency.code} and US Dollar
          </div>
        </div>
      </div>

      <div className="px-5 py-5 space-y-4">
        <div>
          <label style={{ fontSize: "11px", letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.45)", display: "block", marginBottom: "6px" }}>
            US Dollar (USD)
          </label>
          <div className="relative">
            <span
              style={{
                position: "absolute",
                left: "14px",
                top: "50%",
                transform: "translateY(-50%)",
                color: "rgba(255,255,255,0.5)",
                fontSize: "16px",
                fontWeight: 600,
                pointerEvents: "none",
              }}
            >
              $
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={usdInput}
              onChange={handleUsdChange}
              placeholder="0.00"
              style={{
                width: "100%",
                paddingLeft: "32px",
                paddingRight: "12px",
                paddingTop: "12px",
                paddingBottom: "12px",
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(196,150,42,0.25)",
                borderRadius: "10px",
                color: "#fff",
                fontSize: "20px",
                fontWeight: 600,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>
        </div>

        <div className="flex items-center justify-center">
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "50%",
              background: "rgba(196,150,42,0.12)",
              border: "1px solid rgba(196,150,42,0.25)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "16px",
              color: "rgba(196,150,42,0.8)",
            }}
          >
            ⇄
          </div>
        </div>

        <div>
          <label style={{ fontSize: "11px", letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.45)", display: "block", marginBottom: "6px" }}>
            {currency.name} ({currency.code})
          </label>
          <div className="relative">
            <span
              style={{
                position: "absolute",
                left: "14px",
                top: "50%",
                transform: "translateY(-50%)",
                color: "rgba(255,255,255,0.5)",
                fontSize: "16px",
                fontWeight: 600,
                pointerEvents: "none",
              }}
            >
              {currency.symbol}
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={foreignInput}
              onChange={handleForeignChange}
              placeholder={currency.decimals === 0 ? "0" : "0.00"}
              style={{
                width: "100%",
                paddingLeft: "32px",
                paddingRight: "12px",
                paddingTop: "12px",
                paddingBottom: "12px",
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(196,150,42,0.25)",
                borderRadius: "10px",
                color: "#fff",
                fontSize: "20px",
                fontWeight: 600,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>
        </div>

        <div
          style={{
            background: "rgba(196,150,42,0.08)",
            borderRadius: "8px",
            padding: "10px 14px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          {rateLoading ? (
            <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)" }}>Fetching rate...</span>
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

        <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.35)", fontStyle: "italic", margin: 0 }}>
          {currency.hint}
        </p>

        {(usdInput || foreignInput) && (
          <button
            onClick={handleClear}
            style={{
              width: "100%",
              padding: "10px",
              borderRadius: "10px",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "rgba(255,255,255,0.5)",
              fontSize: "13px",
              cursor: "pointer",
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
      const response = await fetch("https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json");
      if (!response.ok) throw new Error("fetch failed");
      const data = await response.json();
      setRates({
        SGD: data.usd?.sgd ?? null,
        VND: data.usd?.vnd ?? null,
      });
      setRateDate(data.date ?? null);
    } catch {
      try {
        const response = await fetch("https://latest.currency-api.pages.dev/v1/currencies/usd.json");
        if (!response.ok) throw new Error("fetch failed");
        const data = await response.json();
        setRates({
          SGD: data.usd?.sgd ?? null,
          VND: data.usd?.vnd ?? null,
        });
        setRateDate(data.date ?? null);
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
      <div
        className="px-5 pt-10 pb-6"
        style={{
          background: "linear-gradient(160deg, #1c0408 0%, #2a0a10 100%)",
          borderBottom: "1px solid rgba(196,150,42,0.2)",
        }}
      >
        <div style={{ fontFamily: "Georgia, serif", fontSize: "26px", fontWeight: 700, color: "#fff", letterSpacing: "-0.3px" }}>
          Currency{" "}
          <span
            style={{
              background: "linear-gradient(135deg, #e8b84b 0%, #f5d47a 45%, #c4862a 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Converter
          </span>
        </div>
        <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.45)", marginTop: "4px" }}>
          Live rates for USD to SGD and VND
        </p>

        <div className="flex items-center justify-between mt-4">
          <span style={{ fontSize: "12px", color: "rgba(196,150,42,0.6)" }}>
            {rateDate ? `Rates as of ${rateDate}` : loading ? "Loading rates..." : error ? "Could not load rates" : ""}
          </span>
          <button
            onClick={fetchRates}
            disabled={loading}
            style={{
              fontSize: "12px",
              color: loading ? "rgba(196,150,42,0.35)" : "rgba(196,150,42,0.75)",
              background: "rgba(196,150,42,0.1)",
              border: "1px solid rgba(196,150,42,0.2)",
              borderRadius: "20px",
              padding: "4px 12px",
              cursor: loading ? "default" : "pointer",
            }}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      <div className="px-4 py-6 space-y-5 max-w-lg mx-auto">
        {error && (
          <div
            style={{
              background: "rgba(180,30,30,0.15)",
              border: "1px solid rgba(180,30,30,0.3)",
              borderRadius: "12px",
              padding: "14px 16px",
              color: "rgba(255,180,180,0.85)",
              fontSize: "13px",
              textAlign: "center",
            }}
          >
            Could not fetch live rates. Check your connection and try Refresh.
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
          . Rates are indicative and should be verified before large transactions.
        </p>
      </div>
    </div>
  );
}
