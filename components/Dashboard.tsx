"use client";

import { useEffect, useMemo, useState } from "react";
import AssetSnapshotPie from "@/components/AssetSnapshotPie";
import {
  defaultPortfolio,
  EntityId,
  ENTITY_IDS,
  EntityPortfolio,
  MetalRow,
  OtherAssetRow,
  Portfolio,
  RealEstateRow
} from "@/lib/types";

const emptyMetalDraft = (): MetalRow => ({
  category: "Gold",
  item: "",
  units: 0,
  ozPerUnit: 1
});

const emptyPropertyDraft = (): RealEstateRow => ({
  address: "",
  propertyUrl: "",
  estimatePaste: "",
  marketValue: 0,
  occupancy: "",
  homeLoanInterestRatePercent: 0,
  rentalIncomeWeek: 0,
  expensesWeek: 0,
  estimatedMonthlyExpenses: 0,
  mortgageLoanAmount: 0,
  mortgageMonthlyRepayment: 0
});

/** Keep Streamlit-era weekly field aligned when monthly expenses are edited. */
function monthlyExpensesToWeekly(monthly: number): number {
  return monthly > 0 ? (monthly * 12) / 52 : 0;
}

function parsePercent(raw: string): number {
  const cleaned = (raw || "").replace(/%/g, "").replace(/,/g, "").trim();
  if (cleaned === "" || cleaned === "." || cleaned === "-") return 0;
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
}

function fmtPercentField(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "";
  const t = n.toFixed(2).replace(/\.?0+$/, "");
  return t;
}

function PercentInput(props: {
  value: number;
  onCommit: (n: number) => void;
  placeholder?: string;
  /** Narrow field for single-line blade layout (e.g. up to 99.99%). */
  compact?: boolean;
}) {
  const { value, onCommit, placeholder, compact } = props;
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setText(value === 0 ? "" : fmtPercentField(value));
    }
  }, [value, focused]);

  return (
    <div className={`input-percent-wrap ${compact ? "input-percent-wrap--compact" : ""}`}>
      <input
        className={`input-currency ${compact ? "input-currency--hl-rate" : ""}`}
        type="text"
        inputMode="decimal"
        placeholder={placeholder || (compact ? "0.00" : "e.g. 5.25")}
        value={text}
        onFocus={() => {
          setFocused(true);
          if (value === 0) {
            setText("");
          } else {
            setText(fmtPercentField(value));
          }
        }}
        onBlur={() => {
          setFocused(false);
          const n = parsePercent(text);
          onCommit(n);
          setText(n === 0 ? "" : fmtPercentField(n));
        }}
        onChange={(ev) => setText(ev.target.value)}
      />
      <span className="input-percent-suffix" aria-hidden>
        %
      </span>
    </div>
  );
}

function listingUrlHref(raw: string): string | null {
  const s = (raw || "").trim();
  if (!s) return null;
  try {
    const u = new URL(s.startsWith("http://") || s.startsWith("https://") ? s : `https://${s}`);
    if (u.protocol === "http:" || u.protocol === "https:") return u.href;
  } catch {
    return null;
  }
  return null;
}

const emptyOtherDraft = (): OtherAssetRow => ({
  assetType: "Managed Funds",
  description: "",
  marketValue: 0
});

type SpotPrices = { gold: number; silver: number };

function metalValueForEntity(ent: EntityPortfolio, prices: SpotPrices): number {
  return ent.precious_metals.reduce((sum, m) => {
    const totalOz = Number(m.units || 0) * Number(m.ozPerUnit || 0);
    const px =
      m.category === "Gold" ? prices.gold : m.category === "Silver" ? prices.silver : 0;
    return sum + totalOz * px;
  }, 0);
}

const entityLabels: Record<EntityId, string> = {
  individual: "Individual",
  smsf: "SMSF",
  family_trust: "Family Trust"
};

const fmtMoney = (n: number) =>
  n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 2 });

/** $12,345.67 — AUD-style comma grouping, explicit $ prefix */
function fmtAudDollars(n: number): string {
  if (!Number.isFinite(n)) return "$0.00";
  const abs = Math.abs(n);
  const core = abs.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (n < 0 ? "-" : "") + "$" + core;
}

