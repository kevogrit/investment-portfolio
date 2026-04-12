import math
import os
import re
from pathlib import Path
from typing import Any, List, Optional, Tuple

import pandas as pd
import plotly.express as px
import requests
import streamlit as st

import auth

# === Configuration ===
# Export path for Precious Metals export (optional)
EXPORT_EXCEL_PATH = Path(__file__).resolve().parent / "precious_metals_export.xlsx"

# Precious metals spot prices – ABC Bullion
ABC_BULLION_URL = "https://www.abcbullion.com.au/"
DEFAULT_GOLD_PRICE_AUD_PER_OZ = 7309.61
DEFAULT_SILVER_PRICE_AUD_PER_OZ = 130.02

# Real estate – market value source
REALESTATE_COM_AU_BASE = "https://www.realestate.com.au"


METAL_COLUMN = "Category"
OUNCES_COLUMN = "Total Oz"
UNITS_COLUMN = "Units"
OZ_PER_UNIT_COLUMN = "Oz/unit"
UNDERLYING_MAX_ROWS = 12  # show and edit first 12 rows (user can add more)
UNDERLYING_NUM_COLUMNS = 6


def _default_empty_table() -> pd.DataFrame:
    """Empty portfolio table with required columns (no ID column)."""
    return pd.DataFrame(
        {
            METAL_COLUMN: [None],
            "Item": [None],
            UNITS_COLUMN: [0.0],
            OZ_PER_UNIT_COLUMN: [0.0],
            OUNCES_COLUMN: [0.0],
        }
    )


ENTITY_LABELS = {"individual": "Individual", "smsf": "SMSF", "family_trust": "Family Trust"}


def load_metals_for_entity(full_portfolio: dict, entity_id: str) -> Optional[pd.DataFrame]:
    """Load precious metals table for one entity from full portfolio dict."""
    try:
        raw = (full_portfolio.get("entities") or {}).get(entity_id, {}).get("precious_metals")
    except Exception:
        return None
    if not raw:
        return None
    try:
        df = pd.read_json(raw, orient="split") if isinstance(raw, str) else pd.DataFrame(raw)
        if df.empty or (METAL_COLUMN not in df.columns and UNITS_COLUMN not in df.columns):
            return None
        if "ID" in df.columns:
            df = df.drop(columns=["ID"])
        for col in [METAL_COLUMN, "Item", UNITS_COLUMN, OZ_PER_UNIT_COLUMN, OUNCES_COLUMN]:
            if col not in df.columns:
                df[col] = None if col in (METAL_COLUMN, "Item") else 0.0
        return df
    except Exception:
        return None


def save_metals_for_entity(full_portfolio: dict, entity_id: str, df: pd.DataFrame) -> dict:
    """Write metals table into full portfolio for one entity; returns updated dict."""
    data = dict(full_portfolio)
    if "entities" not in data:
        data["entities"] = {e: dict(auth.DEFAULT_ENTITY_BLOB) for e in auth.ENTITY_IDS}
    if entity_id not in data["entities"]:
        data["entities"][entity_id] = dict(auth.DEFAULT_ENTITY_BLOB)
    data["entities"][entity_id]["precious_metals"] = df.to_json(orient="split")
    return data


def load_portfolio_data_for_user(user_id: int) -> Optional[pd.DataFrame]:
    """Legacy: load metals for default entity (individual). Use load_metals_for_entity with load_full_portfolio instead."""
    full = auth.load_full_portfolio(user_id)
    return load_metals_for_entity(full, "individual")


def save_portfolio_data_for_user(user_id: int, df: pd.DataFrame) -> None:
    """Legacy: save metals for individual only. Use save_metals_for_entity + save_full_portfolio instead."""
    full = auth.load_full_portfolio(user_id)
    full = save_metals_for_entity(full, "individual", df)
    auth.save_full_portfolio(user_id, full)


def _apply_data_editor_delta(df: pd.DataFrame, delta: dict) -> pd.DataFrame:
    """
    Apply Streamlit data_editor session-state delta (edited_rows, added_rows, deleted_rows).
    Never apply delta to calculated columns (Total Oz, Spot Value). Returns a new DataFrame.
    """
    computed_cols = {OUNCES_COLUMN, "Spot Value"}
    out = df.copy()
    if "deleted_rows" in delta and delta["deleted_rows"]:
        out = out.drop(index=sorted(delta["deleted_rows"])).reset_index(drop=True)
    if "edited_rows" in delta and delta["edited_rows"]:
        for row_idx, cols in delta["edited_rows"].items():
            i = int(row_idx) if isinstance(row_idx, str) else row_idx
            if i < 0 or i >= len(out):
                continue
            for col, value in cols.items():
                if col in out.columns and col not in computed_cols:
                    out.iloc[i, out.columns.get_loc(col)] = value
    if "added_rows" in delta and delta["added_rows"]:
        cols_order = list(out.columns)
        for row in delta["added_rows"]:
            if isinstance(row, dict):
                row = {k: v for k, v in row.items() if k not in computed_cols}
                new_row = pd.DataFrame([row])
            elif isinstance(row, (list, tuple)) and len(row) >= 4:
                # Row as list: assume order Category, Item, Units, Oz/unit, [Total Oz, Spot Value]
                n = min(len(cols_order), len(row))
                row = {cols_order[j]: row[j] for j in range(n)}
                new_row = pd.DataFrame([row])
            else:
                new_row = pd.DataFrame([row])
            new_row = new_row.reindex(columns=out.columns, fill_value=None)
            new_row[UNITS_COLUMN] = pd.to_numeric(new_row[UNITS_COLUMN], errors="coerce").fillna(0.0)
            new_row[OZ_PER_UNIT_COLUMN] = pd.to_numeric(new_row[OZ_PER_UNIT_COLUMN], errors="coerce").fillna(0.0)
            out = pd.concat([out, new_row], ignore_index=True)
    return out


def guess_column(columns, candidates):
    """
    Try to guess a column name from a list of candidates using
    case-insensitive matching and simple containment checks.
    Handles column names that may be ints (e.g. from Excel).
    """
    normalized = {str(col).lower(): col for col in columns}
    for candidate in candidates:
        cand_lower = candidate.lower()
        if cand_lower in normalized:
            return normalized[cand_lower]

    # Fallback: pick first column whose name contains any candidate substring
    for col in columns:
        col_lower = str(col).lower()
        for candidate in candidates:
            if candidate.lower() in col_lower:
                return col

    # If nothing matches, just return the first column
    return columns[0] if columns else None


