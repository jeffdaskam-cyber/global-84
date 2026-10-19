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

  const inputClass =
    "w-full pl-8 pr-3 py-3 rounded-lg bg-surface-light dark:bg-surface-dark border border-surface-border dark:border-surface-darkBorder text-ink-main dark:text-ink-onDark text-xl font-semibold outline-none focus:border-du-gold placeholder:text-ink-muted";
  const labelClass =
    "block mb-1.5 text-[11px] uppercase tracking-[0.12em] font-semibold text-ink-sub dark:text-ink-subOnDark";
  const symbolClass =
    "absolute left-3.5 top-1/2 -translate-y-1/2 text-base font-semibold text-ink-muted pointer-events-none";

  return (
    <div className="rounded-xl overflow-hidden bg-surface-card dark:bg-surface-darkCard border border-surface-border dark:border-surface-darkBorder shadow-card">
      <div className="px-5 py-4 border-b border-surface-border dark:border-surface-darkBorder">
        <div className="text-[17px] font-bold text-ink-main dark:text-ink-onDark" style={{ fontFamily: "Georgia, serif" }}>
          {currency.name}
        </div>
        <div className="text-xs tracking-[0.08em] text-du-gold">
          {currency.code} and US Dollar
        </div>
      </div>

      <div className="px-5 py-5 space-y-4">
        <div>
          <label className={labelClass}>US Dollar (USD)</label>
          <div className="relative">
            <span className={symbolClass}>$</span>
            <input
              type="text"
              inputMode="decimal"
              value={usdInput}
              onChange={handleUsdChange}
              placeholder="0.00"
              className={inputClass}
            />
          </div>
        </div>

        <div className="flex items-center justify-center">
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-base bg-du-goldSoft dark:bg-du-gold/10 border border-du-goldDeep/60 text-du-gold">
            ⇄
          </div>
        </div>

        <div>
          <label className={labelClass}>
            {currency.name} ({currency.code})
          </label>
          <div className="relative">
            <span className={symbolClass}>{currency.symbol}</span>
            <input
              type="text"
              inputMode="decimal"
              value={foreignInput}
              onChange={handleForeignChange}
              placeholder={currency.decimals === 0 ? "0" : "0.00"}
              className={inputClass}
            />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg px-3.5 py-2.5 bg-du-goldSoft dark:bg-du-gold/10">
          {rateLoading ? (
            <span className="text-[13px] text-ink-muted">Fetching rate...</span>
          ) : rate ? (
            <>
              <span className="text-[13px] text-ink-sub dark:text-ink-subOnDark">
                $1 USD = {formatCurrency(rate, currency)} {currency.code}
              </span>
              <span className="text-[11px] font-semibold text-du-gold">Live</span>
            </>
          ) : (
            <span className="text-[13px] text-du-crimson">Rate unavailable</span>
          )}
        </div>

        <p className="m-0 text-xs italic text-ink-sub dark:text-ink-subOnDark">
          {currency.hint}
        </p>

        {(usdInput || foreignInput) && (
          <button
            onClick={handleClear}
            className="w-full py-2.5 rounded-lg text-[13px] font-semibold border border-surface-border dark:border-surface-darkBorder text-ink-sub dark:text-ink-subOnDark hover:bg-surface-light dark:hover:bg-surface-dark transition"
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
    <div className="p-5 space-y-5">
      <div>
        <div className="text-xl font-semibold text-ink-main dark:text-ink-onDark" style={{ fontFamily: "Georgia, serif" }}>
          Currency <span className="text-du-crimson">Converter</span>
        </div>
        <div className="h-1 w-10 rounded-full bg-du-gold mt-2" />
        <p className="mt-3 text-sm text-ink-sub dark:text-ink-subOnDark">
          Live rates for USD to SGD and VND
        </p>

        <div className="flex items-center justify-between mt-3">
          <span className="text-xs text-ink-muted">
            {rateDate ? `Rates as of ${rateDate}` : loading ? "Loading rates..." : error ? "Could not load rates" : ""}
          </span>
          <button
            onClick={fetchRates}
            disabled={loading}
            className="text-xs font-semibold rounded-full px-3 py-1 border border-du-goldDeep/70 bg-du-goldSoft dark:bg-du-gold/10 text-du-gold disabled:opacity-50 disabled:cursor-default transition"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      <div className="space-y-5 max-w-lg mx-auto">
        {error && (
          <div className="rounded-xl px-4 py-3.5 text-[13px] text-center bg-du-crimsonSoft border border-du-crimson/30 text-du-crimsonDark dark:bg-du-crimson/15 dark:text-ink-onDark">
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

        <p className="text-[11px] text-center pb-2 text-ink-muted">
          Exchange data via{" "}
          <a
            href="https://github.com/fawazahmed0/exchange-api"
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-du-gold"
          >
            fawazahmed0/exchange-api
          </a>
          . Rates are indicative and should be verified before large transactions.
        </p>
      </div>
    </div>
  );
}
