# Section 6 replacement for Portfolio Management App plan

Replace **Section 6** in the main plan file with the following:

---

## 6. Portfolio value display (required)

Show two levels of portfolio value (market value minus listed mortgages):

**Per entity – Portfolio Value**  
For each entity (Individual, SMSF, Family Trust), display an **overall Portfolio Value** for that entity:

- **Formula**: (Total market value of assets in that entity) − (Any listed mortgages in that entity).
- **Calculation**:
  - Precious metals: sum of Spot Value (already market value).
  - Real estate: sum of **Net equity** per property (market value − mortgage loan amount); mortgages are thus already deducted.
  - Other assets: sum of Market value.
- **Display**: e.g. "Individual – Portfolio Value: $X" (and similarly for SMSF, Family Trust). Shown near the entity selector or at the top of each entity's view.

**Consolidated – Total Portfolio Value**  
Display an **overall consolidated Portfolio Value** across all entities:

- **Formula**: Sum of the three per-entity Portfolio Values (Individual + SMSF + Family Trust).
- **Display**: e.g. "Total Portfolio Value: $Y" in a prominent place (e.g. top of main content or a small summary panel above the entity selector).

Optional extra: per-entity or consolidated **weekly income** (e.g. sum of Real estate weekly income where applicable).

---
