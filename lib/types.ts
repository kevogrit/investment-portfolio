export const ENTITY_IDS = ["individual", "smsf", "family_trust"] as const;
export type EntityId = (typeof ENTITY_IDS)[number];

export type MetalRow = {
  category: "Gold" | "Silver" | "Platinum";
  item: string;
  units: number;
  ozPerUnit: number;
};

export type RealEstateRow = {
  address: string;
  /** Optional listing URL (reference only; not scraped). */
  propertyUrl?: string;
  /** Free-text paste of an estimate from a listing site (reference only). */
  estimatePaste?: string;
  marketValue: number;
  occupancy: "" | "Investment" | "Owner occupied";
  /** Home loan interest rate, percent (e.g. 5.25 = 5.25%). */
  homeLoanInterestRatePercent?: number;
  rentalIncomeWeek: number;
  /** Legacy weekly expenses; kept in sync from estimatedMonthlyExpenses when set from this app. */
  expensesWeek: number;
  /** Investment property: estimated expenses per month (AUD). */
  estimatedMonthlyExpenses?: number;
  mortgageLoanAmount: number;
  mortgageMonthlyRepayment: number;
};

export type OtherAssetRow = {
  assetType: "Managed Funds" | "Cash" | "Jewellery" | "Direct Shares" | "Other";
  description: string;
  marketValue: number;
};

export type EntityPortfolio = {
  precious_metals: MetalRow[];
  real_estate: RealEstateRow[];
  other_assets: OtherAssetRow[];
};

export type Portfolio = {
  entities: Record<EntityId, EntityPortfolio>;
};

export const defaultPortfolio = (): Portfolio => ({
  entities: {
    individual: { precious_metals: [], real_estate: [], other_assets: [] },
    smsf: { precious_metals: [], real_estate: [], other_assets: [] },
    family_trust: { precious_metals: [], real_estate: [], other_assets: [] }
  }
});

/** Merge Streamlit-style snake_case RE fields into camelCase when loading from DB. */
export function normalizePortfolio(raw: unknown): Portfolio {
  if (!raw || typeof raw !== "object") return defaultPortfolio();
  const p = raw as Partial<Portfolio>;
  if (!p.entities || typeof p.entities !== "object") return defaultPortfolio();
  const out = structuredClone(p as Portfolio);
  for (const eid of ENTITY_IDS) {
    const ent = out.entities[eid];
    if (!ent?.real_estate?.length) continue;
    for (const r of ent.real_estate) {
      const row = r as RealEstateRow & {
        property_url?: string;
        estimate_paste?: string;
        home_loan_interest_rate_percent?: number;
        estimated_monthly_expenses?: number;
      };
      const urlC = String(row.propertyUrl ?? "").trim();
      const urlS = typeof row.property_url === "string" ? row.property_url.trim() : "";
      if (!urlC && urlS) row.propertyUrl = urlS;
      const pasteC = String(row.estimatePaste ?? "").trim();
      const pasteS = typeof row.estimate_paste === "string" ? row.estimate_paste.trim() : "";
      if (!pasteC && pasteS) row.estimatePaste = pasteS;
      const rateC = row.homeLoanInterestRatePercent;
      const rateS = row.home_loan_interest_rate_percent;
      if (
        (rateC === undefined || rateC === null || Number.isNaN(Number(rateC))) &&
        typeof rateS === "number" &&
        Number.isFinite(rateS)
      ) {
        row.homeLoanInterestRatePercent = rateS;
      }
      const expMoS = row.estimated_monthly_expenses;
      const hasMonthlyField =
        row.estimatedMonthlyExpenses !== undefined && row.estimatedMonthlyExpenses !== null;
      if (!hasMonthlyField) {
        if (typeof expMoS === "number" && Number.isFinite(expMoS)) {
          row.estimatedMonthlyExpenses = expMoS;
        } else {
          const w = Number(row.expensesWeek || 0);
          if (w > 0) row.estimatedMonthlyExpenses = (w * 52) / 12;
        }
      }
    }
  }
  return out;
}