function parseAudDollars(raw: string): number {
  const cleaned = (raw || "").replace(/[$,\s]/g, "").trim();
  if (cleaned === "" || cleaned === ".") return 0;
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

/**
 * Currency field: while focused, show plain typing (e.g. 665000 or 665,000) without
 * reformatting every keystroke. On blur, parse, save, and show $ with commas.
 */
function AudCurrencyInput(props: {
  value: number;
  onCommit: (n: number) => void;
  placeholder?: string;
  /** Narrow width for compact single-row layout. */
  compact?: boolean;
}) {
  const { value, onCommit, placeholder, compact } = props;
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setText(value === 0 ? "" : fmtAudDollars(value));
    }
  }, [value, focused]);

  return (
    <input
      className={`input-currency ${compact ? "input-currency--compact" : ""}`}
      type="text"
      inputMode="decimal"
      placeholder={placeholder || "e.g. 665000"}
      value={text}
      onFocus={() => {
        setFocused(true);
        if (value === 0) {
          setText("");
        } else if (Number.isFinite(value) && Math.abs(value % 1) < 1e-9) {
          setText(String(Math.round(value)));
        } else {
          setText(String(value));
        }
      }}
      onBlur={() => {
        setFocused(false);
        const n = parseAudDollars(text);
        onCommit(n);
        setText(n === 0 ? "" : fmtAudDollars(n));
      }}
      onChange={(ev) => setText(ev.target.value)}
    />
  );
}

const apiFetchInit: RequestInit = {
  credentials: "include",
  cache: "no-store",
};

