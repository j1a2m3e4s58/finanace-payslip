"""Send only an explicitly approved synthetic staging payroll batch.

This script is intentionally unsuitable for unattended production use. It
requires an HTTPS staging URL, a batch named as staging data, an exact recipient
allowlist, privileged MFA, and an explicit confirmation phrase. It never prints
recipient addresses, credentials, payslip values, or response bodies.
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


PROVIDER_FINAL_STATUSES = {"Delivered", "Failed", "Bounced"}


def totp_code(secret: str) -> str:
    normalized = "".join(str(secret).strip().upper().split())
    key = base64.b32decode(normalized + "=" * ((8 - len(normalized) % 8) % 8), casefold=True)
    counter = int(time.time()) // 30
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    return f"{(struct.unpack('>I', digest[offset:offset + 4])[0] & 0x7FFFFFFF) % 1_000_000:06d}"


def api_request(opener, base_url: str, route: str, *, method: str = "GET", payload=None, csrf_token: str = ""):
    encoded = None if payload is None else json.dumps(payload).encode("utf-8")
    headers = {"Accept": "application/json"}
    if encoded is not None:
        headers["Content-Type"] = "application/json"
    if csrf_token and method != "GET":
        headers["X-CSRF-Token"] = csrf_token
    req = Request(f"{base_url}{route}", data=encoded, method=method, headers=headers)
    try:
        with opener.open(req, timeout=45) as response:
            return response.status, json.loads(response.read() or b"{}")
    except HTTPError as exc:
        try:
            body = json.loads(exc.read() or b"{}")
        except json.JSONDecodeError:
            body = {}
        raise RuntimeError(f"{method} {route} failed with HTTP {exc.code}: {body.get('error', 'request rejected')}") from exc


def required(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} is required")
    return value


def delivery_records(opener, base_url: str, batch_id: str) -> list[dict]:
    status, payload = api_request(opener, base_url, f"/api/payroll-batches/{batch_id}/email-delivery")
    if status != 200:
        raise RuntimeError("Delivery report could not be loaded")
    return [item for item in payload.get("deliveries", []) if not item.get("isTest")]


def wait_for(opener, base_url: str, batch_id: str, predicate, timeout: int = 600) -> list[dict]:
    deadline = time.time() + timeout
    while time.time() < deadline:
        records = delivery_records(opener, base_url, batch_id)
        if records and predicate(records):
            return records
        time.sleep(10)
    raise RuntimeError("Timed out waiting for the approved staging delivery state")


def main() -> None:
    if required("STAGING_EMAIL_CONFIRMATION") != "SEND SYNTHETIC PAYSLIPS":
        raise RuntimeError("Explicit synthetic-email confirmation is required")
    base_url = required("STAGING_BASE_URL").rstrip("/")
    parsed = urlparse(base_url)
    if parsed.scheme != "https" or not parsed.netloc:
        raise RuntimeError("STAGING_BASE_URL must be an approved HTTPS deployment")
    batch_id = required("STAGING_EMAIL_BATCH_ID")
    expected_count = int(required("STAGING_EXPECTED_RECIPIENT_COUNT"))
    if expected_count not in {10, 100, 500}:
        raise RuntimeError("The recipient count must be 10, 100, or 500")
    mode = required("STAGING_DELIVERY_MODE")
    if mode not in {"delivery", "bounce-retry"}:
        raise RuntimeError("STAGING_DELIVERY_MODE must be delivery or bounce-retry")
    credentials = json.loads(required("STAGING_ROLE_CREDENTIALS_JSON"))
    account = credentials.get("FinanceApprover", {})
    if not all(account.get(name) for name in ("email", "password", "mfaSecret")):
        raise RuntimeError("FinanceApprover staging email, password, and MFA secret are required")
    approved = json.loads(required("STAGING_APPROVED_RECIPIENTS_JSON"))
    if not isinstance(approved, list) or len(approved) != expected_count:
        raise RuntimeError("The approved recipient allowlist does not match the expected count")
    approved_set = {str(item).strip().lower() for item in approved}
    if len(approved_set) != expected_count:
        raise RuntimeError("Every approved staging recipient must be unique")
    test_recipient = required("STAGING_TEST_RECIPIENT").lower()
    if test_recipient not in approved_set:
        raise RuntimeError("The test recipient is not in the approved staging allowlist")

    opener = build_opener(HTTPCookieProcessor(CookieJar()))
    _, login = api_request(opener, base_url, "/api/auth/login", method="POST", payload={
        "email": account["email"], "passwordHash": account["password"], "mfaCode": totp_code(account["mfaSecret"]),
    })
    if login.get("user", {}).get("role") != "FinanceApprover" or login.get("user", {}).get("mfaEnabled") is not True:
        raise RuntimeError("The staging delivery account is not an MFA-enabled Finance Approver")
    csrf_token = str(login.get("csrfToken") or "")
    try:
        _, batch_payload = api_request(opener, base_url, f"/api/payroll-batches/{batch_id}")
        batch = batch_payload.get("batch", {})
        if not str(batch.get("name", "")).strip().upper().startswith(("STAGING ", "[STAGING]")):
            raise RuntimeError("The selected payroll is not clearly named as a staging batch")
        entries = batch.get("entries", [])
        batch_recipients = [str(item.get("email", "")).strip().lower() for item in entries]
        if len(entries) != expected_count or set(batch_recipients) != approved_set:
            raise RuntimeError("The staging payroll recipients do not exactly match the approved allowlist")
        if len(batch_recipients) != len(set(batch_recipients)):
            raise RuntimeError("The staging payroll contains duplicate recipients")

        records = delivery_records(opener, base_url, batch_id)
        if not records:
            _, delivery_state = api_request(opener, base_url, f"/api/payroll-batches/{batch_id}/email-delivery")
            if not delivery_state.get("testEmailSentAt"):
                api_request(opener, base_url, f"/api/payroll-batches/{batch_id}/email-test", method="POST", payload={"email": test_recipient}, csrf_token=csrf_token)
            api_request(opener, base_url, f"/api/payroll-batches/{batch_id}/send-payslips", method="POST", payload={}, csrf_token=csrf_token)

        records = wait_for(opener, base_url, batch_id, lambda items: len(items) == expected_count and all(item.get("status") in PROVIDER_FINAL_STATUSES for item in items))
        if mode == "delivery":
            if any(item.get("status") != "Delivered" for item in records):
                raise RuntimeError("Not every synthetic payslip reached provider-confirmed Delivered status")
        else:
            failed = [item for item in records if item.get("status") in {"Failed", "Bounced"}]
            if not failed:
                raise RuntimeError("The controlled failure/bounce batch did not produce a retryable record")
            attempts_before = {item["id"]: int(item.get("attempts", 0)) for item in failed}
            api_request(opener, base_url, f"/api/payroll-batches/{batch_id}/resend-failed", method="POST", payload={}, csrf_token=csrf_token)
            records = wait_for(opener, base_url, batch_id, lambda items: len(items) == expected_count and all(
                item.get("status") in PROVIDER_FINAL_STATUSES for item in items
            ) and all(
                int(item.get("attempts", 0)) >= attempts_before[item["id"]] + 1
                for item in items if item.get("id") in attempts_before
            ))
            if not all(any(event.get("status") == "Retried" for event in item.get("statusHistory", [])) for item in records if item.get("id") in attempts_before):
                raise RuntimeError("Retry history was not recorded for every controlled failure")

        counts = {status: sum(1 for item in records if item.get("status") == status) for status in sorted(PROVIDER_FINAL_STATUSES)}
        print(f"Approved staging payslip delivery passed for {len(records)} synthetic recipients; status counts: {counts}")
    finally:
        if csrf_token:
            api_request(opener, base_url, "/api/auth/logout", method="POST", payload={}, csrf_token=csrf_token)


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, ValueError, TypeError, json.JSONDecodeError) as exc:
        print(f"Staging payslip delivery failed safely: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