def total_ounces_for_row(
    row: pd.Series,
    units_col: str,
    oz_per_unit_col: str,
) -> float:
    """
    Calculate Total Oz as Units × Oz/unit for a single row.
    """
    units = pd.to_numeric(row.get(units_col), errors="coerce")
    oz_per_unit = pd.to_numeric(row.get(oz_per_unit_col), errors="coerce")
    if units is None or (isinstance(units, float) and math.isnan(units)):
        units = 0.0
    if oz_per_unit is None or (isinstance(oz_per_unit, float) and math.isnan(oz_per_unit)):
        oz_per_unit = 0.0
    return float(units * oz_per_unit)


def spot_value_for_row(
    row: pd.Series,
    metal_col: str,
    ounces_col: str,
    gold_price: float,
    silver_price: float,
) -> float:
    """Spot price × Total Oz for this row based on Category (Gold/Silver)."""
    cat = classify_metal(row.get(metal_col))
    oz = pd.to_numeric(row.get(ounces_col), errors="coerce")
    if oz is None or (isinstance(oz, float) and math.isnan(oz)):
        oz = 0.0
    if cat == "Gold":
        return float(gold_price * oz)
    if cat == "Silver":
        return float(silver_price * oz)
    return 0.0


def classify_metal(raw_value: object) -> Optional[str]:
    """
    Map raw metal labels to 'Gold' or 'Silver' where possible.
    Returns None for anything that doesn't look like either.
    """
    if raw_value is None or (isinstance(raw_value, float) and math.isnan(raw_value)):
        return None

    text = str(raw_value).strip().lower()
    if not text:
        return None

    if "gold" in text or "xau" in text or text in {"au"}:
        return "Gold"
    if "silver" in text or "xag" in text or text in {"ag"}:
        return "Silver"

    return None


def fetch_spot_prices_from_abc_bullion() -> Tuple[Optional[float], Optional[float], Optional[str]]:
    """
    Fetch latest gold and silver buy prices (AUD/oz) from ABC Bullion.

    Returns (gold_price, silver_price, warning_message).
    Any of the prices may be None if parsing fails; the caller must
    fall back to defaults in that case.
    """
    try:
        response = requests.get(ABC_BULLION_URL, timeout=10)
        response.raise_for_status()
        html = response.text
    except Exception as exc:  # noqa: BLE001
        return None, None, f"Could not fetch latest prices from ABC Bullion: {exc}"

    # Match standalone "BUY GOLD" / "BUY SILVER" (not "BUY GOLD AND SILVER") so we get
    # the correct price for each. Use \b to avoid matching inside other phrases.
    def _extract(label: str) -> Optional[float]:
        # Require word boundary so "BUY SILVER" doesn't match inside "BUY GOLD AND SILVER"
        pattern = rf"\b{re.escape(label)}\b\s*.*?([0-9][0-9,]*\.?[0-9]*)\s*/oz"
        match = re.search(pattern, html, flags=re.IGNORECASE | re.DOTALL)
        if not match:
            return None
        raw = match.group(1).replace(",", "")
        try:
            return float(raw)
        except ValueError:
            return None

    gold_price = _extract("BUY GOLD")
    silver_price = _extract("BUY SILVER")

    # If silver looks wrong (e.g. same as gold or way too high), re-parse: find all
    # "BUY METAL number/oz" pairs and use the first GOLD and first SILVER.
    if silver_price is not None and gold_price is not None and (
        silver_price >= 1000 or abs(silver_price - gold_price) < 0.01
    ):
        all_prices = re.findall(
            r"\bBUY\s+(GOLD|SILVER)\b[^0-9]*([0-9][0-9,]*\.?[0-9]*)\s*/oz",
            html,
            flags=re.IGNORECASE,
        )
        gold_found = silver_found = False
        for metal, raw in all_prices:
            try:
                p = float(raw.replace(",", ""))
                if metal.upper() == "GOLD" and not gold_found:
                    gold_price = p
                    gold_found = True
                elif metal.upper() == "SILVER" and not silver_found:
                    silver_price = p
                    silver_found = True
                if gold_found and silver_found:
                    break
            except ValueError:
                pass

    warning: Optional[str] = None
    if gold_price is None or silver_price is None:
        warning = (
            "Unable to parse one or both spot prices from ABC Bullion; "
            "falling back to built-in defaults where necessary."
        )

    return gold_price, silver_price, warning


def fetch_google_place_suggestions(input_text: str, api_key: Optional[str]) -> Tuple[List[str], Optional[str]]:
    """
    Call Google Places API (New) Autocomplete. Returns (list of address strings, error message).
    Requires a valid API key from Google Cloud (Places API enabled).
    """
    if not api_key or not (input_text or "").strip():
        return [], None
    url = "https://places.googleapis.com/v1/places:autocomplete"
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key.strip(),
    }
    body = {"input": input_text.strip()}
    try:
        r = requests.post(url, json=body, headers=headers, timeout=10)
        r.raise_for_status()
        data = r.json()
        suggestions = []
        for s in data.get("suggestions") or []:
            place = s.get("placePrediction") or {}
            if not isinstance(place, dict):
                continue
            # New API: text can be {"text": "Full address"} or a string
            text_obj = place.get("text")
            if isinstance(text_obj, dict):
                text = text_obj.get("text")
            else:
                text = text_obj
            if text and isinstance(text, str):
                suggestions.append(text)
        return suggestions[:10], None
    except Exception as e:
        return [], str(e)


