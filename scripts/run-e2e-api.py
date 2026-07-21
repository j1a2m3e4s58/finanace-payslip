"""Start an isolated local API populated only with synthetic E2E accounts."""

from __future__ import annotations

import os
import shutil
import sys
import threading
import asyncio
import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = (ROOT / ".tmp" / f"e2e-data-{os.getpid()}").resolve()
if ROOT.resolve() not in DATA_DIR.parents:
    raise RuntimeError("Refusing to prepare E2E data outside the workspace")
shutil.rmtree(DATA_DIR, ignore_errors=True)
DATA_DIR.mkdir(parents=True, exist_ok=True)

os.environ.update(
    {
        "PORTAL_DATA_DIR": str(DATA_DIR),
        "DATABASE_URL": f"sqlite:///{(DATA_DIR / 'portal.db').as_posix()}",
        "ALLOW_SELF_REGISTRATION": "false",
        "DISABLE_BACKUP_SCHEDULER": "true",
        "PAYSLIP_WORKER_MODE": "inline",
        "MAIL_SERVER": "127.0.0.1",
        "MAIL_PORT": "1025",
        "MAIL_SECURITY": "none",
        "MAIL_USERNAME": "e2e-user",
        "MAIL_PASSWORD": "e2e-password",
        "MAIL_DEFAULT_SENDER": "finance@bawjiasecommunitybank.com",
        "PASSWORD_RESET_BASE_URL": "http://127.0.0.1:5173/reset-password",
        "ALLOWED_ORIGINS": "http://127.0.0.1:5173",
        "REQUIRE_POSTGRESQL": "false",
        "REQUIRE_MALWARE_SCANNER": "false",
        "FORCE_HTTPS": "false",
    }
)

sys.path.insert(0, str(ROOT / "mail-api"))
import app as portal  # noqa: E402
smtp_spec = importlib.util.spec_from_file_location(
    "e2e_smtp_capture", ROOT / "scripts" / "run-e2e-smtp.py"
)
if not smtp_spec or not smtp_spec.loader:
    raise RuntimeError("Unable to load the E2E SMTP capture server")
smtp_capture = importlib.util.module_from_spec(smtp_spec)
smtp_spec.loader.exec_module(smtp_capture)


PASSWORD = "E2E-Test#2026!"
USERS = [
    {
        "id": "e2e-finance-officer",
        "fullname": "E2E Finance Officer",
        "email": "e2e.finance@bawjiasecommunitybank.com",
        "phone": "0200000001",
        "role": "FinanceOfficer",
        "position": "Finance Officer",
        "department": "FINANCE",
        "branch": "HEAD OFFICE",
        "accountStatus": "active",
        "isVerified": True,
        "mustChangePassword": False,
    },
    {
        "id": "e2e-finance-approver",
        "fullname": "E2E Finance Approver",
        "email": "e2e.approver@bawjiasecommunitybank.com",
        "phone": "0200000002",
        "role": "FinanceApprover",
        "position": "Finance Approver",
        "department": "FINANCE",
        "branch": "HEAD OFFICE",
        "accountStatus": "active",
        "isVerified": True,
        "mustChangePassword": False,
    },
]

portal.save_user_store(USERS)
portal.save_password_store(
    {user["email"]: portal.hash_password_for_storage(PASSWORD) for user in USERS}
)
settings = portal.load_portal_settings_store()
settings.update(
    {
        "requireTestEmail": True,
        "requirePrivilegedMfa": False,
        "restrictPayslipDownloads": True,
        "payrollApprovalRequired": True,
    }
)
portal.save_portal_settings_store(settings)

if __name__ == "__main__":
    threading.Thread(
        target=lambda: asyncio.run(smtp_capture.main()),
        name="e2e-smtp-capture",
        daemon=True,
    ).start()
    portal.app.run(host="127.0.0.1", port=4190, debug=False, use_reloader=False, threaded=True)