export default function Dashboard({ email }: { email: string }) {
  const [entity, setEntity] = useState<EntityId>("individual");
  const [portfolio, setPortfolio] = useState<Portfolio>(defaultPortfolio());
  const [spot, setSpot] = useState<SpotPrices>({ gold: 7309.61, silver: 130.02 });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  /** Draft-only forms: nothing is saved until user confirms "Add to portfolio". */
  const [addingMetal, setAddingMetal] = useState(false);
  const [draftMetal, setDraftMetal] = useState<MetalRow>(emptyMetalDraft);
  const [addingProperty, setAddingProperty] = useState(false);
  const [draftProperty, setDraftProperty] = useState<RealEstateRow>(emptyPropertyDraft);
  const [addingOther, setAddingOther] = useState(false);
  const [draftOther, setDraftOther] = useState<OtherAssetRow>(emptyOtherDraft);

  /** Load once on mount only. Re-running on navigation (e.g. unstable router deps) refetched stale data and overwrote local edits — breaking Add / save flows. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [pRes, sRes] = await Promise.all([
          fetch("/api/portfolio", apiFetchInit),
          fetch("/api/spot", apiFetchInit),
        ]);
        if (cancelled) return;
        if (pRes.status === 401) {
          window.location.assign("/login");
          return;
        }
        if (pRes.ok) {
          const data = await pRes.json();
          if (!cancelled) setPortfolio(data);
        }
        if (sRes.ok) {
          const spotData = await sRes.json();
          if (!cancelled) setSpot(spotData);
        }
      } catch {
        /* ignore if unmounted */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setAddingMetal(false);
    setDraftMetal(emptyMetalDraft());
    setAddingProperty(false);
    setDraftProperty(emptyPropertyDraft());
    setAddingOther(false);
    setDraftOther(emptyOtherDraft());
  }, [entity]);

  const e = portfolio.entities[entity];

  const metalTotal = useMemo(() => metalValueForEntity(e, spot), [e.precious_metals, spot]);
  const realEstateNet = useMemo(
    () =>
      e.real_estate.reduce(
        (sum, r) => sum + Math.max(0, Number(r.marketValue || 0) - Number(r.mortgageLoanAmount || 0)),
        0
      ),
    [e.real_estate]
  );
  const otherTotal = useMemo(
    () => e.other_assets.reduce((sum, a) => sum + Number(a.marketValue || 0), 0),
    [e.other_assets]
  );
  const entityTotal = metalTotal + realEstateNet + otherTotal;

  const draftEstAnnualReturn =
    Number(draftProperty.rentalIncomeWeek || 0) * 52 -
    Number(draftProperty.estimatedMonthlyExpenses ?? 0) * 12;

  /** All entities — snapshot + net portfolio */
  const portfolioTotals = useMemo(() => {
    let metalsAll = 0;
    let otherAll = 0;
    let reGross = 0;
    let mortgagesAll = 0;
    let reNetAll = 0;

    for (const id of ENTITY_IDS) {
      const ent = portfolio.entities[id];
      metalsAll += metalValueForEntity(ent, spot);
      otherAll += ent.other_assets.reduce((s, a) => s + Number(a.marketValue || 0), 0);
      for (const r of ent.real_estate) {
        const mv = Number(r.marketValue || 0);
        const loan = Number(r.mortgageLoanAmount || 0);
        reGross += mv;
        mortgagesAll += loan;
        reNetAll += Math.max(0, mv - loan);
      }
    }

    const netPortfolio = metalsAll + otherAll + reNetAll;

    return {
      metalsAll,
      otherAll,
      reGross,
      mortgagesAll,
      reNetAll,
      netPortfolio
    };
  }, [portfolio, spot]);

  async function saveNow(next: Portfolio) {
    setPortfolio(next);
    setSaving(true);
    setMsg("");
    const res = await fetch("/api/portfolio", {
      ...apiFetchInit,
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(next),
    });
    setSaving(false);
    setMsg(res.ok ? "Saved" : "Save failed");
  }

  function removeMetalRow(index: number) {
    const next = structuredClone(portfolio);
    next.entities[entity].precious_metals.splice(index, 1);
    saveNow(next);
  }

  function removePropertyRow(index: number) {
    const next = structuredClone(portfolio);
    next.entities[entity].real_estate.splice(index, 1);
    saveNow(next);
  }

  function removeOtherRow(index: number) {
    const next = structuredClone(portfolio);
    next.entities[entity].other_assets.splice(index, 1);
    saveNow(next);
  }

  return (
    <div className="container">
      <div className="card app-header-card">
        <header className="app-header">
          <div className="app-header-brand">
            <h2>My Investment Portfolio</h2>
            <p className="muted app-header-email">{email}</p>
          </div>
          <div className="app-header-controls">
            <div className="app-header-entity-total-wrap">
              <div className="app-header-entity">
                <span className="app-header-label">Entity</span>
                <select
                  className="app-header-select"
                  value={entity}
                  onChange={(ev) => setEntity(ev.target.value as EntityId)}
                  aria-label="Select entity"
                >
                  {ENTITY_IDS.map((id) => (
                    <option value={id} key={id}>{entityLabels[id]}</option>
                  ))}
                </select>
              </div>
              <div className="entity-total-badge" title="Total for the selected entity only">
                <span className="entity-total-badge-label">Entity total</span>
                <span className="entity-total-badge-amount">{fmtMoney(entityTotal)}</span>
              </div>
            </div>
            <form action="/api/auth/logout" method="post" className="app-header-signout-form">
              <button className="secondary btn-signout" type="submit">Sign out</button>
            </form>
          </div>
        </header>
        <footer className="app-header-footer">
          <span className={`save-pill ${msg === "Saved" ? "save-pill-ok" : ""}`}>
            {saving ? "Saving…" : msg || " "}
          </span>
        </footer>
      </div>

      <div className="card snapshot-section">
        <h3>Asset snapshot (all entities)</h3>
        <div className="snapshot-layout">
          <div className="snapshot-chart-wrap">
            <AssetSnapshotPie
              metals={portfolioTotals.metalsAll}
              other={portfolioTotals.otherAll}
              reNet={portfolioTotals.reNetAll}
            />
          </div>
          <div className="snapshot-lines">
            <div className="snapshot-line">
              <span>Precious metals (value)</span>
              <strong>{fmtAudDollars(portfolioTotals.metalsAll)}</strong>
            </div>
            <div className="snapshot-line">
              <span>Other assets (value)</span>
              <strong>{fmtAudDollars(portfolioTotals.otherAll)}</strong>
            </div>
            <div className="snapshot-line">
              <span>Real estate (market value)</span>
              <strong>{fmtAudDollars(portfolioTotals.reGross)}</strong>
            </div>
            <div className="snapshot-line snapshot-mortgages">
              <span>Total mortgages</span>
              <strong className="snapshot-mortgage-value">
                -{fmtAudDollars(portfolioTotals.mortgagesAll)}
              </strong>
            </div>
            <div className="snapshot-line snapshot-net">
              <span>Net portfolio value</span>
              <strong>{fmtAudDollars(portfolioTotals.netPortfolio)}</strong>
            </div>
          </div>
        </div>
        <p className="muted snapshot-footnote">
          Net portfolio value = precious metals + other assets + real estate equity (market value − mortgages) across Individual, SMSF, and Family Trust.
        </p>
      </div>

      <div className="card">
        <h3>Real Estate</h3>
        <div className="field-table">
          <div className="field-head row-re4">
            <span>Address</span>
            <span>Market value</span>
            <span>Mortgage loan</span>
            <span className="head-remove">Remove</span>
          </div>
          {e.real_estate.map((r, i) => {
            const mv = Number(r.marketValue || 0);
            const loan = Number(r.mortgageLoanAmount || 0);
            const netEq = Math.max(0, mv - loan);
            const listingHref = listingUrlHref(r.propertyUrl ?? "");
            const isInvestment = r.occupancy === "Investment";
            const estMo = Number(r.estimatedMonthlyExpenses ?? 0);
            const weeklyRent = Number(r.rentalIncomeWeek || 0);
            const estAnnualReturn = weeklyRent * 52 - estMo * 12;
            const ratePct = Number(r.homeLoanInterestRatePercent ?? 0);
            return (
              <div
                key={`r-${i}`}
                className={`re-property-band ${i % 2 === 0 ? "re-property-band--stripe" : ""}`}
              >
                <div className="field-row row-re4">
                  <input
                    value={r.address}
                    placeholder="Address"
                    onChange={(ev) => {
                      const next = structuredClone(portfolio);
                      next.entities[entity].real_estate[i].address = ev.target.value;
                      saveNow(next);
                    }}
                  />
                  <AudCurrencyInput
                    value={mv}
                    placeholder="$0.00"
                    onCommit={(n) => {
                      const next = structuredClone(portfolio);
                      next.entities[entity].real_estate[i].marketValue = n;
                      saveNow(next);
                    }}
                  />
                  <AudCurrencyInput
                    value={loan}
                    placeholder="$0.00"
                    onCommit={(n) => {
                      const next = structuredClone(portfolio);
                      next.entities[entity].real_estate[i].mortgageLoanAmount = n;
                      saveNow(next);
                    }}
                  />
                  <div className="cell-remove">
                    <button type="button" className="btn-remove" onClick={() => removePropertyRow(i)}>
                      Remove
                    </button>
                  </div>
                </div>
                <div className="muted re-net-row">
                  <strong>Net equity:</strong> {fmtAudDollars(netEq)}
                </div>
                <details className="re-blade">
                  <summary className="re-blade-summary">Listing and loan details</summary>
                  <div className="re-blade-body">
                    <div
                      className={`field-row re-blade-row re-blade-row--one-line ${isInvestment ? "re-blade-row--one-line-invest" : ""}`}
                    >
                      <div className="re-blade-stack re-blade-stack--occ">
                        <label className="re-ref-label re-ref-label--compact" htmlFor={`re-occ-${entity}-${i}`}>
                          Occupancy
                        </label>
                        <select
                          id={`re-occ-${entity}-${i}`}
                          className="re-blade-select-occ"
                          value={r.occupancy}
                          onChange={(ev) => {
                            const next = structuredClone(portfolio);
                            const v = ev.target.value as RealEstateRow["occupancy"];
                            next.entities[entity].real_estate[i].occupancy = v;
                            saveNow(next);
                          }}
                        >
                          <option value="">—</option>
                          <option value="Owner occupied">Owner Occupied</option>
                          <option value="Investment">Investment</option>
                        </select>
                      </div>
                      <div className="re-blade-stack re-blade-stack--hl">
                        <label className="re-ref-label re-ref-label--compact" htmlFor={`re-rate-${entity}-${i}`}>
                          HL Int. Rate
                        </label>
                        <PercentInput
                          compact
                          value={ratePct}
                          onCommit={(n) => {
                            const next = structuredClone(portfolio);
                            next.entities[entity].real_estate[i].homeLoanInterestRatePercent = n;
                            saveNow(next);
                          }}
                        />
                      </div>
                      <div className="re-blade-stack re-blade-stack--money">
                        <label
                          className="re-ref-label re-ref-label--compact re-ref-label--label-width"
                          htmlFor={`re-repay-${entity}-${i}`}
                        >
                          Monthly repayment
                        </label>
                        <AudCurrencyInput
                          compact
                          value={Number(r.mortgageMonthlyRepayment || 0)}
                          placeholder="$0.00"
                          onCommit={(n) => {
                            const next = structuredClone(portfolio);
                            next.entities[entity].real_estate[i].mortgageMonthlyRepayment = n;
                            saveNow(next);
                          }}
                        />
                      </div>
                      {isInvestment ? (
                        <>
                          <div className="re-blade-stack re-blade-stack--money re-blade-stack--rent re-blade-stack--invest-equal">
                            <label
                              className="re-ref-label re-ref-label--compact re-ref-label--label-width"
                              htmlFor={`re-rent-${entity}-${i}`}
                            >
                              Weekly rental
                            </label>
                            <AudCurrencyInput
                              compact
                              value={weeklyRent}
                              placeholder="$0.00"
                              onCommit={(n) => {
                                const next = structuredClone(portfolio);
                                next.entities[entity].real_estate[i].rentalIncomeWeek = n;
                                saveNow(next);
                              }}
                            />
                          </div>
                          <div className="re-blade-stack re-blade-stack--money re-blade-stack--exp re-blade-stack--invest-equal">
                            <label
                              className="re-ref-label re-ref-label--compact re-ref-label--label-width"
                              htmlFor={`re-expmo-${entity}-${i}`}
                            >
                              Monthly expenses
                            </label>
                            <AudCurrencyInput
                              compact
                              value={estMo}
                              placeholder="$0.00"
                              onCommit={(n) => {
                                const next = structuredClone(portfolio);
                                const row = next.entities[entity].real_estate[i];
                                row.estimatedMonthlyExpenses = n;
                                row.expensesWeek = monthlyExpensesToWeekly(n);
                                saveNow(next);
                              }}
                            />
                          </div>
                          <div className="re-blade-stack re-blade-stack--annual re-blade-stack--invest-equal">
                            <span className="re-ref-label re-ref-label--compact">Est. annual return</span>
                            <div
                              className={`re-computed-return re-computed-return--compact ${estAnnualReturn < 0 ? "re-computed-return--negative" : ""}`}
                              title="Weekly rental × 52 − monthly expenses × 12"
                            >
                              {fmtAudDollars(estAnnualReturn)}
                            </div>
                          </div>
                        </>
                      ) : null}
                      <div className="re-blade-remove-slot" aria-hidden="true" />
                    </div>
                    <div className="field-row re-blade-row re-blade-row--listing">
                      <div className="re-blade-stack re-blade-stack--url-span">
                        <label className="re-ref-label" htmlFor={`re-url-${entity}-${i}`}>
                          Listing URL
                        </label>
                        <div className="re-url-row">
                          <input
                            id={`re-url-${entity}-${i}`}
                            type="text"
                            inputMode="url"
                            autoComplete="url"
                            value={r.propertyUrl ?? ""}
                            placeholder="https://…"
                            onChange={(ev) => {
                              const next = structuredClone(portfolio);
                              next.entities[entity].real_estate[i].propertyUrl = ev.target.value;
                              saveNow(next);
                            }}
                          />
                          {listingHref ? (
                            <a
                              href={listingHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="re-open-link"
                            >
                              Open listing
                            </a>
                          ) : null}
                        </div>
                      </div>
                      <div className="re-blade-stack">
                        <label className="re-ref-label" htmlFor={`re-est-${entity}-${i}`}>
                          Estimate from listing (paste)
                        </label>
                        <input
                          id={`re-est-${entity}-${i}`}
                          type="text"
                          className="re-estimate-input"
                          value={r.estimatePaste ?? ""}
                          placeholder="Paste estimate (reference only)"
                          onChange={(ev) => {
                            const next = structuredClone(portfolio);
                            next.entities[entity].real_estate[i].estimatePaste = ev.target.value;
                            saveNow(next);
                          }}
                        />
                      </div>
                      <div className="re-blade-remove-slot" aria-hidden="true" />
                    </div>
                    <p className="muted re-ref-caption re-blade-caption">
                      Not used for calculations; no automatic fetch.
                    </p>
                  </div>
                </details>
              </div>
            );
          })}
        </div>
        {addingProperty && (
          <div className="draft-box re-property-band re-property-band--stripe re-property-band--draft">
            <h4>New property</h4>
            <div className="field-head row-re">
              <span>Address</span>
              <span>Market value</span>
              <span>Mortgage loan</span>
            </div>
            <div className="field-row row-re">
              <input
                value={draftProperty.address}
                placeholder="Address"
                onChange={(ev) => setDraftProperty((d) => ({ ...d, address: ev.target.value }))}
              />
              <AudCurrencyInput
                value={draftProperty.marketValue}
                placeholder="$0.00"
                onCommit={(n) => setDraftProperty((d) => ({ ...d, marketValue: n }))}
              />
              <AudCurrencyInput
                value={draftProperty.mortgageLoanAmount}
                placeholder="$0.00"
                onCommit={(n) => setDraftProperty((d) => ({ ...d, mortgageLoanAmount: n }))}
              />
            </div>
            <details className="re-blade">
              <summary className="re-blade-summary">Listing and loan details</summary>
              <div className="re-blade-body">
                <div
                  className={`field-row re-blade-row re-blade-row--draft re-blade-row--one-line ${draftProperty.occupancy === "Investment" ? "re-blade-row--one-line-invest" : ""}`}
                >
                  <div className="re-blade-stack re-blade-stack--occ">
                    <label className="re-ref-label re-ref-label--compact" htmlFor="re-draft-occ">
                      Occupancy
                    </label>
                    <select
                      id="re-draft-occ"
                      className="re-blade-select-occ"
                      value={draftProperty.occupancy}
                      onChange={(ev) =>
                        setDraftProperty((d) => ({
                          ...d,
                          occupancy: ev.target.value as RealEstateRow["occupancy"]
                        }))
                      }
                    >
                      <option value="">—</option>
                      <option value="Owner occupied">Owner Occupied</option>
                      <option value="Investment">Investment</option>
                    </select>
                  </div>
                  <div className="re-blade-stack re-blade-stack--hl">
                    <label className="re-ref-label re-ref-label--compact" htmlFor="re-draft-rate">
                      HL Int. Rate
                    </label>
                    <PercentInput
                      compact
                      value={Number(draftProperty.homeLoanInterestRatePercent ?? 0)}
                      onCommit={(n) =>
                        setDraftProperty((d) => ({ ...d, homeLoanInterestRatePercent: n }))
                      }
                    />
                  </div>
                  <div className="re-blade-stack re-blade-stack--money">
                    <label
                      className="re-ref-label re-ref-label--compact re-ref-label--label-width"
                      htmlFor="re-draft-repay"
                    >
                      Monthly repayment
                    </label>
                    <AudCurrencyInput
                      compact
                      value={Number(draftProperty.mortgageMonthlyRepayment || 0)}
                      placeholder="$0.00"
                      onCommit={(n) =>
                        setDraftProperty((d) => ({ ...d, mortgageMonthlyRepayment: n }))
                      }
                    />
                  </div>
                  {draftProperty.occupancy === "Investment" ? (
                    <>
                      <div className="re-blade-stack re-blade-stack--money re-blade-stack--rent re-blade-stack--invest-equal">
                        <label
                          className="re-ref-label re-ref-label--compact re-ref-label--label-width"
                          htmlFor="re-draft-rent"
                        >
                          Weekly rental
                        </label>
                        <AudCurrencyInput
                          compact
                          value={Number(draftProperty.rentalIncomeWeek || 0)}
                          placeholder="$0.00"
                          onCommit={(n) =>
                            setDraftProperty((d) => ({ ...d, rentalIncomeWeek: n }))
                          }
                        />
                      </div>
                      <div className="re-blade-stack re-blade-stack--money re-blade-stack--exp re-blade-stack--invest-equal">
                        <label
                          className="re-ref-label re-ref-label--compact re-ref-label--label-width"
                          htmlFor="re-draft-expmo"
                        >
                          Monthly expenses
                        </label>
                        <AudCurrencyInput
                          compact
                          value={Number(draftProperty.estimatedMonthlyExpenses ?? 0)}
                          placeholder="$0.00"
                          onCommit={(n) =>
                            setDraftProperty((d) => ({
                              ...d,
                              estimatedMonthlyExpenses: n,
                              expensesWeek: monthlyExpensesToWeekly(n)
                            }))
                          }
                        />
                      </div>
                      <div className="re-blade-stack re-blade-stack--annual re-blade-stack--invest-equal">
                        <span className="re-ref-label re-ref-label--compact">Est. annual return</span>
                        <div
                          className={`re-computed-return re-computed-return--compact ${draftEstAnnualReturn < 0 ? "re-computed-return--negative" : ""}`}
                          title="Weekly rental × 52 − monthly expenses × 12"
                        >
                          {fmtAudDollars(draftEstAnnualReturn)}
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>
                <div className="field-row re-blade-row re-blade-row--draft re-blade-row--listing">
                  <div className="re-blade-stack re-blade-stack--url-span">
                    <label className="re-ref-label" htmlFor="re-draft-url">
                      Listing URL
                    </label>
                    <div className="re-url-row">
                      <input
                        id="re-draft-url"
                        type="text"
                        inputMode="url"
                        autoComplete="url"
                        value={draftProperty.propertyUrl ?? ""}
                        placeholder="https://…"
                        onChange={(ev) =>
                          setDraftProperty((d) => ({ ...d, propertyUrl: ev.target.value }))
                        }
                      />
                      {listingUrlHref(draftProperty.propertyUrl ?? "") ? (
                        <a
                          href={listingUrlHref(draftProperty.propertyUrl ?? "")!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="re-open-link"
                        >
                          Open listing
                        </a>
                      ) : null}
                    </div>
                  </div>
                  <div className="re-blade-stack">
                    <label className="re-ref-label" htmlFor="re-draft-est">
                      Estimate from listing (paste)
                    </label>
                    <input
                      id="re-draft-est"
                      type="text"
                      className="re-estimate-input"
                      value={draftProperty.estimatePaste ?? ""}
                      placeholder="Paste estimate (reference only)"
                      onChange={(ev) =>
                        setDraftProperty((d) => ({ ...d, estimatePaste: ev.target.value }))
                      }
                    />
                  </div>
                </div>
                <p className="muted re-ref-caption re-blade-caption">
                  Not used for calculations; no automatic fetch.
                </p>
              </div>
            </details>
            <div className="draft-actions">
              <button
                type="button"
                onClick={() => {
                  const next = structuredClone(portfolio);
                  next.entities[entity].real_estate.push({ ...draftProperty });
                  saveNow(next);
                  setAddingProperty(false);
                  setDraftProperty(emptyPropertyDraft());
                }}
              >
                Add to portfolio
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setAddingProperty(false);
                  setDraftProperty(emptyPropertyDraft());
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        {!addingProperty && (
          <button type="button" className="btn-add-subtle" onClick={() => setAddingProperty(true)}>
            Add property
          </button>
        )}
      </div>

      <div className="card">
        <h3>Precious Metals</h3>
        <div className="spot-strip">
          <span><strong>Gold (AUD/oz):</strong> {fmtMoney(spot.gold)}</span>
          <span><strong>Silver (AUD/oz):</strong> {fmtMoney(spot.silver)}</span>
        </div>
        <div className="field-table">
          <div className="field-head row5">
            <span>Category</span>
            <span>Item</span>
            <span>Units</span>
            <span>Oz/unit</span>
            <span className="head-remove">Remove</span>
          </div>
          {e.precious_metals.map((m, i) => (
            <div key={`m-${i}`} className="field-row row5" style={{ marginBottom: 10 }}>
              <select
                value={m.category}
                onChange={(ev) => {
                  const next = structuredClone(portfolio);
                  next.entities[entity].precious_metals[i].category = ev.target.value as "Gold" | "Silver" | "Platinum";
                  saveNow(next);
                }}
              >
                <option>Gold</option><option>Silver</option><option>Platinum</option>
              </select>
              <input
                value={m.item}
                placeholder="Item"
                onChange={(ev) => {
                  const next = structuredClone(portfolio);
                  next.entities[entity].precious_metals[i].item = ev.target.value;
                  saveNow(next);
                }}
              />
              <input
                type="number"
                min={0}
                step="0.01"
                value={m.units}
                onChange={(ev) => {
                  const next = structuredClone(portfolio);
                  next.entities[entity].precious_metals[i].units = Number(ev.target.value || 0);
                  saveNow(next);
                }}
              />
              <input
                type="number"
                min={0}
                step="0.01"
                placeholder="Oz/unit"
                value={m.ozPerUnit}
                onChange={(ev) => {
                  const next = structuredClone(portfolio);
                  next.entities[entity].precious_metals[i].ozPerUnit = Number(ev.target.value || 0);
                  saveNow(next);
                }}
              />
              <div className="cell-remove">
                <button type="button" className="btn-remove" onClick={() => removeMetalRow(i)}>
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
        {addingMetal && (
          <div className="draft-box">
            <h4>New precious metal</h4>
            <div className="field-head row4">
              <span>Category</span>
              <span>Item</span>
              <span>Units</span>
              <span>Oz/unit</span>
            </div>
            <div className="field-row row4">
              <select
                value={draftMetal.category}
                onChange={(ev) =>
                  setDraftMetal((d) => ({ ...d, category: ev.target.value as MetalRow["category"] }))
                }
              >
                <option>Gold</option>
                <option>Silver</option>
                <option>Platinum</option>
              </select>
              <input
                value={draftMetal.item}
                placeholder="Item"
                onChange={(ev) => setDraftMetal((d) => ({ ...d, item: ev.target.value }))}
              />
              <input
                type="number"
                min={0}
                step="0.01"
                value={draftMetal.units}
                onChange={(ev) =>
                  setDraftMetal((d) => ({ ...d, units: Number(ev.target.value || 0) }))
                }
              />
              <input
                type="number"
                min={0}
                step="0.01"
                placeholder="Oz/unit"
                value={draftMetal.ozPerUnit}
                onChange={(ev) =>
                  setDraftMetal((d) => ({ ...d, ozPerUnit: Number(ev.target.value || 0) }))
                }
              />
            </div>
            <div className="draft-actions">
              <button
                type="button"
                onClick={() => {
                  const next = structuredClone(portfolio);
                  next.entities[entity].precious_metals.push({ ...draftMetal });
                  saveNow(next);
                  setAddingMetal(false);
                  setDraftMetal(emptyMetalDraft());
                }}
              >
                Add to portfolio
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setAddingMetal(false);
                  setDraftMetal(emptyMetalDraft());
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        {!addingMetal && (
          <button type="button" className="btn-add-subtle" onClick={() => setAddingMetal(true)}>
            Add precious metal
          </button>
        )}
      </div>

      <div className="card">
        <h3>Other Assets</h3>
        <div className="field-table">
          <div className="field-head row4o">
            <span>Asset type</span>
            <span>Description</span>
            <span>Market value</span>
            <span className="head-remove">Remove</span>
          </div>
          {e.other_assets.map((a, i) => (
            <div key={`o-${i}`} className="field-row row4o" style={{ marginBottom: 10 }}>
              <select
                value={a.assetType}
                onChange={(ev) => {
                  const next = structuredClone(portfolio);
                  next.entities[entity].other_assets[i].assetType = ev.target.value as typeof a.assetType;
                  saveNow(next);
                }}
              >
                <option>Managed Funds</option><option>Cash</option><option>Jewellery</option><option>Direct Shares</option><option>Other</option>
              </select>
              <input
                value={a.description}
                placeholder="Description"
                onChange={(ev) => {
                  const next = structuredClone(portfolio);
                  next.entities[entity].other_assets[i].description = ev.target.value;
                  saveNow(next);
                }}
              />
              <AudCurrencyInput
                value={Number(a.marketValue || 0)}
                placeholder="$0.00"
                onCommit={(n) => {
                  const next = structuredClone(portfolio);
                  next.entities[entity].other_assets[i].marketValue = n;
                  saveNow(next);
                }}
              />
              <div className="cell-remove">
                <button type="button" className="btn-remove" onClick={() => removeOtherRow(i)}>
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
        {addingOther && (
          <div className="draft-box">
            <h4>New other asset</h4>
            <div className="field-head row3">
              <span>Asset type</span>
              <span>Description</span>
              <span>Market value</span>
            </div>
            <div className="field-row row3">
              <select
                value={draftOther.assetType}
                onChange={(ev) =>
                  setDraftOther((d) => ({
                    ...d,
                    assetType: ev.target.value as OtherAssetRow["assetType"]
                  }))
                }
              >
                <option>Managed Funds</option>
                <option>Cash</option>
                <option>Jewellery</option>
                <option>Direct Shares</option>
                <option>Other</option>
              </select>
              <input
                value={draftOther.description}
                placeholder="Description"
                onChange={(ev) => setDraftOther((d) => ({ ...d, description: ev.target.value }))}
              />
              <AudCurrencyInput
                value={draftOther.marketValue}
                placeholder="$0.00"
                onCommit={(n) => setDraftOther((d) => ({ ...d, marketValue: n }))}
              />
            </div>
            <div className="draft-actions">
              <button
                type="button"
                onClick={() => {
                  const next = structuredClone(portfolio);
                  next.entities[entity].other_assets.push({ ...draftOther });
                  saveNow(next);
                  setAddingOther(false);
                  setDraftOther(emptyOtherDraft());
                }}
              >
                Add to portfolio
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setAddingOther(false);
                  setDraftOther(emptyOtherDraft());
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        {!addingOther && (
          <button type="button" className="btn-add-subtle" onClick={() => setAddingOther(true)}>
            Add other asset
          </button>
        )}
      </div>
    </div>
  );
}