def fetch_market_value_realestate_com_au(address: str) -> Tuple[Optional[float], Optional[str]]:
    """
    Try to get an indicative market value from realestate.com.au search for the given address.
    Returns (price_float or None, error_or_info_message).
    """
    if not (address or "").strip():
        return None, "Enter an address first."
    query = address.strip()
    # Build search URL: realestate.com.au uses /buy/in-{location}/list-1; use keywords if available
    slug = re.sub(r"[^\w\s-]", "", query)[:80].strip().replace(" ", "+").replace("++", "+")
    if not slug:
        return None, "Address too short."
    url = f"https://www.realestate.com.au/buy/in-{slug}/list-1"
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-AU,en;q=0.9",
    }
    try:
        r = requests.get(url, headers=headers, timeout=15)
        r.raise_for_status()
        html = r.text
    except Exception as e:
        return None, f"Could not reach realestate.com.au: {e}"
    # Look for price patterns: $1,234,567 or "price":1234567 or "price": 1234567
    prices = []
    for pattern in [
        r'"price"\s*:\s*(\d+)',
        r'"listingPrice"\s*:\s*(\d+)',
        r'\$[\s]*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?)\s*(?:million|M)?',
        r'([0-9]{2,3},?[0-9]{3},?[0-9]{3})',
    ]:
        for m in re.finditer(pattern, html, re.IGNORECASE):
            try:
                raw = m.group(1).replace(",", "").replace(" ", "")
                v = float(raw)
                if 20_000 <= v <= 50_000_000:
                    prices.append(v)
            except (ValueError, IndexError):
                continue
    if not prices:
        return None, "No price found for this address on realestate.com.au. You can enter a value manually."
    # Use median or first as indicative value
    return float(prices[len(prices) // 2]), None


def compute_metals_total(full_portfolio: dict, entity_id: str, gold_price: float, silver_price: float) -> float:
    """Sum of spot value (at current prices) for entity's precious metals."""
    df = load_metals_for_entity(full_portfolio, entity_id)
    if df is None or df.empty:
        return 0.0
    df = df.copy()
    df[UNITS_COLUMN] = pd.to_numeric(df[UNITS_COLUMN], errors="coerce").fillna(0.0)
    df[OZ_PER_UNIT_COLUMN] = pd.to_numeric(df[OZ_PER_UNIT_COLUMN], errors="coerce").fillna(0.0)
    if OUNCES_COLUMN not in df.columns:
        df[OUNCES_COLUMN] = 0.0
    df[OUNCES_COLUMN] = df.apply(
        lambda row: total_ounces_for_row(row, UNITS_COLUMN, OZ_PER_UNIT_COLUMN),
        axis=1,
    )
    df["Spot Value"] = df.apply(
        lambda row: spot_value_for_row(row, METAL_COLUMN, OUNCES_COLUMN, gold_price, silver_price),
        axis=1,
    )
    return float(pd.to_numeric(df["Spot Value"], errors="coerce").fillna(0).sum())


def compute_real_estate_net_equity(full_portfolio: dict, entity_id: str) -> float:
    """Sum of (market_value - mortgage_loan_amount) for entity's real estate."""
    props = (full_portfolio.get("entities") or {}).get(entity_id, {}).get("real_estate") or []
    total = 0.0
    for p in props:
        mv = float(p.get("market_value") or 0)
        loan = float(p.get("mortgage_loan_amount") or 0)
        total += max(0, mv - loan)
    return total


def compute_other_assets_total(full_portfolio: dict, entity_id: str) -> float:
    """Sum of market_value for entity's other assets."""
    assets = (full_portfolio.get("entities") or {}).get(entity_id, {}).get("other_assets") or []
    return sum(float(a.get("market_value") or 0) for a in assets)


def compute_entity_portfolio_value(
    full_portfolio: dict,
    entity_id: str,
    gold_price: float,
    silver_price: float,
) -> float:
    """Portfolio value for one entity = metals total + real estate net equity + other assets total."""
    return (
        compute_metals_total(full_portfolio, entity_id, gold_price, silver_price)
        + compute_real_estate_net_equity(full_portfolio, entity_id)
        + compute_other_assets_total(full_portfolio, entity_id)
    )


def _currency_text_input(label: str, value: float, key: str) -> float:
    raw = st.text_input(label, value=f"${float(value or 0.0):,.2f}", key=key)
    cleaned = (raw or "").replace("$", "").replace(",", "").strip()
    if cleaned == "":
        return 0.0
    try:
        parsed = float(cleaned)
    except ValueError:
        st.caption(f"Invalid amount for {label}; keeping previous value.")
        return float(value or 0.0)
    return max(0.0, parsed)


def render_password_reset_page(token: str) -> None:
    """Show 'Set new password' form when user opens the reset link. On success, clear token from URL."""
    auth.init_db()
    st.title("Portfolio Management")
    st.subheader("Set new password")
    user_id, email = auth.verify_password_reset_token(token)
    if user_id is None:
        st.error("This reset link is invalid or has expired. Request a new one from the Sign in page.")
        app_url = os.environ.get("APP_URL", "http://localhost:8501").rstrip("/")
        st.markdown(f"[Back to Sign in]({app_url})")
        return
    st.caption(f"Resetting password for **{email}**. Use at least 8 characters, with uppercase, lowercase, and a digit.")
    with st.form("reset_password"):
        new_pass = st.text_input("New password", type="password", key="reset_new_password")
        confirm_pass = st.text_input("Confirm new password", type="password", key="reset_confirm_password")
        if st.form_submit_button("Update password"):
            if new_pass != confirm_pass:
                st.error("Passwords do not match.")
            else:
                ok, msg = auth.set_password_with_reset_token(token, new_pass)
                if ok:
                    st.success(msg)
                    try:
                        del st.query_params["reset"]
                    except Exception:
                        pass
                    app_url = os.environ.get("APP_URL", "http://localhost:8501").rstrip("/")
                    st.markdown(f"You can close this page or go back to [Sign in]({app_url}) to log in.")
                else:
                    st.error(msg)


def _oauth_buttons() -> list:
    """Return list of (label, auth_url_or_none) for Google, Microsoft, Facebook. URL is None if not configured."""
    out = []
    for label, url_fn in [
        ("Google", auth.oauth_google_auth_url),
        ("Microsoft", auth.oauth_microsoft_auth_url),
        ("Facebook", auth.oauth_facebook_auth_url),
    ]:
        url = url_fn() if url_fn else None
        out.append((label, url))
    return out


def render_auth_page() -> None:
    """Show sign up and login forms (email + password, and OAuth). On success set user_id and username."""
    auth.init_db()
    # Compact card for 13" screen: 50% form/social width, centred, minimal padding
    st.markdown("""
    <style>
        [data-testid="stAppViewContainer"] > section { background: #f5f5f5; padding-top: 0 !important; }
        [data-testid="block-container"] { padding-top: 0.25rem !important; padding-bottom: 0.5rem !important; max-width: 480px; margin: 0 auto; }
        [data-testid="stVerticalBlock"] > [data-testid="stVerticalBlock"] {
            background: #fff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);
            padding: 0.75rem 1.25rem; max-width: 400px; margin: 0 auto;
        }
        h1, h2, h3 { text-align: center; font-weight: 700; margin: 0 0 0.15rem 0 !important; padding: 0 !important; }
        [data-testid="stCaptionContainer"] { text-align: center; margin: 0.1rem 0 !important; }
        /* Form and inputs: 50% width, centred */
        [data-testid="stForm"] { max-width: 50%; margin-left: auto !important; margin-right: auto !important; }
        [data-testid="stForm"] input { border-radius: 8px; border: 1px solid #ddd; }
        [data-testid="stForm"] button[kind="primary"] {
            background: #2563eb !important; color: white !important; border: none !important;
            border-radius: 8px !important; width: 100% !important; font-weight: 600 !important;
        }
        [data-testid="stForm"] button[kind="primary"]:hover { background: #1d4ed8 !important; color: white !important; }
        [data-testid="stExpander"] { max-width: 50%; margin-left: auto !important; margin-right: auto !important; }
        .stMarkdown p { text-align: center; margin: 0.25rem 0 !important; }
        .auth-or-line { text-align: center; margin: 0.35rem 0; color: #666; font-size: 0.9rem; }
        /* Social section: centre the block; buttons in wrapper get 50% width via column layout */
        .auth-social-section { text-align: center; margin: 0.25rem 0; }
        .auth-social-wrapper { max-width: 50%; margin-left: auto !important; margin-right: auto !important; }
        .auth-social-wrapper .stButton > button[kind="secondary"] { border-radius: 8px; border: 1px solid #ddd; background: #fff !important; width: 100%; }
        .auth-social-wrapper .stButton { width: 100%; margin-bottom: 0.35rem; }
        .auth-terms { text-align: center; font-size: 0.7rem; color: #888; margin-top: 0.5rem; }
        .auth-terms a { color: #2563eb; text-decoration: underline; }
        .auth-account-link { text-align: center; margin: 0.15rem 0; color: #333; }
        .auth-account-link a { color: #2563eb; text-decoration: underline; }
        [data-testid="stVerticalBlock"] > div { margin-bottom: 0 !important; padding-bottom: 0.1rem; }
    </style>
    """, unsafe_allow_html=True)
    try:
        q = st.query_params
        auth_view = q.get("auth")
        if isinstance(auth_view, (list, tuple)):
            auth_view = auth_view[0] if auth_view else None
        show_create = auth_view == "create"
        show_forgot = auth_view == "forgot"
    except Exception:
        show_create = False
        show_forgot = False

    _, center_col, _ = st.columns([1, 4, 1])
    with center_col:
        st.title("My Investment Portfolio")

        oauth_buttons = _oauth_buttons()

        if show_create:
            st.caption("Password: at least 8 characters, one uppercase, one lowercase, and one digit. Special characters allowed.")
            with st.form("signup"):
                signup_email = st.text_input("Email", key="signup_email", type="default", placeholder="Email address", label_visibility="collapsed")
                signup_pass = st.text_input("Password", key="signup_password", type="password", placeholder="Password", label_visibility="collapsed")
                signup_confirm = st.text_input("Confirm password", key="signup_confirm", type="password", placeholder="Confirm password", label_visibility="collapsed")
                if st.form_submit_button("Create account"):
                    if signup_pass != signup_confirm:
                        st.error("Passwords do not match.")
                    elif not auth.validate_email(signup_email or ""):
                        st.error("Please enter a valid email address.")
                    else:
                        ok, msg, token = auth.create_user(signup_email, signup_pass)
                        if ok:
                            st.success(msg)
                            if token and not auth.smtp_configured():
                                app_url = os.environ.get("APP_URL", "http://localhost:8501").rstrip("/")
                                st.info(f"Verification link (open in this browser): {app_url}/?verify={token}")
                        else:
                            st.error(msg)
            st.markdown('<p class="auth-account-link">Already have an account? <a href="?">Sign in</a></p>', unsafe_allow_html=True)
        elif show_forgot:
            st.caption("Enter your email to receive a password reset link (or a link will be shown if email is not configured).")
            with st.form("forgot_password"):
                forgot_email = st.text_input("Email", key="forgot_email", type="default", placeholder="Email address", label_visibility="collapsed")
                if st.form_submit_button("Send reset link"):
                    ok, msg, reset_token = auth.create_password_reset_token(forgot_email)
                    if ok:
                        st.success(msg)
                        if reset_token and not auth.smtp_configured():
                            app_url = os.environ.get("APP_URL", "http://localhost:8501").rstrip("/")
                            st.info(f"Reset link (open in this browser): {app_url}/?reset={reset_token}")
                    else:
                        st.error(msg)
            st.markdown('<p class="auth-account-link"><a href="?">Back to Sign in</a></p>', unsafe_allow_html=True)
        else:
            with st.form("login"):
                login_email = st.text_input("Email", key="login_email", type="default", placeholder="Email address", label_visibility="collapsed")
                login_pass = st.text_input("Password", key="login_password", type="password", placeholder="Password", label_visibility="collapsed")
                if st.form_submit_button("Sign in"):
                    user_id = auth.verify_user(login_email, login_pass)
                    if user_id:
                        st.session_state["user_id"] = user_id
                        st.session_state["username"] = (login_email or "").strip().lower()
                        st.rerun()
                    else:
                        st.error("Invalid email or password, or email not yet verified. Check your inbox for the verification link.")
            st.markdown('<p class="auth-account-link"><a href="?auth=forgot">Forgot password?</a></p>', unsafe_allow_html=True)
            st.markdown('<p class="auth-account-link">Don\'t have an account? <a href="?auth=create">Create account</a></p>', unsafe_allow_html=True)

        # OR and Continue with on one line; social buttons below
        st.markdown('<p class="auth-or-line">OR &nbsp;&nbsp; <strong>Continue with</strong></p>', unsafe_allow_html=True)
        _, social_col, _ = st.columns([1, 2, 1])
        with social_col:
            for label, url in oauth_buttons:
                if url:
                    st.link_button(f"Continue with {label}", url, type="secondary")
                else:
                    st.button(
                        f"Continue with {label} (not configured)",
                        key=f"oauth_disabled_{label}",
                        disabled=True,
                        help=f"Set {label.upper()}_CLIENT_ID and client secret in environment. See README.",
                    )
            if not any(url for _, url in oauth_buttons):
                st.caption("Set GOOGLE_CLIENT_ID, MICROSOFT_CLIENT_ID, and/or FACEBOOK_APP_ID (and secrets) in your environment to enable these. See README.")

        st.markdown("""
        <div class="auth-terms">
            <p>By continuing, you agree to the <a href="#">Terms of Use</a></p>
            <p>Read our <a href="#">Personal Information Collection Statement</a></p>
        </div>
        """, unsafe_allow_html=True)

    return None


def main() -> None:
    st.set_page_config(
        page_title="Portfolio Management",
        page_icon="📊",
        layout="wide",
    )

    auth.init_db()

    # Handle email verification link (e.g. ?verify=TOKEN)
    try:
        q = st.query_params
        verify_token = q.get("verify")
        if verify_token and isinstance(verify_token, (list, tuple)):
            verify_token = verify_token[0] if verify_token else None
        if verify_token:
            uid, email = auth.verify_email_token(verify_token)
            if uid is not None:
                st.success(f"Email verified for {email}. You can sign in now.")
                try:
                    del st.query_params["verify"]
                except Exception:
                    pass
            else:
                st.error("Invalid or expired verification link.")
        # Handle OAuth callback (?code=...&state=google|microsoft|facebook)
        code = q.get("code")
        state = q.get("state")
        if code and state:
            if isinstance(code, (list, tuple)):
                code = code[0] if code else None
            if isinstance(state, (list, tuple)):
                state = state[0] if state else None
            if code and state:
                provider = (state.lower() if isinstance(state, str) else "") or ""
                info = None
                if provider == "google":
                    info = auth.oauth_exchange_google(code)
                elif provider == "microsoft":
                    info = auth.oauth_exchange_microsoft(code)
                elif provider == "facebook":
                    info = auth.oauth_exchange_facebook(code)
                if info and info.get("email"):
                    user_id = auth.get_or_create_oauth_user(provider, info["email"], info.get("name"))
                    if user_id:
                        st.session_state["user_id"] = user_id
                        st.session_state["username"] = info["email"].strip().lower()
                        try:
                            st.query_params.clear()
                        except Exception:
                            pass
                        st.rerun()
                    else:
                        st.error("Could not sign you in with this account.")
                else:
                    st.error("Could not get your email from the provider.")
                try:
                    st.query_params.clear()
                except Exception:
                    pass
    except Exception:
        pass

    # Require login
    if st.session_state.get("user_id") is None:
        # Handle password reset link (e.g. ?reset=TOKEN)
        try:
            q = st.query_params
            reset_token = q.get("reset")
            if reset_token and isinstance(reset_token, (list, tuple)):
                reset_token = reset_token[0] if reset_token else None
            if reset_token:
                render_password_reset_page(reset_token)
                return
        except Exception:
            pass
        render_auth_page()
        return

    # Logout in sidebar
    st.sidebar.caption(f"Signed in as **{st.session_state.get('username', '')}**")
    if st.sidebar.button("Sign out"):
        keys_to_clear = ["user_id", "username", "full_portfolio", "selected_entity"]
        for k in list(st.session_state.keys()):
            if k.startswith("portfolio_table_") or k.startswith("portfolio_editor_"):
                keys_to_clear.append(k)
        for key in keys_to_clear:
            st.session_state.pop(key, None)
        st.rerun()

    user_id = st.session_state["user_id"]
    if "full_portfolio" not in st.session_state:
        st.session_state["full_portfolio"] = auth.load_full_portfolio(user_id)
    full_portfolio = st.session_state["full_portfolio"]

    # --- Sidebar: Configuration & data sources ---
    st.sidebar.header("Configuration")
    st.sidebar.markdown("**Data sources**")
    st.sidebar.caption(f"• **Precious metals spot:** [ABC Bullion]({ABC_BULLION_URL})")
    st.sidebar.caption(f"• **Real estate market value:** [realestate.com.au]({REALESTATE_COM_AU_BASE})")
    st.sidebar.markdown("---")
    st.sidebar.markdown("**Spot prices (AUD per troy ounce)**")
    fetched_gold, fetched_silver, fetch_warning = fetch_spot_prices_from_abc_bullion()
    effective_gold_price = fetched_gold if fetched_gold is not None else DEFAULT_GOLD_PRICE_AUD_PER_OZ
    effective_silver_price = fetched_silver if fetched_silver is not None else DEFAULT_SILVER_PRICE_AUD_PER_OZ
    gold_price = st.sidebar.number_input("Gold spot price (AUD/oz)", min_value=0.0, value=float(effective_gold_price), step=1.0)
    silver_price = st.sidebar.number_input("Silver spot price (AUD/oz)", min_value=0.0, value=float(effective_silver_price), step=0.1)
    st.sidebar.caption("From ABC Bullion. Override if needed.")
    if fetch_warning:
        st.sidebar.warning(fetch_warning)
    st.sidebar.markdown("---")
    google_api_key = st.sidebar.text_input(
        "Google Places API key (optional)",
        value=os.environ.get("GOOGLE_PLACES_API_KEY", ""),
        type="password",
        help="Enables address autocomplete in Real Estate. Get a key from Google Cloud (Places API).",
    )
    if google_api_key:
        st.sidebar.caption("Address suggestions enabled for Real Estate.")

    # --- Entity selector ---
    if "selected_entity" not in st.session_state:
        st.session_state["selected_entity"] = "individual"
    selected_entity = st.session_state["selected_entity"]
    entity_choice = st.radio(
        "Entity",
        options=list(ENTITY_LABELS.keys()),
        format_func=lambda x: ENTITY_LABELS[x],
        key="entity_selector",
        horizontal=True,
    )
    if entity_choice != selected_entity:
        st.session_state["selected_entity"] = entity_choice
        for k in list(st.session_state.keys()):
            if k.startswith("portfolio_table_") or k.startswith("portfolio_editor_"):
                st.session_state.pop(k, None)
        st.rerun()
    selected_entity = st.session_state["selected_entity"]

    # --- Portfolio value summary (per entity + consolidated) ---
    entity_values = {
        eid: compute_entity_portfolio_value(full_portfolio, eid, gold_price, silver_price)
        for eid in auth.ENTITY_IDS
    }
    total_consolidated = sum(entity_values.values())
    st.subheader("Portfolio value")
    cols = st.columns(4)
    for i, eid in enumerate(auth.ENTITY_IDS):
        cols[i].metric(f"{ENTITY_LABELS[eid]} – Portfolio value", f"A$ {entity_values[eid]:,.2f}")
    st.metric("**Total portfolio value (all entities)**", f"A$ {total_consolidated:,.2f}")

    st.title("Portfolio Management")
    st.caption(f"Managing **{ENTITY_LABELS[selected_entity]}**. Add or edit Precious Metals, Real Estate, and Other Assets below.")

    tab_pm, tab_re, tab_oa = st.tabs(["Precious Metals", "Real Estate", "Other Assets"])

    with tab_pm:
        _render_precious_metals_tab(st.session_state["full_portfolio"], selected_entity, user_id, gold_price, silver_price)

    with tab_re:
        _render_real_estate_tab(st.session_state["full_portfolio"], selected_entity, user_id, google_api_key)

    with tab_oa:
        _render_other_assets_tab(st.session_state["full_portfolio"], selected_entity, user_id)

    auth.save_full_portfolio(user_id, st.session_state["full_portfolio"])


def _render_precious_metals_tab(
    full_portfolio: dict,
    entity_id: str,
    user_id: int,
    gold_price: float,
    silver_price: float,
) -> None:
    metal_col = METAL_COLUMN
    ounces_col = OUNCES_COLUMN
    skey_table = f"portfolio_table_{entity_id}"
    skey_editor = f"portfolio_editor_{entity_id}"

    if skey_table not in st.session_state:
        loaded = load_metals_for_entity(full_portfolio, entity_id)
        st.session_state[skey_table] = loaded if loaded is not None and len(loaded) > 0 else _default_empty_table()

    base = st.session_state[skey_table].copy()
    if skey_editor in st.session_state:
        raw = st.session_state[skey_editor]
        if isinstance(raw, dict) and any(k in raw for k in ("edited_rows", "added_rows", "deleted_rows")):
            base = _apply_data_editor_delta(base, raw)

    base[UNITS_COLUMN] = pd.to_numeric(base[UNITS_COLUMN], errors="coerce").fillna(0.0)
    base[OZ_PER_UNIT_COLUMN] = pd.to_numeric(base[OZ_PER_UNIT_COLUMN], errors="coerce").fillna(0.0)
    if OUNCES_COLUMN not in base.columns:
        base[OUNCES_COLUMN] = 0.0
    if "Spot Value" not in base.columns:
        base["Spot Value"] = 0.0
    base[OUNCES_COLUMN] = base.apply(
        lambda row: total_ounces_for_row(row, UNITS_COLUMN, OZ_PER_UNIT_COLUMN),
        axis=1,
    )
    base["Spot Value"] = base.apply(
        lambda row: spot_value_for_row(row, metal_col, ounces_col, gold_price, silver_price),
        axis=1,
    )
    base = base.reset_index(drop=True)
    base.index = range(1, len(base) + 1)
    df_edit_base = base

    edited_df = st.data_editor(
        df_edit_base,
        num_rows="dynamic",
        key=skey_editor,
        disabled=["Spot Value", OUNCES_COLUMN],
        column_config={
            METAL_COLUMN: st.column_config.SelectboxColumn("Category", options=["Gold", "Silver", "Platinum"], required=False),
            UNITS_COLUMN: st.column_config.NumberColumn("Units", min_value=0.0, step=1.0),
            OZ_PER_UNIT_COLUMN: st.column_config.NumberColumn("Oz/unit", min_value=0.0, step=0.01),
        },
        use_container_width=True,
    )

    if not isinstance(edited_df, pd.DataFrame):
        edited_df = df_edit_base.copy()
    edited_df = edited_df.reset_index(drop=True)
    edited_df[UNITS_COLUMN] = pd.to_numeric(edited_df[UNITS_COLUMN], errors="coerce").fillna(0.0)
    edited_df[OZ_PER_UNIT_COLUMN] = pd.to_numeric(edited_df[OZ_PER_UNIT_COLUMN], errors="coerce").fillna(0.0)
    edited_df[OUNCES_COLUMN] = edited_df.apply(
        lambda row: total_ounces_for_row(row, UNITS_COLUMN, OZ_PER_UNIT_COLUMN),
        axis=1,
    )
    edited_df["Spot Value"] = edited_df.apply(
        lambda row: spot_value_for_row(row, metal_col, ounces_col, gold_price, silver_price),
        axis=1,
    )
    to_persist = edited_df.copy().reset_index(drop=True)
    st.session_state[skey_table] = to_persist
    updated = save_metals_for_entity(st.session_state["full_portfolio"], entity_id, to_persist)
    st.session_state["full_portfolio"] = updated

    if st.button("Export to Excel", key=f"export_pm_{entity_id}"):
        try:
            to_persist.to_excel(EXPORT_EXCEL_PATH, index=False)
            st.success(f"Exported to {EXPORT_EXCEL_PATH.name}.")
        except Exception as exc:
            st.error(str(exc))

    df_working = to_persist.copy()
    df_working["Metal Class"] = df_working[metal_col].map(classify_metal)
    df_valid = df_working.dropna(subset=["Metal Class"])
    if not df_valid.empty:
        df_valid[ounces_col] = pd.to_numeric(df_valid[ounces_col], errors="coerce")
        df_valid = df_valid.dropna(subset=[ounces_col])
    if df_valid.empty:
        st.caption("Add rows with Category (Gold/Silver) and Units / Oz/unit to see summary.")
        return
    ounces_by_metal = df_valid.groupby("Metal Class")[ounces_col].sum().reindex(["Gold", "Silver"]).fillna(0.0)
    gold_ounces = float(ounces_by_metal.get("Gold", 0.0))
    silver_ounces = float(ounces_by_metal.get("Silver", 0.0))
    gold_value_aud = gold_ounces * gold_price
    silver_value_aud = silver_ounces * silver_price
    total_value_aud = gold_value_aud + silver_value_aud
    st.subheader("Precious metals summary (AUD)")
    c1, c2, c3 = st.columns(3)
    c1.metric("Gold ounces", f"{gold_ounces:,.4f} oz")
    c2.metric("Silver ounces", f"{silver_ounces:,.4f} oz")
    c3.metric("Total metals value", f"A$ {total_value_aud:,.2f}")
    chart_df = pd.DataFrame({"Metal": ["Gold", "Silver"], "Ounces": [gold_ounces, silver_ounces], "Value (AUD)": [gold_value_aud, silver_value_aud]})
    fig = px.pie(chart_df, values="Value (AUD)", names="Metal", color="Metal", color_discrete_map={"Gold": "#D4AF37", "Silver": "#C0C0C0"})
    fig.update_layout(height=280, margin=dict(t=20, b=20, l=20, r=20))
    st.plotly_chart(fig, use_container_width=True)


def _render_real_estate_tab(full_portfolio: dict, entity_id: str, user_id: int, google_api_key: Optional[str] = None) -> None:
    props = list((full_portfolio.get("entities") or {}).get(entity_id, {}).get("real_estate") or [])
    st.subheader("Real Estate")
    st.caption("Add properties. Net equity = Market value − Mortgage loan. Weekly income = Rental income − Expenses (for investments).")
    # Session state for address suggestions (show selectbox for this property)
    suggest_key = "re_addr_suggestions"
    suggest_for_key = "re_addr_suggestions_for"
    fetch_msg_key = "re_fetch_msg"
    fetch_msg_for_key = "re_fetch_msg_for"
    to_remove = None
    for i, p in enumerate(props):
        mv = float(p.get("market_value") or 0)
        loan = float(p.get("mortgage_loan_amount") or 0)
        occ = p.get("occupancy") or ""
        rent = float(p.get("rental_income_week") or 0)
        addr_display = (p.get("address") or "No address")
        if len(addr_display) > 50:
            addr_display = addr_display[:47] + "..."
        with st.expander(f"Property: {addr_display}"):
            addr_new = st.text_input("Address", value=p.get("address") or "", key=f"re_addr_{entity_id}_{i}")
            # Google address suggestions
            if google_api_key:
                if st.button("Get address suggestions", key=f"re_suggest_btn_{entity_id}_{i}"):
                    current_addr = st.session_state.get(f"re_addr_{entity_id}_{i}", addr_new) or ""
                    suggestions, err = fetch_google_place_suggestions(current_addr, google_api_key)
                    if err:
                        st.session_state[fetch_msg_key] = ("error", err)
                        st.session_state[fetch_msg_for_key] = (entity_id, i)
                    elif suggestions:
                        st.session_state[suggest_key] = suggestions
                        st.session_state[suggest_for_key] = (entity_id, i)
                        st.rerun()
                    else:
                        st.session_state[fetch_msg_key] = ("info", "No suggestions found. Try typing more of the address.")
                        st.session_state[fetch_msg_for_key] = (entity_id, i)
                        st.rerun()
                if st.session_state.get(suggest_for_key) == (entity_id, i):
                    suggestions_list = st.session_state.get(suggest_key, [])
                    if suggestions_list:
                        selected = st.selectbox("Choose an address", options=suggestions_list, key=f"re_suggest_select_{entity_id}_{i}")
                        if st.button("Use this address", key=f"re_use_addr_{entity_id}_{i}"):
                            props[i]["address"] = selected
                            for k in (suggest_key, suggest_for_key):
                                st.session_state.pop(k, None)
                            data = dict(st.session_state.get("full_portfolio", full_portfolio))
                            if "entities" not in data:
                                data["entities"] = {e: dict(auth.DEFAULT_ENTITY_BLOB) for e in auth.ENTITY_IDS}
                            data["entities"][entity_id]["real_estate"] = props
                            st.session_state["full_portfolio"] = data
                            st.rerun()
            if st.session_state.get(fetch_msg_for_key) == (entity_id, i) and st.session_state.get(fetch_msg_key):
                msg_type, msg_text = st.session_state[fetch_msg_key]
                if msg_type == "error":
                    st.error(msg_text)
                elif msg_type == "success":
                    st.success(msg_text)
                else:
                    st.info(msg_text)
                st.session_state.pop(fetch_msg_key, None)
                st.session_state.pop(fetch_msg_for_key, None)
            c1, c2 = st.columns(2)
            mv_new = _currency_text_input("Market value (AUD)", mv, key=f"re_mv_{entity_id}_{i}_txt")
            if c1.button("Fetch from realestate.com.au", key=f"re_fetch_mv_{entity_id}_{i}"):
                current_addr = st.session_state.get(f"re_addr_{entity_id}_{i}", addr_new) or ""
                val, err = fetch_market_value_realestate_com_au(current_addr)
                if err:
                    st.session_state[fetch_msg_key] = ("error", err)
                    st.session_state[fetch_msg_for_key] = (entity_id, i)
                    st.rerun()
                elif val is not None:
                    props[i]["market_value"] = val
                    st.session_state.pop(f"re_mv_{entity_id}_{i}_txt", None)
                    data = dict(st.session_state.get("full_portfolio", full_portfolio))
                    if "entities" not in data:
                        data["entities"] = {e: dict(auth.DEFAULT_ENTITY_BLOB) for e in auth.ENTITY_IDS}
                    data["entities"][entity_id]["real_estate"] = props
                    st.session_state["full_portfolio"] = data
                    st.session_state[fetch_msg_key] = ("success", f"Fetched market value: A$ {val:,.0f}. You can adjust above if needed.")
                    st.session_state[fetch_msg_for_key] = (entity_id, i)
                    st.rerun()
            occ_new = c2.selectbox("Occupancy", options=["", "Investment", "Owner occupied"], index=["", "Investment", "Owner occupied"].index(occ) if occ in ("Investment", "Owner occupied") else 0, key=f"re_occ_{entity_id}_{i}")
            exp_mo_existing = float(p.get("estimated_monthly_expenses") or 0)
            if exp_mo_existing <= 0 and float(p.get("expenses_week") or 0) > 0:
                exp_mo_existing = float(p.get("expenses_week") or 0) * 52.0 / 12.0
            if occ_new == "Investment":
                r_new = _currency_text_input("Weekly rental income (AUD)", rent, key=f"re_rent_{entity_id}_{i}_txt")
                e_mo_new = _currency_text_input(
                    "Estimated monthly expenses (AUD)",
                    exp_mo_existing,
                    key=f"re_exp_mo_{entity_id}_{i}_txt",
                )
                e_default_mo = r_new * 0.2 * 52.0 / 12.0
                if e_mo_new <= 0 and e_default_mo > 0:
                    e_mo_new = e_default_mo
                e_new = e_mo_new * 12.0 / 52.0 if e_mo_new > 0 else 0.0
                st.caption(f"Weekly net (rent − weekly share of expenses): A$ {r_new - e_new:,.2f}")
            else:
                r_new, e_new = 0.0, 0.0
                e_mo_new = 0.0
            loan_new = _currency_text_input("Mortgage loan amount (AUD)", loan, key=f"re_loan_{entity_id}_{i}_txt")
            repay_new = _currency_text_input(
                "Mortgage monthly repayment (AUD)",
                float(p.get("mortgage_monthly_repayment") or 0),
                key=f"re_repay_{entity_id}_{i}_txt",
            )
            rate_new = st.number_input(
                "Home loan interest rate (%)",
                min_value=0.0,
                max_value=100.0,
                value=float(p.get("home_loan_interest_rate_percent") or 0.0),
                step=0.01,
                format="%.2f",
                key=f"re_rate_{entity_id}_{i}",
            )
            col_u1, col_u2 = st.columns(2)
            with col_u1:
                url_new = st.text_input(
                    "Listing URL (optional)",
                    value=p.get("property_url") or "",
                    key=f"re_url_{entity_id}_{i}",
                    help="Reference only; paste a listing link. Not scraped.",
                )
            with col_u2:
                paste_new = st.text_area(
                    "Estimate from listing (paste)",
                    value=p.get("estimate_paste") or "",
                    height=100,
                    key=f"re_paste_{entity_id}_{i}",
                    help="Paste estimate text or numbers from the site. Reference only; not used in calculations.",
                )
            st.metric("Net equity", f"A$ {max(0, mv_new - loan_new):,.2f}")
            if st.button("Remove property", key=f"re_remove_{entity_id}_{i}"):
                to_remove = i
            else:
                props[i] = {
                    "address": addr_new,
                    "property_url": url_new,
                    "estimate_paste": paste_new,
                    "market_value": mv_new,
                    "occupancy": occ_new,
                    "home_loan_interest_rate_percent": rate_new,
                    "rental_income_week": r_new,
                    "expenses_week": e_new,
                    "estimated_monthly_expenses": e_mo_new if occ_new == "Investment" else 0.0,
                    "mortgage_loan_amount": loan_new,
                    "mortgage_monthly_repayment": repay_new,
                }
    if to_remove is not None:
        props.pop(to_remove)
        data = dict(full_portfolio)
        if "entities" not in data:
            data["entities"] = {e: dict(auth.DEFAULT_ENTITY_BLOB) for e in auth.ENTITY_IDS}
        data["entities"][entity_id]["real_estate"] = props
        st.session_state["full_portfolio"] = data
        st.rerun()
    # Persist current props (updated from widgets)
    data = dict(full_portfolio)
    if "entities" not in data:
        data["entities"] = {e: dict(auth.DEFAULT_ENTITY_BLOB) for e in auth.ENTITY_IDS}
    data["entities"][entity_id]["real_estate"] = props
    st.session_state["full_portfolio"] = data
    if st.button("Add property", key=f"re_add_{entity_id}"):
        data = dict(st.session_state.get("full_portfolio", full_portfolio))
        if "entities" not in data:
            data["entities"] = {e: dict(auth.DEFAULT_ENTITY_BLOB) for e in auth.ENTITY_IDS}
        if entity_id not in data["entities"]:
            data["entities"][entity_id] = dict(auth.DEFAULT_ENTITY_BLOB)
        data["entities"][entity_id].setdefault("real_estate", [])
        data["entities"][entity_id]["real_estate"].append({
            "address": "",
            "property_url": "",
            "estimate_paste": "",
            "market_value": 0.0,
            "occupancy": "",
            "home_loan_interest_rate_percent": 0.0,
            "rental_income_week": 0.0,
            "expenses_week": 0.0,
            "estimated_monthly_expenses": 0.0,
            "mortgage_loan_amount": 0.0,
            "mortgage_monthly_repayment": 0.0,
        })
        st.session_state["full_portfolio"] = data
        st.rerun()


def _render_other_assets_tab(full_portfolio: dict, entity_id: str, user_id: int) -> None:
    assets = list((full_portfolio.get("entities") or {}).get(entity_id, {}).get("other_assets") or [])
    st.subheader("Other Assets")
    st.caption("Asset type, optional description, and market value.")
    ASSET_TYPES = ["Managed Funds", "Cash", "Jewellery", "Direct Shares", "Other"]
    for i, a in enumerate(assets):
        with st.expander(f"{a.get('asset_type') or 'Asset'} – A$ {float(a.get('market_value') or 0):,.2f}"):
            t = st.selectbox("Asset type", options=ASSET_TYPES, index=ASSET_TYPES.index(a.get("asset_type") or "Managed Funds") if (a.get("asset_type") or "") in ASSET_TYPES else 0, key=f"oa_type_{entity_id}_{i}")
            d = st.text_input("Description", value=a.get("description") or "", key=f"oa_desc_{entity_id}_{i}")
            v = _currency_text_input("Market value (AUD)", float(a.get("market_value") or 0), key=f"oa_mv_{entity_id}_{i}_txt")
            if st.button("Remove", key=f"oa_remove_{entity_id}_{i}"):
                assets.pop(i)
                data = dict(full_portfolio)
                if "entities" not in data:
                    data["entities"] = {e: dict(auth.DEFAULT_ENTITY_BLOB) for e in auth.ENTITY_IDS}
                data["entities"][entity_id]["other_assets"] = assets
                st.session_state["full_portfolio"] = data
                st.rerun()
            else:
                if i < len(assets):
                    assets[i] = {"asset_type": t, "description": d, "market_value": v}
    if st.button("Add asset", key=f"oa_add_{entity_id}"):
        data = dict(full_portfolio)
        if "entities" not in data:
            data["entities"] = {e: dict(auth.DEFAULT_ENTITY_BLOB) for e in auth.ENTITY_IDS}
        data["entities"][entity_id].setdefault("other_assets", [])
        data["entities"][entity_id]["other_assets"].append({"asset_type": "Managed Funds", "description": "", "market_value": 0.0})
        st.session_state["full_portfolio"] = data
        st.rerun()
    data = dict(full_portfolio)
    if "entities" not in data:
        data["entities"] = {e: dict(auth.DEFAULT_ENTITY_BLOB) for e in auth.ENTITY_IDS}
    data["entities"][entity_id]["other_assets"] = assets
    st.session_state["full_portfolio"] = data


if __name__ == "__main__":
    main()

