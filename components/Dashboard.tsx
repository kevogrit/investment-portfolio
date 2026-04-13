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
  "aria-label"?: string;
}) {
  const { value, onCommit, placeholder, compact, "aria-label": ariaLabel } = props;
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
        aria-label={ariaLabel ?? placeholder ?? "Interest rate percent"}
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
  "aria-label"?: string;
}) {
  const { value, onCommit, placeholder, compact, "aria-label": ariaLabel } = props;
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
      aria-label={ariaLabel ?? placeholder}
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
    Number(draftProperty.estimatedMonthlyExpenses ?? 0) * 12 -
    Number(draftProperty.mortgageMonthlyRepayment || 0) * 12;

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
          <div className="app-header-top">
            <div className="app-header-brand">
              <h2>My Investment Portfolio</h2>
              <p className="muted app-header-email">{email}</p>
            </div>
            <form action="/api/auth/logout" method="post" className="app-header-signout-form">
              <button className="secondary btn-signout" type="submit">Sign out</button>
            </form>
          </div>
          <div className="app-header-entity-total-wrap">
            <div className="app-header-entity">
              <select
                className="app-header-select"
                value={entity}
                onChange={(ev) => setEntity(ev.target.value as EntityId)}
                aria-label="Entity"
              >
                {ENTITY_IDS.map((id) => (
                  <option value={id} key={id}>{entityLabels[id]}</option>
                ))}
              </select>
            </div>
            <div className="entity-total-badge" title="Total for the selected entity only">
              <span className="entity-total-badge-amount">{fmtMoney(entityTotal)}</span>
              <span className="entity-total-badge-hint muted">Entity total</span>
            </div>
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
        <div className="field-table field-table--placeholders">
          {e.real_estate.map((r, i) => {
            const mv = Number(r.marketValue || 0);
            const loan = Number(r.mortgageLoanAmount || 0);
            const netEq = Math.max(0, mv - loan);
            const listingHref = listingUrlHref(r.propertyUrl ?? "");
            const isInvestment = r.occupancy === "Investment";
            const estMo = Number(r.estimatedMonthlyExpenses ?? 0);
            const weeklyRent = Number(r.rentalIncomeWeek || 0);
            const monthlyRepay = Number(r.mortgageMonthlyRepayment || 0);
            const estAnnualReturn = weeklyRent * 52 - estMo * 12 - monthlyRepay * 12;
            const ratePct = Number(r.homeLoanInterestRatePercent ?? 0);
            return (
              <div
                key={`r-${i}`}
                className={`re-property-band ${i % 2 === 0 ? "re-property-band--stripe" : ""}`}
              >
                <div className="field-row row-re4">
                  <div className="field-stack">
                    <label className="field-inline-label" htmlFor={`re-addr-${entity}-${i}`}>
                      Address
                    </label>
                    <input
                      id={`re-addr-${entity}-${i}`}
                      value={r.address}
                      placeholder=""
                      autoComplete="street-address"
                      onChange={(ev) => {
                        const next = structuredClone(portfolio);
                        next.entities[entity].real_estate[i].address = ev.target.value;
                        saveNow(next);
                      }}
                    />
                  </div>
                  <div className="field-stack">
                    <span className="field-inline-label">Market value</span>
                    <AudCurrencyInput
                      value={mv}
                      placeholder="$0.00"
                      aria-label="Market value"
                      onCommit={(n) => {
                        const next = structuredClone(portfolio);
                        next.entities[entity].real_estate[i].marketValue = n;
                        saveNow(next);
                      }}
                    />
                  </div>
                  <div className="field-stack">
                    <span className="field-inline-label">Mortgage loan</span>
                    <AudCurrencyInput
                      value={loan}
                      placeholder="$0.00"
                      aria-label="Mortgage loan"
                      onCommit={(n) => {
                        const next = structuredClone(portfolio);
                        next.entities[entity].real_estate[i].mortgageLoanAmount = n;
                        saveNow(next);
                      }}
                    />
                  </div>
                  <div className="field-stack field-stack--remove-only">
                    <div className="cell-remove">
                      <button type="button" className="btn-remove" onClick={() => removePropertyRow(i)}>
                        Remove
                      </button>
                    </div>
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
                        <label className="field-inline-label re-blade-field-label" htmlFor={`re-occ-${entity}-${i}`}>
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
                        <span className="field-inline-label re-blade-field-label">HL int. rate</span>
                        <PercentInput
                          compact
                          value={ratePct}
                          placeholder="0.00"
                          aria-label="HL int. rate"
                          onCommit={(n) => {
                            const next = structuredClone(portfolio);
                            next.entities[entity].real_estate[i].homeLoanInterestRatePercent = n;
                            saveNow(next);
                          }}
                        />
                      </div>
                      <div className="re-blade-stack re-blade-stack--money">
                        <span className="field-inline-label re-blade-field-label">Monthly repay.</span>
                        <AudCurrencyInput
                          compact
                          value={Number(r.mortgageMonthlyRepayment || 0)}
                          placeholder="$0.00"
                          aria-label="Monthly repay."
                          onCommit={(n) => {
                            const next = structuredClone(portfolio);
                            next.entities[entity].real_estate[i].mortgageMonthlyRepayment = n;
                            saveNow(next);
                          }}
                        />
                      </div>
                      {isInvestment ? (
                        <>
                          <div className="re-blade-stack re-blade-stack--money re-blade-stack--exp re-blade-stack--invest-equal">
                            <span className="field-inline-label re-blade-field-label">Monthly expenses</span>
                            <AudCurrencyInput
                              compact
                              value={estMo}
                              placeholder="$0.00"
                              aria-label="Monthly expenses"
                              onCommit={(n) => {
                                const next = structuredClone(portfolio);
                                const row = next.entities[entity].real_estate[i];
                                row.estimatedMonthlyExpenses = n;
                                row.expensesWeek = monthlyExpensesToWeekly(n);
                                saveNow(next);
                              }}
                            />
                          </div>
                          <div className="re-blade-stack re-blade-stack--money re-blade-stack--rent re-blade-stack--invest-equal">
                            <span className="field-inline-label re-blade-field-label">Weekly rental</span>
                            <AudCurrencyInput
                              compact
                              value={weeklyRent}
                              placeholder="$0.00"
                              aria-label="Weekly rental"
                              onCommit={(n) => {
                                const next = structuredClone(portfolio);
                                next.entities[entity].real_estate[i].rentalIncomeWeek = n;
                                saveNow(next);
                              }}
                            />
                          </div>
                          <div className="re-blade-stack re-blade-stack--annual re-blade-stack--invest-equal">
                            <span className="field-inline-label re-blade-field-label">Est. annual return</span>
                            <div
                              className={`re-computed-return re-computed-return--compact re-computed-return--blade-val ${estAnnualReturn < 0 ? "re-computed-return--negative" : ""}`}
                              title="Est. annual return — Weekly rental × 52 − monthly expenses × 12 − monthly repayment × 12"
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
                        <label className="field-inline-label re-blade-field-label" htmlFor={`re-url-${entity}-${i}`}>
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
                        <label className="field-inline-label re-blade-field-label" htmlFor={`re-est-${entity}-${i}`}>
                          Estimate (reference)
                        </label>
                        <input
                          id={`re-est-${entity}-${i}`}
                          type="text"
                          className="re-estimate-input"
                          value={r.estimatePaste ?? ""}
                          placeholder="Paste from listing"
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
            <div className="field-row row-re4 re-new-property-row">
              <div className="field-stack">
                <label className="field-inline-label" htmlFor="re-draft-addr">
                  Address
                </label>
                <input
                  id="re-draft-addr"
                  value={draftProperty.address}
                  placeholder=""
                  autoComplete="street-address"
                  onChange={(ev) => setDraftProperty((d) => ({ ...d, address: ev.target.value }))}
                />
              </div>
              <div className="field-stack">
                <span className="field-inline-label">Market value</span>
                <AudCurrencyInput
                  value={draftProperty.marketValue}
                  placeholder="$0.00"
                  aria-label="Market value"
                  onCommit={(n) => setDraftProperty((d) => ({ ...d, marketValue: n }))}
                />
              </div>
              <div className="field-stack">
                <span className="field-inline-label">Mortgage loan</span>
                <AudCurrencyInput
                  value={draftProperty.mortgageLoanAmount}
                  placeholder="$0.00"
                  aria-label="Mortgage loan"
                  onCommit={(n) => setDraftProperty((d) => ({ ...d, mortgageLoanAmount: n }))}
                />
              </div>
              <div className="field-stack field-stack--new-property-spacer" aria-hidden="true" />
            </div>
            <details className="re-blade">
              <summary className="re-blade-summary">Listing and loan details</summary>
              <div className="re-blade-body">
                <div
                  className={`field-row re-blade-row re-blade-row--draft re-blade-row--one-line ${draftProperty.occupancy === "Investment" ? "re-blade-row--one-line-invest" : ""}`}
                >
                  <div className="re-blade-stack re-blade-stack--occ">
                    <label className="field-inline-label re-blade-field-label" htmlFor="re-draft-occ">
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
                    <span className="field-inline-label re-blade-field-label">HL int. rate</span>
                    <PercentInput
                      compact
                      value={Number(draftProperty.homeLoanInterestRatePercent ?? 0)}
                      placeholder="0.00"
                      aria-label="HL int. rate"
                      onCommit={(n) =>
                        setDraftProperty((d) => ({ ...d, homeLoanInterestRatePercent: n }))
                      }
                    />
                  </div>
                  <div className="re-blade-stack re-blade-stack--money">
                    <span className="field-inline-label re-blade-field-label">Monthly repay.</span>
                    <AudCurrencyInput
                      compact
                      value={Number(draftProperty.mortgageMonthlyRepayment || 0)}
                      placeholder="$0.00"
                      aria-label="Monthly repay."
                      onCommit={(n) =>
                        setDraftProperty((d) => ({ ...d, mortgageMonthlyRepayment: n }))
                      }
                    />
                  </div>
                  {draftProperty.occupancy === "Investment" ? (
                    <>
                      <div className="re-blade-stack re-blade-stack--money re-blade-stack--exp re-blade-stack--invest-equal">
                        <span className="field-inline-label re-blade-field-label">Monthly expenses</span>
                        <AudCurrencyInput
                          compact
                          value={Number(draftProperty.estimatedMonthlyExpenses ?? 0)}
                          placeholder="$0.00"
                          aria-label="Monthly expenses"
                          onCommit={(n) =>
                            setDraftProperty((d) => ({
                              ...d,
                              estimatedMonthlyExpenses: n,
                              expensesWeek: monthlyExpensesToWeekly(n)
                            }))
                          }
                        />
                      </div>
                      <div className="re-blade-stack re-blade-stack--money re-blade-stack--rent re-blade-stack--invest-equal">
                        <span className="field-inline-label re-blade-field-label">Weekly rental</span>
                        <AudCurrencyInput
                          compact
                          value={Number(draftProperty.rentalIncomeWeek || 0)}
                          placeholder="$0.00"
                          aria-label="Weekly rental"
                          onCommit={(n) =>
                            setDraftProperty((d) => ({ ...d, rentalIncomeWeek: n }))
                          }
                        />
                      </div>
                      <div className="re-blade-stack re-blade-stack--annual re-blade-stack--invest-equal">
                        <span className="field-inline-label re-blade-field-label">Est. annual return</span>
                        <div
                          className={`re-computed-return re-computed-return--compact re-computed-return--blade-val ${draftEstAnnualReturn < 0 ? "re-computed-return--negative" : ""}`}
                          title="Est. annual return — Weekly rental × 52 − monthly expenses × 12 − monthly repayment × 12"
                        >
                          {fmtAudDollars(draftEstAnnualReturn)}
                        </div>
                      </div>
                    </>
                  ) : null}
                  <div className="re-blade-remove-slot" aria-hidden="true" />
                </div>
                <div className="field-row re-blade-row re-blade-row--draft re-blade-row--listing">
                  <div className="re-blade-stack re-blade-stack--url-span">
                    <label className="field-inline-label re-blade-field-label" htmlFor="re-draft-url">
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
                    <label className="field-inline-label re-blade-field-label" htmlFor="re-draft-est">
                      Estimate (reference)
                    </label>
                    <input
                      id="re-draft-est"
                      type="text"
                      className="re-estimate-input"
                      value={draftProperty.estimatePaste ?? ""}
                      placeholder="Paste from listing"
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
        <div className="field-table field-table--placeholders">
          {e.precious_metals.map((m, i) => (
            <div key={`m-${i}`} className="field-row row5" style={{ marginBottom: 10 }}>
              <div className="field-stack">
                <label className="field-inline-label" htmlFor={`pm-cat-${entity}-${i}`}>
                  Category
                </label>
                <select
                  id={`pm-cat-${entity}-${i}`}
                  value={m.category}
                  onChange={(ev) => {
                    const next = structuredClone(portfolio);
                    next.entities[entity].precious_metals[i].category = ev.target.value as "Gold" | "Silver" | "Platinum";
                    saveNow(next);
                  }}
                >
                  <option>Gold</option><option>Silver</option><option>Platinum</option>
                </select>
              </div>
              <div className="field-stack">
                <label className="field-inline-label" htmlFor={`pm-item-${entity}-${i}`}>
                  Item
                </label>
                <input
                  id={`pm-item-${entity}-${i}`}
                  value={m.item}
                  placeholder=""
                  onChange={(ev) => {
                    const next = structuredClone(portfolio);
                    next.entities[entity].precious_metals[i].item = ev.target.value;
                    saveNow(next);
                  }}
                />
              </div>
              <div className="field-stack">
                <label className="field-inline-label" htmlFor={`pm-units-${entity}-${i}`}>
                  Units
                </label>
                <input
                  id={`pm-units-${entity}-${i}`}
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder=""
                  value={m.units === 0 ? "" : m.units}
                  onChange={(ev) => {
                    const next = structuredClone(portfolio);
                    next.entities[entity].precious_metals[i].units = Number(ev.target.value || 0);
                    saveNow(next);
                  }}
                />
              </div>
              <div className="field-stack">
                <label className="field-inline-label" htmlFor={`pm-oz-${entity}-${i}`}>
                  Oz per unit
                </label>
                <input
                  id={`pm-oz-${entity}-${i}`}
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder=""
                  value={m.ozPerUnit === 0 ? "" : m.ozPerUnit}
                  onChange={(ev) => {
                    const next = structuredClone(portfolio);
                    next.entities[entity].precious_metals[i].ozPerUnit = Number(ev.target.value || 0);
                    saveNow(next);
                  }}
                />
              </div>
              <div className="field-stack field-stack--remove-only">
                <div className="cell-remove">
                  <button type="button" className="btn-remove" onClick={() => removeMetalRow(i)}>
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
        {addingMetal && (
          <div className="draft-box">
            <h4>New precious metal</h4>
            <div className="field-row row4">
              <div className="field-stack">
                <label className="field-inline-label" htmlFor="pm-draft-cat">
                  Category
                </label>
                <select
                  id="pm-draft-cat"
                  value={draftMetal.category}
                  onChange={(ev) =>
                    setDraftMetal((d) => ({ ...d, category: ev.target.value as MetalRow["category"] }))
                  }
                >
                  <option>Gold</option>
                  <option>Silver</option>
                  <option>Platinum</option>
                </select>
              </div>
              <div className="field-stack">
                <label className="field-inline-label" htmlFor="pm-draft-item">
                  Item
                </label>
                <input
                  id="pm-draft-item"
                  value={draftMetal.item}
                  placeholder=""
                  onChange={(ev) => setDraftMetal((d) => ({ ...d, item: ev.target.value }))}
                />
              </div>
              <div className="field-stack">
                <label className="field-inline-label" htmlFor="pm-draft-units">
                  Units
                </label>
                <input
                  id="pm-draft-units"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder=""
                  value={draftMetal.units === 0 ? "" : draftMetal.units}
                  onChange={(ev) =>
                    setDraftMetal((d) => ({ ...d, units: Number(ev.target.value || 0) }))
                  }
                />
              </div>
              <div className="field-stack">
                <label className="field-inline-label" htmlFor="pm-draft-oz">
                  Oz per unit
                </label>
                <input
                  id="pm-draft-oz"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder=""
                  value={draftMetal.ozPerUnit === 0 ? "" : draftMetal.ozPerUnit}
                  onChange={(ev) =>
                    setDraftMetal((d) => ({ ...d, ozPerUnit: Number(ev.target.value || 0) }))
                  }
                />
              </div>
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
        <div className="field-table field-table--placeholders">
          {e.other_assets.map((a, i) => (
            <div key={`o-${i}`} className="field-row row4o" style={{ marginBottom: 10 }}>
              <div className="field-stack">
                <label className="field-inline-label" htmlFor={`oa-type-${entity}-${i}`}>
                  Asset type
                </label>
                <select
                  id={`oa-type-${entity}-${i}`}
                  value={a.assetType}
                  onChange={(ev) => {
                    const next = structuredClone(portfolio);
                    next.entities[entity].other_assets[i].assetType = ev.target.value as typeof a.assetType;
                    saveNow(next);
                  }}
                >
                  <option>Managed Funds</option><option>Cash</option><option>Jewellery</option><option>Direct Shares</option><option>Other</option>
                </select>
              </div>
              <div className="field-stack">
                <label className="field-inline-label" htmlFor={`oa-desc-${entity}-${i}`}>
                  Description
                </label>
                <input
                  id={`oa-desc-${entity}-${i}`}
                  value={a.description}
                  placeholder=""
                  onChange={(ev) => {
                    const next = structuredClone(portfolio);
                    next.entities[entity].other_assets[i].description = ev.target.value;
                    saveNow(next);
                  }}
                />
              </div>
              <div className="field-stack">
                <span className="field-inline-label">Market value</span>
                <AudCurrencyInput
                  value={Number(a.marketValue || 0)}
                  placeholder="$0.00"
                  aria-label="Market value"
                  onCommit={(n) => {
                    const next = structuredClone(portfolio);
                    next.entities[entity].other_assets[i].marketValue = n;
                    saveNow(next);
                  }}
                />
              </div>
              <div className="field-stack field-stack--remove-only">
                <div className="cell-remove">
                  <button type="button" className="btn-remove" onClick={() => removeOtherRow(i)}>
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
        {addingOther && (
          <div className="draft-box">
            <h4>New other asset</h4>
            <div className="field-row row3">
              <div className="field-stack">
                <label className="field-inline-label" htmlFor="oa-draft-type">
                  Asset type
                </label>
                <select
                  id="oa-draft-type"
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
              </div>
              <div className="field-stack">
                <label className="field-inline-label" htmlFor="oa-draft-desc">
                  Description
                </label>
                <input
                  id="oa-draft-desc"
                  value={draftOther.description}
                  placeholder=""
                  onChange={(ev) => setDraftOther((d) => ({ ...d, description: ev.target.value }))}
                />
              </div>
              <div className="field-stack">
                <span className="field-inline-label">Market value</span>
                <AudCurrencyInput
                  value={draftOther.marketValue}
                  placeholder="$0.00"
                  aria-label="Market value"
                  onCommit={(n) => setDraftOther((d) => ({ ...d, marketValue: n }))}
                />
              </div>
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
