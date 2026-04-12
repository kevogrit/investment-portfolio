"""
Authentication and per-user portfolio storage using SQLite and bcrypt.
Uses email as identity; supports email verification and OAuth (Google, Microsoft, Facebook).
"""
import json
import os
import re
import secrets
import smtplib
import sqlite3
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from typing import Any, Dict, Optional, Tuple
from urllib.parse import urlencode

import bcrypt
import requests

DB_PATH = Path(__file__).resolve().parent / "portfolio_app.db"

ENTITY_IDS = ("individual", "smsf", "family_trust")
DEFAULT_ENTITY_BLOB = {
    "precious_metals": None,
    "real_estate": [],
    "other_assets": [],
}

# Simple email format check
EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")


def _default_portfolio_structure() -> Dict[str, Any]:
    """Full portfolio structure with all entities and asset classes."""
    return {
        "entities": {
            eid: dict(DEFAULT_ENTITY_BLOB) for eid in ENTITY_IDS
        }
    }


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


# Password reset token valid for 24 hours
RESET_TOKEN_EXPIRY_SECONDS = 24 * 60 * 60


def _ensure_users_columns(conn: sqlite3.Connection) -> None:
    """Add email_verified, verification_token, auth_provider, password_reset_* if missing (migration)."""
    cur = conn.execute("PRAGMA table_info(users)")
    cols = {row[1] for row in cur.fetchall()}
    if "email_verified" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 1")
    if "verification_token" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN verification_token TEXT")
    if "auth_provider" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN auth_provider TEXT DEFAULT 'email'")
    if "password_reset_token" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN password_reset_token TEXT")
    if "password_reset_token_created_at" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN password_reset_token_created_at TEXT")
    conn.commit()


def init_db() -> None:
    """Create users and portfolios tables if they don't exist; migrate user columns."""
    conn = _get_conn()
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now'))
            )
            """
        )
        _ensure_users_columns(conn)
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS portfolios (
                user_id INTEGER PRIMARY KEY,
                data_json TEXT NOT NULL,
                updated_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
            """
        )
        conn.commit()
    finally:
        conn.close()


def validate_email(email: str) -> bool:
    """Return True if string looks like a valid email."""
    return bool(email and EMAIL_RE.match(email.strip()))


def validate_password(password: str) -> Tuple[bool, str]:
    """
    Password: min 8 chars, at least one upper, one lower, one digit.
    Returns (valid, error_message).
    """
    if not password or len(password) < 8:
        return False, "Password must be at least 8 characters."
    if not re.search(r"[A-Z]", password):
        return False, "Password must include at least one uppercase letter."
    if not re.search(r"[a-z]", password):
        return False, "Password must include at least one lowercase letter."
    if not re.search(r"\d", password):
        return False, "Password must include at least one digit."
    return True, ""


def create_user(email: str, password: str) -> Tuple[bool, str, Optional[str]]:
    """
    Register a new user (email + password). User must verify email before signing in.
    Returns (success, message, verification_token).
    """
    email = (email or "").strip().lower()
    if not email:
        return False, "Email is required.", None
    if not validate_email(email):
        return False, "Please enter a valid email address.", None
    ok, err = validate_password(password)
    if not ok:
        return False, err, None
    try:
        password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    except Exception:
        return False, "Could not hash password.", None
    token = secrets.token_urlsafe(32)
    conn = _get_conn()
    try:
        conn.execute(
            """
            INSERT INTO users (username, password_hash, email_verified, verification_token, auth_provider)
            VALUES (?, ?, 0, ?, 'email')
            """,
            (email, password_hash, token),
        )
        conn.commit()
        send_verification_email(email, token)
        return True, (
            "Account created. Check your email to verify your address before signing in."
            if _smtp_configured()
            else "Account created. Verification email not configured; use the link below to verify."
        ), token
    except sqlite3.IntegrityError:
        return False, "An account with this email already exists.", None
    except Exception as e:
        return False, str(e), None
    finally:
        conn.close()


def _smtp_configured() -> bool:
    return bool(
        os.environ.get("SMTP_HOST")
        and os.environ.get("SMTP_USER")
        and os.environ.get("SMTP_PASSWORD")
    )


def smtp_configured() -> bool:
    """Public check for whether verification emails can be sent."""
    return _smtp_configured()


