# Portfolio Management App

A Streamlit app to manage your **portfolio** across entities (Individual, SMSF, Family Trust) and asset classes: **Precious Metals**, **Real Estate**, and **Other Assets**.

## Vercel rewrite (Next.js)

A Vercel-compatible core rewrite is now included in this repo using **Next.js + Vercel Postgres**.

- App entry: `app/page.tsx`
- Auth pages: `app/login/page.tsx`, `app/signup/page.tsx`
- APIs: `app/api/auth/*`, `app/api/portfolio/route.ts`, `app/api/spot/route.ts`
- Database helpers: `lib/db.ts`
- Session cookies (JWT): `lib/auth.ts`

### Environment variables (Vercel)

Set these in your Vercel project:

- `POSTGRES_URL` (automatically added when you attach Vercel Postgres)
- `JWT_SECRET` (long random string, e.g. 32+ chars)

### Local run (Next.js app)

```bash
cd "/Users/kevinkuy/Personal/Cursor Projects"
npm install
npm run dev
```

Open `http://localhost:3000`.

**Local database:** If `POSTGRES_URL` is not set, the app uses **`portfolio_next.sqlite`** in the project folder (no Vercel Postgres required for local sign-up).

**Optional for local:** Create `.env.local` and set a strong `JWT_SECRET` (recommended). If omitted in development, a built-in dev secret is used.

### Deploy to Vercel

1. Push this repo to GitHub.
2. In Vercel, **New Project** -> import this GitHub repo.
3. Add **Vercel Postgres** from the Storage tab.
4. Add `JWT_SECRET` in Project Settings -> Environment Variables.
5. Deploy.

### Custom subdomain on gritable.com.au (Crazy Domains)

Example target: `portfolio.gritable.com.au`

1. In Vercel project -> **Domains** -> add `portfolio.gritable.com.au`.
2. Vercel will show a DNS record to add (usually CNAME).
3. In Crazy Domains DNS, add:
   - Host: `portfolio`
   - Type: `CNAME`
   - Value: value provided by Vercel (often `cname.vercel-dns.com`)
4. Wait for propagation, then click **Verify** in Vercel.

## Features

- **Precious metals:** Track gold/silver/platinum with live spot prices from [ABC Bullion](https://www.abcbullion.com.au/), editable table, and value breakdown.
- **Real estate:** Add properties with address (optional Google Places autocomplete), market value (optional fetch from [realestate.com.au](https://www.realestate.com.au)), occupancy, rental/expenses, mortgage; net equity and weekly income are calculated.
- **Other assets:** Managed funds, cash, jewellery, direct shares, or other with description and market value.
- **Portfolio value:** Per-entity and consolidated total (market values minus mortgages where applicable).
- **Auth:** Sign in with **email** and password, or with **Google**, **Microsoft**, or **Facebook**. Email sign-ups must verify their address before signing in (verification email or in-app link if SMTP is not configured).

## Login and sign-up

- **Identity:** Log in with your **email** (no separate username).
- **Password (email sign-up):** At least 8 characters, with at least one uppercase letter, one lowercase letter, and one digit. Special characters are allowed but not required.
- **Email verification:** After signing up with email, you must verify your address via the link sent by email (or the link shown in the app if SMTP is not set). Until then, sign-in is disabled for that account.
- **Password reset:** On the Sign in tab, use **Forgot password?** and enter your email. You'll receive a reset link by email (or see it in the app if SMTP is not set). The link expires in 24 hours. The new password must meet the same rules (8+ chars, upper, lower, digit).
- **Social sign-in:** If the app is configured with OAuth client IDs/secrets, you can use “Sign in with Google”, “Sign in with Microsoft”, or “Sign in with Facebook” instead of (or in addition to) email.

## Data sources (Configuration)

- **Precious metals spot prices:** ABC Bullion (scraped on load; override in sidebar).
- **Real estate market value:** realestate.com.au (optional “Fetch from realestate.com.au” in Real Estate tab; manual override always available).
- **Address suggestions:** Optional Google Places API key in sidebar (enables “Get address suggestions” in Real Estate).

## Requirements

```bash
cd "/Users/kevinkuy/Personal/Cursor Projects"
python3 -m pip install -r requirements.txt
```

## Running the app

```bash
cd "/Users/kevinkuy/Personal/Cursor Projects"
python3 -m streamlit run portfolio_dashboard.py
```

Or use the run script:

```bash
./run_portfolio_dashboard.sh
```

The app opens at a URL like `http://localhost:8501`. Refresh the page to reload spot prices and data.

## Optional: Email verification (SMTP)

To send verification emails when users sign up with email, set:

- `SMTP_HOST` – e.g. `smtp.gmail.com`
- `SMTP_PORT` – e.g. `587`
- `SMTP_USER` – your SMTP username
- `SMTP_PASSWORD` – your SMTP password or app password
- `FROM_EMAIL` – sender address (defaults to `SMTP_USER`)
- `APP_URL` – base URL of the app (e.g. `http://localhost:8501` or your production URL), used in the verification link

Without these, new users see a verification link in the app to copy and open.

## Optional: OAuth (Google, Microsoft, Facebook)

Set the following so “Sign in with Google/Microsoft/Facebook” works:

- **APP_URL** – e.g. `http://localhost:8501` (must match the redirect URI registered with each provider).
- **Google:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (from [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials → OAuth 2.0 Client ID). Redirect URI: `APP_URL/`
- **Microsoft:** `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` (from [Azure Portal](https://portal.azure.com/) → App registrations). Redirect URI: `APP_URL/`
- **Facebook:** `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` (from [Facebook for Developers](https://developers.facebook.com/)). Redirect URI: `APP_URL/`

## Optional: Google Places API

For address autocomplete in Real Estate:

1. Create a project in [Google Cloud Console](https://console.cloud.google.com/) and enable the **Places API (New)**.
2. Create an API key and (optionally) restrict it to Places API.
3. Enter the key in the sidebar under **Configuration**, or set the environment variable `GOOGLE_PLACES_API_KEY`.

## Database and export

- User and portfolio data are stored in `portfolio_app.db` in the project directory.
- Precious metals can be exported to Excel from the Precious Metals tab (saved as `precious_metals_export.xlsx` in the project directory).
