from __future__ import annotations

from datetime import datetime


def month_before(value: str) -> str:
    parsed = datetime.strptime(value, "%Y-%m")
    year, month = parsed.year, parsed.month - 1
    if month == 0:
        year, month = year - 1, 12
    return f"{year:04d}-{month:02d}"


def month_in_range(period: str, effective_month: str, expiry_month: str = "") -> bool:
    return bool(
        period
        and effective_month
        and period >= effective_month
        and (not expiry_month or period <= expiry_month)
    )


def select_approved_profile(versions: list[dict], period: str) -> dict | None:
    matches = [
        item
        for item in versions
        if item.get("configured")
        and month_in_range(period, str(item.get("effectiveMonth", "")), str(item.get("expiryMonth", "")))
    ]
    matches.sort(key=lambda item: (str(item.get("effectiveMonth", "")), int(item.get("version", 0) or 0)))
    return matches[-1] if matches else None


def expired_profiles_without_fallback(versions: list[dict], period: str) -> list[dict]:
    if select_approved_profile(versions, period):
        return []
    return [
        item
        for item in versions
        if item.get("configured")
        and str(item.get("effectiveMonth", "")) <= period
        and str(item.get("expiryMonth", ""))
        and str(item.get("expiryMonth")) < period
    ]


def validate_proposed_period(versions: list[dict], effective_month: str, expiry_month: str = "") -> None:
    if expiry_month and expiry_month < effective_month:
        raise ValueError("Expiry month cannot be earlier than the effective month")
    if not versions:
        return
    latest_effective = max(str(item.get("effectiveMonth", "")) for item in versions)
    if effective_month <= latest_effective:
        raise ValueError(
            f"The new setup must start after the latest approved setup ({latest_effective}). "
            "Create a correction workflow for historical payroll instead of backdating this setup."
        )