def send_verification_email(to_email: str, token: str) -> bool:
    """Send verification email. Returns True if sent, False if SMTP not configured or error."""
    app_url = os.environ.get("APP_URL", "http://localhost:8501").rstrip("/")
    verify_url = f"{app_url}/?verify={token}"
    if not _smtp_configured():
        return False
    host = os.environ.get("SMTP_HOST", "")
    port = int(os.environ.get("SMTP_PORT", "587"))
    user = os.environ.get("SMTP_USER", "")
    password = os.environ.get("SMTP_PASSWORD", "")
    from_addr = os.environ.get("FROM_EMAIL", user)
    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Verify your email - Portfolio Management"
    msg["From"] = from_addr
    msg["To"] = to_email
    body = f"""Please verify your email by opening this link:\n\n{verify_url}\n\nIf you did not sign up, ignore this email."""
    msg.attach(MIMEText(body, "plain"))
    try:
        with smtplib.SMTP(host, port) as s:
            s.starttls()
            s.login(user, password)
            s.sendmail(from_addr, [to_email], msg.as_string())
        return True
    except Exception:
        return False


def verify_email_token(token: str) -> Tuple[Optional[int], Optional[str]]:
    """Mark user verified for this token. Returns (user_id, email) or (None, None)."""
    if not token:
        return None, None
    conn = _get_conn()
    try:
        row = conn.execute(
            "SELECT id, username FROM users WHERE verification_token = ? AND auth_provider = 'email'",
            (token,),
        ).fetchone()
        if not row:
            return None, None
        conn.execute(
            "UPDATE users SET email_verified = 1, verification_token = NULL WHERE id = ?",
            (row["id"],),
        )
        conn.commit()
        return row["id"], row["username"]
    finally:
        conn.close()


def create_password_reset_token(email: str) -> Tuple[bool, str, Optional[str]]:
    """
    Create a password reset token for the given email (email-auth users only).
    Returns (success, message, token). Token is None if SMTP will send the link.
    """
    email = (email or "").strip().lower()
    if not email or not validate_email(email):
        return False, "Please enter a valid email address.", None
    conn = _get_conn()
    try:
        row = conn.execute(
            "SELECT id FROM users WHERE username = ? AND auth_provider = 'email'",
            (email,),
        ).fetchone()
        if not row:
            # Don't reveal whether email exists
            return True, "If an account exists for that email, you will receive a password reset link.", None
        token = secrets.token_urlsafe(32)
        conn.execute(
            """
            UPDATE users SET password_reset_token = ?, password_reset_token_created_at = datetime('now')
            WHERE id = ?
            """,
            (token, row["id"]),
        )
        conn.commit()
        send_password_reset_email(email, token)
        return True, (
            "If an account exists for that email, you will receive a password reset link."
            if _smtp_configured()
            else "Use the link below to reset your password."
        ), token
    except Exception:
        return False, "Something went wrong. Please try again.", None
    finally:
        conn.close()


def send_password_reset_email(to_email: str, token: str) -> bool:
    """Send password reset email. Returns True if sent."""
    app_url = os.environ.get("APP_URL", "http://localhost:8501").rstrip("/")
    reset_url = f"{app_url}/?reset={token}"
    if not _smtp_configured():
        return False
    host = os.environ.get("SMTP_HOST", "")
    port = int(os.environ.get("SMTP_PORT", "587"))
    user = os.environ.get("SMTP_USER", "")
    password = os.environ.get("SMTP_PASSWORD", "")
    from_addr = os.environ.get("FROM_EMAIL", user)
    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Reset your password - Portfolio Management"
    msg["From"] = from_addr
    msg["To"] = to_email
    body = f"""You requested a password reset. Open this link to set a new password:\n\n{reset_url}\n\nThe link expires in 24 hours.\n\nIf you did not request this, ignore this email."""
    msg.attach(MIMEText(body, "plain"))
    try:
        with smtplib.SMTP(host, port) as s:
            s.starttls()
            s.login(user, password)
            s.sendmail(from_addr, [to_email], msg.as_string())
        return True
    except Exception:
        return False


def verify_password_reset_token(token: str) -> Tuple[Optional[int], Optional[str]]:
    """
    Return (user_id, email) if token is valid and not expired (24h), else (None, None).
    Does not consume the token; use set_password_with_reset_token after.
    """
    if not token:
        return None, None
    conn = _get_conn()
    try:
        # SQLite: expiry check in seconds (julianday returns days)
        row = conn.execute(
            """
            SELECT id, username FROM users
            WHERE password_reset_token = ? AND auth_provider = 'email'
              AND (julianday('now') - julianday(password_reset_token_created_at)) * 86400 < ?
            """,
            (token, RESET_TOKEN_EXPIRY_SECONDS),
        ).fetchone()
        if not row:
            return None, None
        return row["id"], row["username"]
    finally:
        conn.close()


