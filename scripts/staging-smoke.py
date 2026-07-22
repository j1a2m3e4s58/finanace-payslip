"""Non-destructive acceptance checks for an approved HTTPS staging deployment.

Required environment variables:
  STAGING_BASE_URL
  STAGING_ROLE_CREDENTIALS_JSON

The credentials JSON maps each platform role to an email/password pair. It may
also include an MFA code. No credential or confidential response body is
printed.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import struct
import sys
import time
from http.cookiejar import CookieJar
from urllib.error import HTTPError
from urllib.parse import urlparse
from urllib.request import HTTPCookieProcessor, Request, build_opener


ROLES = ("SuperAdmin", "Admin", "FinanceOfficer", "FinanceApprover", "Auditor", "Management", "BossAdmin")
PRIVILEGED_MFA_ROLES = {"SuperAdmin", "Admin", "FinanceOfficer", "FinanceApprover", "BossAdmin"}
ROLE_CHECKS = {
    "SuperAdmin": (("/api/users", 200), ("/api/payroll-batches", 200), ("/api/audit-logs", 200), ("/api/system-settings", 403)),
    "Admin": (("/api/users", 200), ("/api/staff-records?status=all", 200), ("/api/payroll-batches", 403), ("/api/reports?type=payroll_summary&page=1&pageSize=10", 403)),
    "FinanceOfficer": (("/api/staff-records?status=all", 200), ("/api/payroll-batches", 200), ("/api/users", 403), ("/api/audit-logs", 403)),
    "FinanceApprover": (("/api/staff-records?status=all", 200), ("/api/payroll-batches", 200), ("/api/reports?type=payroll_summary&page=1&pageSize=10", 200), ("/api/users", 403)),
    "Auditor": (("/api/audit-logs", 200), ("/api/salary-history", 200), ("/api/reports?type=payroll_summary&page=1&pageSize=10", 200), ("/api/payroll-batches", 403)),
    "Management": (("/api/reporting/dashboard", 200), ("/api/reports?type=payroll_summary&page=1&pageSize=10", 200), ("/api/staff-records?status=all", 403), ("/api/audit-logs", 403)),
    "BossAdmin": (("/api/system-settings", 200), ("/api/users", 403), ("/api/staff-records?status=all", 403), ("/api/payroll-batches", 403), ("/api/reporting/dashboard", 403)),
}


def request(opener, url: str, *, method: str = "GET", payload=None, headers=None):
    encoded = None if payload is None else json.dumps(payload).encode("utf-8")
    request_headers = {"Accept": "application/json", **(headers or {})}
    if encoded is not None:
        request_headers["Content-Type"] = "application/json"
    req = Request(url, data=encoded, method=method, headers=request_headers)
    try:
        with opener.open(req, timeout=30) as response:
            body = response.read()
            return response.status, response.headers, json.loads(body or b"{}")
    except HTTPError as exc:
        body = exc.read()
        try:
            parsed = json.loads(body or b"{}")
        except json.JSONDecodeError:
            parsed = {}
        return exc.code, exc.headers, parsed


def assert_status(actual: int, expected: int, label: str) -> None:
    if actual != expected:
        raise AssertionError(f"{label}: expected HTTP {expected}, received {actual}")


def totp_code(secret: str, timestamp: int | None = None) -> str:
    normalized = "".join(str(secret).strip().upper().split())
    try:
        key = base64.b32decode(normalized + "=" * ((8 - len(normalized) % 8) % 8), casefold=True)
    except (ValueError, TypeError) as exc:
        raise AssertionError("A staging MFA secret is not valid Base32") from exc
    counter = int(timestamp if timestamp is not None else time.time()) // 30
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    value = (struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF) % 1_000_000
    return f"{value:06d}"


def main() -> None:
    base_url = os.getenv("STAGING_BASE_URL", "").strip().rstrip("/")
    if urlparse(base_url).scheme != "https":
        raise SystemExit("STAGING_BASE_URL must be an approved HTTPS deployment")
    try:
        credentials = json.loads(os.getenv("STAGING_ROLE_CREDENTIALS_JSON", ""))
    except json.JSONDecodeError as exc:
        raise SystemExit("STAGING_ROLE_CREDENTIALS_JSON must be valid JSON") from exc
    missing = [role for role in ROLES if not credentials.get(role, {}).get("email") or not credentials.get(role, {}).get("password")]
    if missing:
        raise SystemExit("Missing staging credentials for: " + ", ".join(missing))
    missing_mfa = [role for role in PRIVILEGED_MFA_ROLES if not credentials.get(role, {}).get("mfaSecret")]
    if missing_mfa:
        raise SystemExit("Missing staging MFA secrets for privileged roles: " + ", ".join(sorted(missing_mfa)))

    public = build_opener()
    status, headers, readiness = request(public, f"{base_url}/api/readiness")
    assert_status(status, 200, "readiness")
    if readiness.get("database") != {"ok": True, "backend": "postgresql"}:
        raise AssertionError("Staging is not using a healthy PostgreSQL database")
    if readiness.get("worker") != {"ok": True, "mode": "external"}:
        raise AssertionError("The dedicated delivery worker is not healthy")
    required_headers = {
        "Strict-Transport-Security": "max-age=",
        "Content-Security-Policy": "frame-ancestors 'none'",
        "X-Frame-Options": "DENY",
        "X-Content-Type-Options": "nosniff",
    }
    for name, expected in required_headers.items():
        if expected.lower() not in str(headers.get(name, "")).lower():
            raise AssertionError(f"Required security header is missing or unsafe: {name}")
    status, _, settings = request(public, f"{base_url}/api/portal-settings")
    assert_status(status, 200, "public portal settings")
    if settings.get("settings", {}).get("selfRegistrationEnabled") is not False:
        raise AssertionError("Public registration must remain disabled in staging")
    status, _, _ = request(public, f"{base_url}/api/email-delivery/webhook", method="POST", payload={"event": "delivered"}, headers={"X-Delivery-Webhook-Secret": "invalid-staging-probe"})
    assert_status(status, 401, "invalid delivery webhook secret")

    for role in ROLES:
        account = credentials[role]
        opener = build_opener(HTTPCookieProcessor(CookieJar()))
        status, _, login = request(opener, f"{base_url}/api/auth/login", method="POST", payload={
            "email": account["email"],
            "passwordHash": account["password"],
            "mfaCode": totp_code(account["mfaSecret"]) if account.get("mfaSecret") else "",
        })
        assert_status(status, 200, f"{role} login")
        if login.get("user", {}).get("role") != role:
            raise AssertionError(f"{role} account returned a different role")
        if role in PRIVILEGED_MFA_ROLES and login.get("user", {}).get("mfaEnabled") is not True:
            raise AssertionError(f"{role} has not completed MFA enrollment")
        for route, expected in ROLE_CHECKS[role]:
            status, _, _ = request(opener, f"{base_url}{route}")
            assert_status(status, expected, f"{role} {route}")
        status, _, _ = request(opener, f"{base_url}/api/auth/logout", method="POST", payload={})
        assert_status(status, 403, f"{role} CSRF rejection")
        csrf_token = str(login.get("csrfToken") or "")
        status, _, _ = request(opener, f"{base_url}/api/auth/logout", method="POST", payload={}, headers={"X-CSRF-Token": csrf_token})
        assert_status(status, 200, f"{role} logout")

    print("Staging readiness, privileged MFA, security headers, CSRF, registration policy, worker, PostgreSQL, webhook rejection, and role matrix passed")


if __name__ == "__main__":
    try:
        main()
    except AssertionError as exc:
        print(f"Staging acceptance failed: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
