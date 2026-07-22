from __future__ import annotations

import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / "public"


def test_manifest_defines_installable_bcb_finance_app():
    manifest = json.loads((PUBLIC / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["name"] == "Bawjiase Community Bank Finance Payslip Platform"
    assert manifest["short_name"] == "BCB Payslips"
    assert manifest["display"] == "standalone"
    assert manifest["start_url"].startswith("/login")
    assert manifest["theme_color"] == "#064e3b"

    icons = {(item["sizes"], item.get("purpose", "any")): item["src"] for item in manifest["icons"]}
    assert ("192x192", "any") in icons
    assert ("512x512", "any") in icons
    assert ("512x512", "maskable") in icons

    for (size, _purpose), source in icons.items():
        expected = tuple(int(value) for value in size.split("x"))
        with Image.open(PUBLIC / source.lstrip("/")) as image:
            assert image.size == expected


def test_service_worker_never_offline_caches_confidential_records():
    worker = (PUBLIC / "sw.js").read_text(encoding="utf-8")
    for excluded_path in ("/api/", "/mail-api/", "/uploads/", "/profile_pics/"):
        assert excluded_path in worker
    assert "pdf|zip|xlsx|csv" in worker
    assert "offline.html" in worker
    assert "request.method !== 'GET'" in worker


def test_html_exposes_mobile_install_metadata():
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    assert 'rel="manifest" href="/manifest.json"' in html
    assert 'rel="apple-touch-icon"' in html
    assert 'name="apple-mobile-web-app-capable" content="yes"' in html
    assert "viewport-fit=cover" in html