def set_password_with_reset_token(token: str, new_password: str) -> Tuple[bool, str]:
    """
    Set a new password using a valid reset token, then clear the token.
    Returns (success, message). Uses same password rules as sign-up.
    """
    ok, err = validate_password(new_password)
    if not ok:
        return False, err
    user_id, email = verify_password_reset_token(token)
    if user_id is None:
        return False, "Invalid or expired reset link. Request a new one."
    try:
        password_hash = bcrypt.hashpw(new_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    except Exception:
        return False, "Could not hash password."
    conn = _get_conn()
    try:
        conn.execute(
            """
            UPDATE users SET password_hash = ?, password_reset_token = NULL, password_reset_token_created_at = NULL
            WHERE id = ?
            """,
            (password_hash, user_id),
        )
        conn.commit()
        return True, "Password updated. You can sign in now."
    except Exception as e:
        return False, str(e)
    finally:
        conn.close()


def verify_user(email: str, password: str) -> Optional[int]:
    """
    Verify email + password. Returns user_id if valid and (for email users) verified, else None.
    """
    email = (email or "").strip().lower()
    if not email or not password:
        return None
    conn = _get_conn()
    try:
        row = conn.execute(
            "SELECT id, password_hash, email_verified, auth_provider FROM users WHERE username = ?",
            (email,),
        ).fetchone()
        if not row:
            return None
        if row["auth_provider"] != "email":
            return None  # use OAuth for this account
        if not row["email_verified"]:
            return None
        if not bcrypt.checkpw(password.encode("utf-8"), row["password_hash"].encode("utf-8")):
            return None
        return row["id"]
    finally:
        conn.close()


def get_or_create_oauth_user(provider: str, email: str, name: Optional[str] = None) -> Optional[int]:
    """
    Find or create user for OAuth login. Returns user_id. Email must be present from provider.
    """
    email = (email or "").strip().lower()
    if not email or not validate_email(email):
        return None
    conn = _get_conn()
    try:
        row = conn.execute("SELECT id FROM users WHERE username = ?", (email,)).fetchone()
        if row:
            conn.execute(
                "UPDATE users SET email_verified = 1, auth_provider = ? WHERE id = ?",
                (provider, row["id"]),
            )
            conn.commit()
            return row["id"]
        conn.execute(
            """
            INSERT INTO users (username, password_hash, email_verified, auth_provider)
            VALUES (?, '', 1, ?)
            """,
            (email, provider),
        )
        conn.commit()
        cur = conn.execute("SELECT id FROM users WHERE username = ?", (email,))
        r = cur.fetchone()
        return r["id"] if r else None
    except Exception:
        return None
    finally:
        conn.close()


def _app_url() -> str:
    return os.environ.get("APP_URL", "http://localhost:8501").rstrip("/")


def oauth_google_auth_url(state: str = "google") -> Optional[str]:
    """Build Google OAuth2 authorization URL. Requires GOOGLE_CLIENT_ID in env."""
    client_id = os.environ.get("GOOGLE_CLIENT_ID")
    if not client_id:
        return None
    redirect_uri = f"{_app_url()}/"
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
    }
    return f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"


def oauth_microsoft_auth_url(state: str = "microsoft") -> Optional[str]:
    """Build Microsoft (Azure AD v2) authorization URL. Requires MICROSOFT_CLIENT_ID."""
    client_id = os.environ.get("MICROSOFT_CLIENT_ID")
    if not client_id:
        return None
    redirect_uri = f"{_app_url()}/"
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
    }
    return f"https://login.microsoftonline.com/common/oauth2/v2.0/authorize?{urlencode(params)}"


def oauth_facebook_auth_url(state: str = "facebook") -> Optional[str]:
    """Build Facebook Login authorization URL. Requires FACEBOOK_APP_ID."""
    app_id = os.environ.get("FACEBOOK_APP_ID")
    if not app_id:
        return None
    redirect_uri = f"{_app_url()}/"
    params = {
        "client_id": app_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "email,public_profile",
        "state": state,
    }
    return f"https://www.facebook.com/v18.0/dialog/oauth?{urlencode(params)}"


def oauth_exchange_google(code: str) -> Optional[Dict[str, Any]]:
    """Exchange code for Google user info (email, name)."""
    client_id = os.environ.get("GOOGLE_CLIENT_ID")
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET")
    if not client_id or not client_secret:
        return None
    redirect_uri = f"{_app_url()}/"
    try:
        r = requests.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
            headers={"Accept": "application/json"},
            timeout=10,
        )
        r.raise_for_status()
        data = r.json()
        access_token = data.get("access_token")
        if not access_token:
            return None
        u = requests.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10,
        )
        u.raise_for_status()
        info = u.json()
        return {"email": info.get("email"), "name": info.get("name")}
    except Exception:
        return None


