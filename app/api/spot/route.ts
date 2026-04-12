import { NextResponse } from "next/server";

const ABC_BULLION_URL = "https://www.abcbullion.com.au/";
const DEFAULT_GOLD = 7309.61;
const DEFAULT_SILVER = 130.02;

/**
 * Match standalone "BUY GOLD" / "BUY SILVER" (not inside "BUY GOLD AND SILVER").
 * Case-insensitive like the Python dashboard.
 */
function extractPrice(html: string, label: string): number | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `\\b${escaped}\\b\\s*.*?([0-9][0-9,]*\\.?[0-9]*)\\s*/oz`,
    "is"
  );
  const m = html.match(pattern);
  if (!m) return null;
  const n = Number((m[1] || "").replaceAll(",", ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * If silver looks like gold (same number or absurdly high for silver/oz), scan all
 * BUY GOLD / BUY SILVER … /oz pairs and take the first of each metal.
 */
function extractPricesWithFallback(html: string): { gold: number | null; silver: number | null } {
  let gold = extractPrice(html, "BUY GOLD");
  let silver = extractPrice(html, "BUY SILVER");

  if (
    silver != null &&
    gold != null &&
    (silver >= 1000 || Math.abs(silver - gold) < 0.01)
  ) {
    const re = /\bBUY\s+(GOLD|SILVER)\b[^0-9]*([0-9][0-9,]*\.?[0-9]*)\s*\/oz/gi;
    let goldFound = false;
    let silverFound = false;
    for (const match of html.matchAll(re)) {
      const metal = (match[1] || "").toUpperCase();
      const raw = (match[2] || "").replaceAll(",", "");
      const p = Number(raw);
      if (!Number.isFinite(p)) continue;
      if (metal === "GOLD" && !goldFound) {
        gold = p;
        goldFound = true;
      } else if (metal === "SILVER" && !silverFound) {
        silver = p;
        silverFound = true;
      }
      if (goldFound && silverFound) break;
    }
  }

  return { gold, silver };
}

export async function GET() {
  try {
    const res = await fetch(ABC_BULLION_URL, { cache: "no-store" });
    const html = await res.text();
    const { gold: g, silver: s } = extractPricesWithFallback(html);
    const gold = g ?? DEFAULT_GOLD;
    const silver = s ?? DEFAULT_SILVER;
    return NextResponse.json({ gold, silver });
  } catch {
    return NextResponse.json({ gold: DEFAULT_GOLD, silver: DEFAULT_SILVER });
  }
}