def oauth_exchange_microsoft(code: str) -> Optional[Dict[str, Any]]:
    """Exchange code for Microsoft user info (email, name)."""
    client_id = os.environ.get("MICROSOFT_CLIENT_ID")
    client_secret = os.environ.get("MICROSOFT_CLIENT_SECRET")
    if not client_id or not client_secret:
        return None
    redirect_uri = f"{_app_url()}/"
    try:
        r = requests.post(
            "https://login.microsoftonline.com/common/oauth2/v2.0/token",
            data={
                "code": code,
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
            headers={"Accept": "application/json"},
            timeout=10,
        )
        r.raise_for_status()
        data = r.json()
        access_token = data.get("access_token")
        if not access_token:
            return None
        u = requests.get(
            "https://graph.microsoft.com/v1.0/me",
            headers={"Authorization": f"Bearer {access_token}"},
            params={"$select": "mail,userPrincipalName,displayName"},
            timeout=10,
        )
        u.raise_for_status()
        info = u.json()
        email = info.get("mail") or info.get("userPrincipalName")
        return {"email": email, "name": info.get("displayName")}
    except Exception:
        return None


def oauth_exchange_facebook(code: str) -> Optional[Dict[str, Any]]:
    """Exchange code for Facebook user info (email, name)."""
    app_id = os.environ.get("FACEBOOK_APP_ID")
    app_secret = os.environ.get("FACEBOOK_APP_SECRET")
    if not app_id or not app_secret:
        return None
    redirect_uri = f"{_app_url()}/"
    try:
        r = requests.get(
            "https://graph.facebook.com/v18.0/oauth/access_token",
            params={
                "client_id": app_id,
                "client_secret": app_secret,
                "redirect_uri": redirect_uri,
                "code": code,
            },
            timeout=10,
        )
        r.raise_for_status()
        data = r.json()
        access_token = data.get("access_token")
        if not access_token:
            return None
        u = requests.get(
            "https://graph.facebook.com/me",
            params={"fields": "email,name", "access_token": access_token},
            timeout=10,
        )
        u.raise_for_status()
        info = u.json()
        return {"email": info.get("email"), "name": info.get("name")}
    except Exception:
        return None


def load_portfolio_for_user(user_id: int) -> Optional[str]:
    """Load raw portfolio JSON for user. Returns None if none saved. Legacy: used for old metals-only format."""
    conn = _get_conn()
    try:
        row = conn.execute(
            "SELECT data_json FROM portfolios WHERE user_id = ?",
            (user_id,),
        ).fetchone()
        return row["data_json"] if row else None
    finally:
        conn.close()


def load_full_portfolio(user_id: int) -> Dict[str, Any]:
    """
    Load full portfolio (entities + asset classes). Migrates old metals-only blob
    into entities.individual.precious_metals so existing users keep their data.
    """
    raw = load_portfolio_for_user(user_id)
    if not raw:
        return _default_portfolio_structure()
    try:
        data = json.loads(raw)
    except (TypeError, json.JSONDecodeError):
        return _default_portfolio_structure()
    if isinstance(data, dict) and "entities" in data:
        # Ensure all entity keys exist
        for eid in ENTITY_IDS:
            if eid not in data["entities"]:
                data["entities"][eid] = dict(DEFAULT_ENTITY_BLOB)
            for key in DEFAULT_ENTITY_BLOB:
                if key not in data["entities"][eid]:
                    data["entities"][eid][key] = DEFAULT_ENTITY_BLOB[key]
        return data
    # Legacy: whole blob was precious_metals table (orient="split" or raw string)
    migrated = _default_portfolio_structure()
    migrated["entities"]["individual"]["precious_metals"] = raw
    return migrated


def save_full_portfolio(user_id: int, data: Dict[str, Any]) -> None:
    """Save full portfolio JSON (entities structure)."""
    save_portfolio_for_user(user_id, json.dumps(data))


def save_portfolio_for_user(user_id: int, data_json: str) -> None:
    """Save or update portfolio JSON for user."""
    conn = _get_conn()
    try:
        conn.execute(
            """
            INSERT INTO portfolios (user_id, data_json, updated_at)
            VALUES (?, ?, datetime('now'))
            ON CONFLICT(user_id) DO UPDATE SET
                data_json = excluded.data_json,
                updated_at = datetime('now')
            """,
            (user_id, data_json),
        )
        conn.commit()
    finally:
        conn.close()
