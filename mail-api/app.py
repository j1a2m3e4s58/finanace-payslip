from __future__ import annotations

import json
import html
import base64
import hashlib
import os
import re
import secrets
import shutil
import smtplib
import subprocess
import tempfile
import threading
import time
import zipfile
import pyotp
from queue import Empty, Queue
from io import BytesIO
from email.message import EmailMessage
from email.utils import make_msgid
from datetime import datetime
from urllib.parse import urlencode, urlparse, urlunparse, parse_qsl

from dotenv import load_dotenv
from flask import Flask, g, jsonify, redirect, request, send_file, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash
from werkzeug.utils import secure_filename
from cryptography.fernet import Fernet, InvalidToken
from PIL import Image as PILImage, UnidentifiedImageError
from payslip_pdf import generate_payslip_pdf, protect_pdf
from report_exports import generate_report_pdf, generate_report_xlsx
from storage import DatabaseStore

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))
load_dotenv(os.path.join(BASE_DIR, ".env.local"), override=True)
DATA_DIR = os.getenv("PORTAL_DATA_DIR", os.path.join(BASE_DIR, "data")).strip() or os.path.join(BASE_DIR, "data")
FRONTEND_PUBLIC_DIR = os.getenv("PORTAL_FRONTEND_DIR", os.path.join(BASE_DIR, "public")).strip() or os.path.join(BASE_DIR, "public")

OFFICIAL_EMAIL_DOMAIN = "@bawjiasecommunitybank.com"
PRESENCE_STORE_PATH = os.path.join(DATA_DIR, "presence_store.json")
PASSWORD_STORE_PATH = os.path.join(DATA_DIR, "password_store.json")
USERS_STORE_PATH = os.path.join(DATA_DIR, "users_store.json")
RESET_TOKENS_PATH = os.path.join(DATA_DIR, "reset_tokens.json")
LOGIN_ATTEMPTS_STORE_PATH = os.path.join(DATA_DIR, "login_attempts_store.json")
RATE_LIMIT_STORE_PATH = os.path.join(DATA_DIR, "rate_limit_store.json")
MFA_STORE_PATH = os.path.join(DATA_DIR, "mfa_store.json")
SESSIONS_STORE_PATH = os.path.join(DATA_DIR, "sessions_store.json")
NOTIFICATIONS_STORE_PATH = os.path.join(DATA_DIR, "notifications_store.json")
AUDIT_LOGS_STORE_PATH = os.path.join(DATA_DIR, "audit_logs_store.json")
STAFF_RECORDS_STORE_PATH = os.path.join(DATA_DIR, "staff_records_store.json")
PAYROLL_BATCHES_STORE_PATH = os.path.join(DATA_DIR, "payroll_batches_store.json")
SALARY_HISTORY_STORE_PATH = os.path.join(DATA_DIR, "salary_history_store.json")
EMAIL_DELIVERY_STORE_PATH = os.path.join(DATA_DIR, "email_delivery_store.json")
PORTAL_SETTINGS_STORE_PATH = os.path.join(DATA_DIR, "portal_settings_store.json")
WORKER_STATUS_STORE_PATH = os.path.join(DATA_DIR, "worker_status_store.json")
UPLOADS_DIR = os.path.join(DATA_DIR, "uploads")
PRESENCE_TTL_SECONDS = 20
ONLINE_WINDOW_SECONDS = 20
RESET_TOKEN_TTL_SECONDS = 30 * 60
VERIFICATION_TTL_SECONDS = 15 * 60
SESSION_TTL_SECONDS = 30 * 24 * 60 * 60
ALLOWED_ROLES = {"BossAdmin", "SuperAdmin", "Admin", "FinanceOfficer", "FinanceApprover", "Auditor", "Management"}
ACCOUNT_STATUSES = {"active", "suspended", "disabled"}
PORTAL_CONTROL_PASSWORD = str(os.getenv("PORTAL_SETTINGS_SECRET", "")).strip()
DEFAULT_PORTAL_BRANCHES = [
    "HEAD OFFICE",
    "BAWJIASE",
    "ADEISO",
    "OFAAKOR",
    "KASOA NEW MARKET",
    "KASOA MAIN",
]
DEFAULT_PORTAL_DEPARTMENTS = [
    "IT",
    "HR",
    "BANKING OPERATIONS",
    "E-BANKING",
    "MICROFINANCE",
    "CREDIT",
    "RECOVERY",
    "FINANCE",
    "CUSTOMER SERVICE",
    "COMPLIANCE",
    "AUDIT",
    "ADMIN",
]
DEFAULT_PORTAL_SETTINGS = {
    "bankName": "Bawjiase Community Bank PLC",
    "shortBankName": "BCB",
    "portalName": "Finance Payslip Platform",
    "emailDomain": OFFICIAL_EMAIL_DOMAIN,
    "branches": DEFAULT_PORTAL_BRANCHES,
    "departments": DEFAULT_PORTAL_DEPARTMENTS,
    "loginSubtitle": "Sign in to manage staff payroll and payslips.",
    "loginButtonText": "Secure Login",
    "authorizedAccessText": "Authorized Access Only",
    "portalControlPassword": PORTAL_CONTROL_PASSWORD,
    "itAccessCode": "",
    "hrAccessCode": "",
    "sessionDays": 30,
    "sessionTimeoutMinutes": 30,
    "restrictPayslipDownloads": True,
    "approvedPayrollOnly": True,
    "requirePrivilegedMfa": True,
    "bankAddress": "Bawjiase, Central Region, Ghana",
    "bankLogo": "/assets/images/bcb-logo.png",
    "authorizedSignature": "",
    "emailFooter": "Bawjiase Community Bank PLC · Finance Department",
    "payslipTitle": "Staff Payslip",
    "confidentialityNote": "CONFIDENTIAL - FOR THE NAMED STAFF MEMBER ONLY",
    "allowanceLabels": {
        "supervisionAllowance": "Supervision Allowance", "riskAllowance": "Risk Allowance",
        "responsibilityAllowance": "Responsibility Allowance", "entertainmentAllowance": "Entertainment Allowance",
        "fuelTransportAllowance": "Fuel / Transport Allowance", "rentUtilityAllowance": "Rent / Utility Allowance",
        "otherAllowances": "Other Allowances",
    },
    "deductionLabels": {
        "ssf": "5.5% SSF", "esp": "4.5% ESP", "pf": "4.5% PF", "payeIncomeTax": "P.A.Y.E Income Tax",
        "staffWelfare": "Staff Welfare", "icuDues": "ICU Dues", "loans": "Loans", "otherDeductions": "Other Deductions",
    },
    "employerContributionLabels": {"employerSsf": "Employer SSF", "employerPf": "Employer PF"},
    "pdfPasswordRule": "staff_id",
    "emailProvider": "smtp",
    "smtpServer": "", "smtpPort": 465, "smtpSecurity": "ssl", "smtpUsername": "", "smtpSender": "",
    "defaultEmailSubject": "Your Payslip for {month} {year}",
    "defaultEmailBody": "Dear {staff_name},\n\nPlease find attached your confidential payslip for {month} {year}.\n\nRegards,\nFinance Department",
    "payrollApprovalRequired": True,
    "contributionRates": {
        "employeeSsf": 5.5,
        "employeeEsp": 4.5,
        "employeePf": 4.5,
        "employerSsf": 13.0,
        "employerPf": 5.0,
    },
    "contributionRateEffectiveMonth": "2000-01",
    "contributionRateHistory": [],
    "payrollValidationRules": {
        "maxBasicSalary": 1_000_000,
        "maxOtherAmount": 250_000,
        "deductionWarningPercent": 75,
    },
    "allowLightMode": True, "allowDarkMode": True, "defaultTheme": "light",
    "inactiveStaffInHistoricalReports": True,
    "requireTestEmail": True,
    "backupSchedule": "weekly",
    "auditRetentionYears": 7,
    "payrollRetentionYears": 7,
    "deliveryRetentionYears": 3,
    "passwordResetMinutes": 30,
    "dashboardLabel": "Dashboard",
    "profileLabel": "Profile",
    "activeStaffLabel": "Active Staff",
    "branchCoverageLabel": "Branch Coverage",
    "openOperationsLabel": "Open Operations",
    "resolutionRateLabel": "Resolution Rate",
}


def env_secret(name: str) -> str:
    direct = str(os.getenv(name, "") or "").strip()
    if direct:
        return direct
    secret_file = str(os.getenv(f"{name}_FILE", "") or "").strip()
    if not secret_file:
        return ""
    try:
        with open(secret_file, "r", encoding="utf-8") as handle:
            return handle.read(65536).strip()
    except OSError:
        return ""


def self_registration_enabled() -> bool:
    return str(os.getenv("ALLOW_SELF_REGISTRATION", "false")).strip().lower() in {"1", "true", "yes"}


def boss_database_maintenance_enabled() -> bool:
    return str(os.getenv("ALLOW_BOSS_ADMIN_DATABASE_MAINTENANCE", "false")).strip().lower() in {"1", "true", "yes"}


def token_storage_key(token: str) -> str:
    return hashlib.sha256(str(token).encode("utf-8")).hexdigest()


def normalized_token_storage_key(value: str) -> str:
    normalized = str(value or "").strip().lower()
    return normalized if re.fullmatch(r"[0-9a-f]{64}", normalized) else token_storage_key(value)


DEFAULT_INITIAL_PASSWORD = env_secret("PORTAL_DEFAULT_INITIAL_PASSWORD")
IT_ACCESS_CODE = env_secret("IT_ACCESS_CODE")
HR_ACCESS_CODE = env_secret("HR_ACCESS_CODE")
SESSION_COOKIE_NAME = "bcb_payslip_session"
CSRF_COOKIE_NAME = "bcb_payslip_csrf"

PAYSLIP_DELIVERY_QUEUE: Queue = Queue()
PAYSLIP_DELIVERY_LOCK = threading.RLock()
PAYSLIP_WORKER_STARTED = False
BACKUP_SCHEDULER_STARTED = False
BACKUP_SCHEDULER_LOCK = threading.Lock()
MAX_LOGIN_ATTEMPTS = max(3, int(os.getenv("MAX_LOGIN_ATTEMPTS", "5")))
LOGIN_ATTEMPT_WINDOW_SECONDS = max(60, int(os.getenv("LOGIN_ATTEMPT_WINDOW_MINUTES", "15"))) * 60
ACCOUNT_LOCKOUT_SECONDS = max(60, int(os.getenv("ACCOUNT_LOCKOUT_MINUTES", "15"))) * 60

INITIAL_USERS = []
app = Flask(__name__, static_folder=None)
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(UPLOADS_DIR, exist_ok=True)
DATABASE_STORE = DatabaseStore(DATA_DIR)


STORE_DEFAULTS: dict[str, object] = {
    PRESENCE_STORE_PATH: {},
    PASSWORD_STORE_PATH: {},
    USERS_STORE_PATH: [],
    RESET_TOKENS_PATH: {},
    SESSIONS_STORE_PATH: {},
    NOTIFICATIONS_STORE_PATH: [],
    AUDIT_LOGS_STORE_PATH: [],
    STAFF_RECORDS_STORE_PATH: [],
    PAYROLL_BATCHES_STORE_PATH: [],
    SALARY_HISTORY_STORE_PATH: [],
    EMAIL_DELIVERY_STORE_PATH: [],
    PORTAL_SETTINGS_STORE_PATH: {},
    WORKER_STATUS_STORE_PATH: {},
    LOGIN_ATTEMPTS_STORE_PATH: {},
    RATE_LIMIT_STORE_PATH: {},
    MFA_STORE_PATH: {},
}
PERSISTENT_STORE_PATHS = {os.path.abspath(path) for path in STORE_DEFAULTS}


def initialize_data_directory() -> None:
    for path, default in STORE_DEFAULTS.items():
        if os.path.exists(path):
            continue
        legacy_path = os.path.join(BASE_DIR, os.path.basename(path))
        if path != legacy_path and os.path.exists(legacy_path):
            try:
                os.replace(legacy_path, path)
                continue
            except OSError:
                pass
        with open(path, "w", encoding="utf-8") as handle:
            json.dump(default, handle, ensure_ascii=True, indent=2)


initialize_data_directory()


def seed_password_store_if_needed() -> None:
    existing = read_json_file(PASSWORD_STORE_PATH, {})
    if not isinstance(existing, dict) or existing:
        return
    if not DEFAULT_INITIAL_PASSWORD:
        return
    seeded = {
        user["email"]: hash_password_for_storage(DEFAULT_INITIAL_PASSWORD)
        for user in INITIAL_USERS
    }
    save_password_store(seeded)


def allowed_origins() -> set[str]:
    raw = os.getenv("ALLOWED_ORIGINS", "")
    return {item.strip() for item in raw.split(",") if item.strip()}


@app.after_request
def add_cors_headers(response):
    response.headers["X-Request-ID"] = getattr(g, "request_id", "")
    started = getattr(g, "request_started", None)
    if started is not None:
        response.headers["Server-Timing"] = f"app;dur={(time.perf_counter() - started) * 1000:.1f}"
    origin = request.headers.get("Origin")
    origins = allowed_origins()
    if "*" in origins:
        response.headers["Access-Control-Allow-Origin"] = origin or "*"
        response.headers["Vary"] = "Origin"
    elif origin and origin in origins:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-CSRF-Token"
    response.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
    if origin and (origin in origins or "*" in origins):
        response.headers["Access-Control-Allow-Credentials"] = "true"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), payment=()"
    response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"
    if request.is_secure or str(request.headers.get("X-Forwarded-Proto", "")).lower() == "https":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    if request.path.startswith("/api/") or response.mimetype in {"application/pdf", "application/zip"}:
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, private"
        response.headers["Pragma"] = "no-cache"
    if request.path.startswith("/api/"):
        duration_ms = round((time.perf_counter() - started) * 1000, 1) if started is not None else None
        event = {
            "event": "api_request",
            "requestId": getattr(g, "request_id", ""),
            "endpoint": request.endpoint or "unknown",
            "method": request.method,
            "status": response.status_code,
            "durationMs": duration_ms,
        }
        log = app.logger.warning if response.status_code >= 400 else app.logger.info
        log(json.dumps(event, ensure_ascii=True, separators=(",", ":")))
    return response


PUBLIC_API_ENDPOINTS = {
    "health", "get_portal_settings",
    "auth_register", "auth_login", "auth_request_password_reset", "auth_password_reset", "payslip_delivery_webhook", "monitoring_status",
}


@app.before_request
def enforce_transport_and_api_authentication():
    g.request_id = str(request.headers.get("X-Request-ID") or secrets.token_hex(12))[:64]
    g.request_started = time.perf_counter()
    if request.method == "OPTIONS":
        return None
    force_https = str(os.getenv("FORCE_HTTPS", "false")).strip().lower() in {"1", "true", "yes"}
    forwarded_proto = str(request.headers.get("X-Forwarded-Proto", "")).lower()
    is_local = str(request.host).split(":", 1)[0] in {"127.0.0.1", "localhost"}
    if force_https and not is_local and not request.is_secure and forwarded_proto != "https":
        secure_url = request.url.replace("http://", "https://", 1)
        return redirect(secure_url, code=308)
    if request.path.startswith("/api/") and request.endpoint not in PUBLIC_API_ENDPOINTS:
        token = parse_session_token()
        sessions = load_sessions()
        if not token:
            return jsonify({"error": "Authentication required or session expired"}), 401
        session = sessions.get(token_storage_key(token)) or sessions.get(token)
        if not session:
            return jsonify({"error": "Authentication required or session expired"}), 401
        if request.cookies.get(SESSION_COOKIE_NAME) and request.method in {"POST", "PUT", "PATCH", "DELETE"}:
            csrf_token = str(request.headers.get("X-CSRF-Token", "")).strip()
            expected_hash = str(session.get("csrfHash", ""))
            if not csrf_token or not expected_hash or not secrets.compare_digest(token_storage_key(csrf_token), expected_hash):
                return jsonify({"error": "Security token missing or invalid. Refresh the page and try again."}), 403
        session_user = find_user_by_id(load_user_store(), session.get("userId"))
        mfa_exempt = {"auth_mfa_status", "auth_mfa_enroll", "auth_mfa_confirm", "auth_mfa_disable", "auth_logout", "auth_change_password", "get_user"}
        privileged = session_user and session_user.get("role") in {"BossAdmin", "SuperAdmin", "Admin", "FinanceOfficer", "FinanceApprover"}
        if privileged and load_portal_settings_store().get("requirePrivilegedMfa", True) and mfa_configuration_available() and not user_mfa_enabled(session_user["id"]) and request.endpoint not in mfa_exempt:
            return jsonify({"error": "Authenticator setup is required for this role", "mfaEnrollmentRequired": True}), 403
    if not str(os.getenv("DISABLE_BACKUP_SCHEDULER", "false")).lower() in {"1", "true", "yes"} and "start_backup_scheduler" in globals():
        start_backup_scheduler()
    sensitive_limits = {
        "auth_register": (5, 3600), "auth_request_password_reset": (5, 900), "auth_mfa_enroll": (5, 900), "auth_mfa_confirm": (10, 300),
        "download_staff_payslip": (60, 60), "download_batch_payslips_zip": (10, 300), "export_report_data": (20, 300),
        "send_payslip_test_email": (10, 600), "queue_all_payslip_emails": (3, 600), "resend_failed_payslip_emails": (5, 600),
        "monitoring_status": (60, 60),
    }
    if request.endpoint in sensitive_limits:
        maximum, window = sensitive_limits[request.endpoint]
        retry_after = consume_rate_limit(request.endpoint, request_ip_address(), maximum, window)
        if retry_after:
            return jsonify({"error": "Too many requests. Try again later.", "retryAfterSeconds": retry_after}), 429
    return None


RATE_LIMIT_LOCK = threading.RLock()


def consume_rate_limit(scope: str, identity: str, maximum: int, window_seconds: int) -> int:
    key = hashlib.sha256(f"{scope}:{identity}".encode("utf-8")).hexdigest()
    now = now_seconds()
    with RATE_LIMIT_LOCK:
        raw = read_json_file(RATE_LIMIT_STORE_PATH, {})
        store = raw if isinstance(raw, dict) else {}
        recent = [int(value) for value in store.get(key, []) if int(value) > now - window_seconds]
        if len(recent) >= maximum:
            return max(1, window_seconds - (now - min(recent)))
        recent.append(now)
        store[key] = recent
        atomic_write_json(RATE_LIMIT_STORE_PATH, store)
    return 0


def require_json():
    max_bytes = 70_000_000 if request.endpoint == "restore_production_backup" else 2_000_000
    if int(request.content_length or 0) > max_bytes:
        return None, (jsonify({"error": "Request body is too large"}), 413)
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return None, (jsonify({"error": "JSON body required"}), 400)
    try:
        validate_json_payload(data)
    except ValueError as exc:
        return None, (jsonify({"error": str(exc)}), 400)
    return data, None


def validate_json_payload(value, depth: int = 0) -> None:
    if depth > 12:
        raise ValueError("Request data is nested too deeply")
    if isinstance(value, dict):
        if len(value) > 5000:
            raise ValueError("Request contains too many fields")
        for key, item in value.items():
            if not isinstance(key, str) or len(key) > 200:
                raise ValueError("Request contains an invalid field name")
            validate_json_payload(item, depth + 1)
    elif isinstance(value, list):
        if len(value) > 10000:
            raise ValueError("Request contains too many records")
        for item in value:
            validate_json_payload(item, depth + 1)
    elif isinstance(value, str) and "\x00" in value:
        raise ValueError("Request contains invalid control characters")
    elif isinstance(value, float) and (value != value or value in {float("inf"), float("-inf")}):
        raise ValueError("Request contains an invalid number")






def normalize_scope_list(value: object, *, empty_default: list[str] | None = None) -> list[str]:
    if not isinstance(value, list):
        return list(empty_default or [])
    normalized: list[str] = []
    seen = set()
    for item in value:
        current = str(item or "").strip().upper()
        if not current:
            continue
        if current == "ALL":
            return ["ALL"]
        if current in seen:
            continue
        seen.add(current)
        normalized.append(current)
    return normalized or list(empty_default or [])


def default_permissions_for_role(role: str) -> dict[str, bool]:
    return {"userManagement": role in {"SuperAdmin", "Admin"}}


def normalize_user_permissions(value: object, role: str) -> dict[str, bool]:
    defaults = default_permissions_for_role(role)
    if not isinstance(value, dict):
        return defaults
    normalized = dict(defaults)
    for key in defaults:
        if key in value:
            normalized[key] = bool(value.get(key))
    return normalized


def normalize_managed_departments_by_branch(value: object) -> dict[str, list[str]]:
    if not isinstance(value, dict):
        return {}
    normalized: dict[str, list[str]] = {}
    for branch, departments in value.items():
        branch_key = str(branch or "").strip().upper()
        if not branch_key:
            continue
        normalized_departments = normalize_scope_list(departments, empty_default=[])
        if normalized_departments:
            normalized[branch_key] = normalized_departments
    return normalized


def validate_supervisor_configuration(user: dict) -> None:
    if str(user.get("role", "")).strip() != "Supervisor":
        return
    managed_branches = normalize_scope_list(user.get("managedBranches"), empty_default=[])
    permissions = normalize_user_permissions(user.get("permissions"), "Supervisor")
    managed_departments = normalize_managed_departments_by_branch(
        user.get("managedDepartmentsByBranch")
    )
    assignable_permissions = ["userManagement"]
    if not managed_branches:
        raise ValueError("Supervisors must be assigned at least one branch.")
    if not any(bool(permissions.get(key, False)) for key in assignable_permissions):
        raise ValueError("Supervisors must have at least one module permission enabled.")
    for branch in managed_branches:
        if branch == "ALL":
            raise ValueError("Supervisors cannot be assigned to all branches.")
        branch_departments = managed_departments.get(branch, [])
        if not branch_departments:
            raise ValueError(f"{branch} needs at least one department assignment.")


















def parse_session_token() -> str:
    cookie_token = str(request.cookies.get(SESSION_COOKIE_NAME, "")).strip()
    return cookie_token


def validate_email(email: str, *, enforce_current_domain: bool = True) -> str:
    normalized = (email or "").strip().lower()
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", normalized):
        raise ValueError("A valid email address is required")
    settings = load_portal_settings_store()
    if enforce_current_domain and not normalized.endswith(settings["emailDomain"]):
        raise ValueError("Only official Bawjiase email addresses are allowed")
    return normalized


def normalize_required_text(value: object, field_label: str) -> str:
    normalized = str(value or "").strip()
    if not normalized:
        raise ValueError(f"{field_label} is required")
    return normalized


def normalize_phone(value: object) -> str:
    phone = str(value or "").strip()
    if not phone:
        return ""
    allowed = set("0123456789+ -()")
    if any(char not in allowed for char in phone):
        raise ValueError("Phone number can only contain numbers, spaces, +, -, and brackets")
    digits = "".join(char for char in phone if char.isdigit())
    if len(digits) < 7:
        raise ValueError("Phone number is too short")
    return phone


def normalize_portal_branch_name(value: object) -> str:
    branch = str(value or "").strip().upper()
    if not branch:
        raise ValueError("Branch is required")
    settings = load_portal_settings_store()
    valid = {str(item).strip().upper() for item in settings.get("branches", [])}
    if valid and branch not in valid:
        raise ValueError("Branch must be selected from Portal Control")
    return branch


def normalize_portal_department_name(value: object) -> str:
    department = str(value or "").strip().upper()
    if not department:
        raise ValueError("Department is required")
    settings = load_portal_settings_store()
    valid = {str(item).strip().upper() for item in settings.get("departments", [])}
    if valid and department not in valid:
        raise ValueError("Department must be selected from Portal Control")
    return department


def role_from_department(department: str) -> str:
    normalized = (department or "").strip().upper()
    if normalized == "IT":
        return "SuperAdmin"
    if normalized == "HR":
        return "Admin"
    if normalized == "FINANCE":
        return "FinanceOfficer"
    if normalized in {"AUDIT", "INTERNAL AUDIT", "COMPLIANCE"}:
        return "Auditor"
    return "Management"


def normalize_role(value: object, department: str = "") -> str:
    role = str(value or "").strip()
    aliases = {"HRAdmin": "Admin", "GeneralStaff": role_from_department(department), "Supervisor": "Management"}
    role = aliases.get(role, role)
    return role if role in ALLOWED_ROLES else role_from_department(department)


def is_global_manager(user: dict | None) -> bool:
    return bool(user) and str(user.get("role", "")).strip() in {"SuperAdmin", "Admin"}


def user_has_permission(user: dict, permission_key: str) -> bool:
    if str(user.get("role", "")).strip() == "BossAdmin":
        return permission_key == "portalControl"
    if is_global_manager(user):
        return True
    permissions = user.get("permissions")
    if not isinstance(permissions, dict):
        return False
    return bool(permissions.get(permission_key, False))


def now_ms() -> int:
    return int(time.time() * 1000)


def next_content_id(items: list[dict], floor: int = 1) -> int:
    return max([int(item.get("id", floor - 1) or floor - 1) for item in items] + [floor - 1]) + 1


def now_seconds() -> int:
    return int(time.time())


def legacy_hash_password(password: str) -> str:
    h = 0
    for char in password:
        h = ((31 * h) + ord(char)) & 0xFFFFFFFF
        if h & 0x80000000:
            h -= 0x100000000
    return str(abs(h))


def is_secure_password_hash(value: str) -> bool:
    return value.startswith("pbkdf2:") or value.startswith("scrypt:")


def hash_password_for_storage(password: str) -> str:
    return generate_password_hash(password)


def verify_password(stored_value: str, password: str) -> bool:
    if is_secure_password_hash(stored_value):
        try:
            return check_password_hash(stored_value, password)
        except ValueError:
            return False
    return stored_value == legacy_hash_password(password)


def validate_password_strength(password: str) -> None:
    if len(password) < 12:
        raise ValueError("Password must be at least 12 characters")
    if not any(char.isupper() for char in password) or not any(char.islower() for char in password):
        raise ValueError("Password must contain uppercase and lowercase letters")
    if not any(char.isdigit() for char in password):
        raise ValueError("Password must contain at least one number")
    if not any(not char.isalnum() for char in password):
        raise ValueError("Password must contain at least one symbol")


def login_attempt_key(email: str) -> str:
    return hashlib.sha256(str(email or "").strip().lower().encode("utf-8")).hexdigest()


def load_login_attempts() -> dict:
    raw = read_json_file(LOGIN_ATTEMPTS_STORE_PATH, {})
    return raw if isinstance(raw, dict) else {}


def failed_login_state(email: str) -> dict:
    entry = load_login_attempts().get(login_attempt_key(email), {})
    now = now_seconds()
    failures = [int(value) for value in entry.get("failures", []) if int(value) + LOGIN_ATTEMPT_WINDOW_SECONDS > now]
    return {"failedLoginAttempts": len(failures), "lockedUntil": int(entry.get("lockedUntil", 0) or 0) * 1000}


def login_lock_seconds(email: str) -> int:
    entry = load_login_attempts().get(login_attempt_key(email), {})
    return max(0, int(entry.get("lockedUntil", 0) or 0) - now_seconds())


def record_failed_login_attempt(email: str) -> int:
    store = load_login_attempts()
    key = login_attempt_key(email)
    now = now_seconds()
    entry = store.get(key, {}) if isinstance(store.get(key), dict) else {}
    failures = [int(value) for value in entry.get("failures", []) if int(value) + LOGIN_ATTEMPT_WINDOW_SECONDS > now]
    failures.append(now)
    locked_until = now + ACCOUNT_LOCKOUT_SECONDS if len(failures) >= MAX_LOGIN_ATTEMPTS else int(entry.get("lockedUntil", 0) or 0)
    store[key] = {"failures": failures[-MAX_LOGIN_ATTEMPTS:], "lockedUntil": locked_until, "updatedAt": now}
    atomic_write_json(LOGIN_ATTEMPTS_STORE_PATH, store)
    return max(0, locked_until - now)


def clear_failed_login_attempts(email: str) -> None:
    store = load_login_attempts()
    if store.pop(login_attempt_key(email), None) is not None:
        atomic_write_json(LOGIN_ATTEMPTS_STORE_PATH, store)


def atomic_write_json(path: str, payload) -> None:
    if os.path.abspath(path) in PERSISTENT_STORE_PATHS:
        DATABASE_STORE.save(os.path.basename(path), payload)
        return
    directory = os.path.dirname(path)
    fd, tmp_path = tempfile.mkstemp(prefix="tmp-", suffix=".json", dir=directory)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=True, indent=2)
        last_error = None
        for attempt in range(8):
            try:
                os.replace(tmp_path, path)
                last_error = None
                break
            except PermissionError as exc:
                last_error = exc
                time.sleep(0.05 * (attempt + 1))
        if last_error:
            raise last_error
        try:
            os.chmod(path, 0o600)
        except OSError:
            # Windows ACLs are inherited from the protected application data
            # directory; chmod is a best-effort hardening measure elsewhere.
            pass
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


def read_json_file(path: str, default):
    if os.path.abspath(path) in PERSISTENT_STORE_PATHS:
        return DATABASE_STORE.migrate_json_file(os.path.basename(path), path, default)
    if not os.path.exists(path):
        return default
    try:
        with open(path, "r", encoding="utf-8-sig") as handle:
            return json.load(handle)
    except Exception:
        return default


def normalize_user(raw: dict) -> dict:
    email = validate_email(str(raw.get("email", "")), enforce_current_domain=False)
    department = str(raw.get("department", "")).strip().upper()
    branch = str(raw.get("branch", "")).strip().upper()
    role = normalize_role(raw.get("role"), department)
    account_status = str(raw.get("accountStatus") or "").strip().lower()
    if account_status not in ACCOUNT_STATUSES:
        account_status = "disabled" if bool(raw.get("isArchived", False)) else "active" if bool(raw.get("isActive", True)) else "suspended"
    return {
        "id": str(raw.get("id", "")).strip(),
        "fullname": str(raw.get("fullname", "")).strip(),
        "phone": str(raw.get("phone", "")).strip(),
        "email": email,
        "role": role,
        "position": str(raw.get("position", "")).strip() or "Staff",
        "department": department,
        "branch": branch,
        "staffRecordId": str(raw.get("staffRecordId", "") or "").strip() or None,
        "imageFile": raw.get("imageFile"),
        "managedBranches": normalize_scope_list(
            raw.get("managedBranches"),
            empty_default=["ALL"] if role in {"SuperAdmin", "Admin"} else [],
        ),
        "managedDepartmentsByBranch": normalize_managed_departments_by_branch(
            raw.get("managedDepartmentsByBranch")
        ),
        "permissions": normalize_user_permissions(raw.get("permissions"), role),
        "accountStatus": account_status,
        "isActive": account_status == "active",
        "isVerified": bool(raw.get("isVerified", True)),
        "lastSeen": normalize_last_seen_ms(raw.get("lastSeen", 0)),
        "lastLogin": normalize_last_seen_ms(raw.get("lastLogin", 0)),
        "registrationTime": int(raw.get("registrationTime", 0) or 0),
        "isArchived": bool(raw.get("isArchived", False)),
        "mustChangePassword": bool(raw.get("mustChangePassword", False)),
    }


def load_user_store() -> list[dict]:
    raw = read_json_file(USERS_STORE_PATH, [])
    users_by_email = {}
    for default_user in INITIAL_USERS:
        normalized = normalize_user(default_user)
        users_by_email[normalized["email"]] = normalized
    if isinstance(raw, list):
        for item in raw:
            if isinstance(item, dict):
                try:
                    normalized = normalize_user(item)
                    users_by_email[normalized["email"]] = normalized
                except ValueError:
                    continue
    return list(users_by_email.values())


def save_user_store(users: list[dict]) -> None:
    normalized = []
    for user in users:
        try:
            normalized.append(normalize_user(user))
        except ValueError:
            continue
    atomic_write_json(USERS_STORE_PATH, normalized)


def find_user_by_email(users: list[dict], email: str):
    return next((user for user in users if user["email"] == email), None)


def find_user_by_id(users: list[dict], user_id: str):
    return next((user for user in users if user["id"] == user_id), None)


def load_presence_store() -> dict[str, int]:
    raw = read_json_file(PRESENCE_STORE_PATH, {})
    if not isinstance(raw, dict):
        return {}
    return {
        str(user_id): int(timestamp)
        for user_id, timestamp in raw.items()
        if str(user_id) and isinstance(timestamp, (int, float, str))
    }


def normalize_last_seen_ms(value: object) -> int:
    try:
        last_seen = int(value or 0)
    except (TypeError, ValueError):
        return 0
    if last_seen <= 0:
        return 0
    current = now_ms()
    if last_seen > current + 60_000:
        return 0
    return last_seen


def user_has_active_session(user_id: str) -> bool:
    normalized_user_id = str(user_id or "").strip()
    if not normalized_user_id:
        return False
    sessions = load_sessions()
    return any(str(session.get("userId", "")).strip() == normalized_user_id for session in sessions.values())


def presence_is_online(presence_timestamp: object, user_id: str | None = None) -> bool:
    value = normalize_presence_timestamp(int(presence_timestamp or 0))
    if value <= 0:
        return False
    return value >= now_seconds() - ONLINE_WINDOW_SECONDS


def set_user_last_seen(user_id: str, last_seen_ms: int | None) -> None:
    users = load_user_store()
    user = find_user_by_id(users, user_id)
    if not user:
        return
    user["lastSeen"] = normalize_last_seen_ms(last_seen_ms or 0)
    save_user_store(users)


def normalize_presence_timestamp(timestamp: int) -> int:
    value = int(timestamp or 0)
    if value <= 0:
        return 0
    # Older builds may have written milliseconds instead of seconds.
    if value > 10_000_000_000:
        value = value // 1000
    now = int(time.time())
    # Discard obviously broken future timestamps.
    if value > now + 60:
        return 0
    return value


def save_presence_store(store: dict[str, int]) -> None:
    atomic_write_json(PRESENCE_STORE_PATH, store)


def prune_presence(store: dict[str, int]) -> dict[str, int]:
    cutoff = int(time.time()) - PRESENCE_TTL_SECONDS
    return {
        str(user_id): normalize_presence_timestamp(timestamp)
        for user_id, timestamp in store.items()
        if str(user_id).strip()
        and normalize_presence_timestamp(timestamp) >= cutoff
    }


def serialize_user_with_presence(user: dict, presence: dict[str, int] | None = None) -> dict:
    presence_map = presence if presence is not None else prune_presence(load_presence_store())
    serialized = dict(user)
    user_id = str(serialized.get("id", "")).strip()
    last_seen = normalize_last_seen_ms(serialized.get("lastSeen", 0))
    serialized["lastSeen"] = last_seen
    serialized["isOnlineNow"] = presence_is_online(presence_map.get(user_id, 0), user_id)
    serialized["mfaEnabled"] = user_mfa_enabled(user_id)
    serialized.update(failed_login_state(serialized.get("email", "")))
    return serialized


def serialize_users_with_presence(users: list[dict]) -> list[dict]:
    presence = prune_presence(load_presence_store())
    save_presence_store(presence)
    return [serialize_user_with_presence(user, presence) for user in users]


def load_password_store() -> dict[str, str]:
    raw = read_json_file(PASSWORD_STORE_PATH, {})
    if not isinstance(raw, dict):
        return {}
    return {
        email.strip().lower(): password_hash
        for email, password_hash in raw.items()
        if isinstance(email, str) and isinstance(password_hash, str) and password_hash
    }


def save_password_store(store: dict[str, str]) -> None:
    normalized = {
        str(email).strip().lower(): str(password_hash).strip()
        for email, password_hash in store.items()
        if str(email).strip() and str(password_hash).strip()
    }
    atomic_write_json(PASSWORD_STORE_PATH, normalized)


def mfa_fernet(required: bool = False) -> Fernet | None:
    key = env_secret("MFA_ENCRYPTION_KEY") or env_secret("DATA_ENCRYPTION_KEY")
    if not key:
        if required:
            raise RuntimeError("MFA_ENCRYPTION_KEY or DATA_ENCRYPTION_KEY must be configured before MFA can be enabled")
        return None
    try:
        return Fernet(key.encode("ascii"))
    except (ValueError, TypeError) as exc:
        raise RuntimeError("The configured MFA encryption key is invalid") from exc


def mfa_configuration_available() -> bool:
    try:
        return mfa_fernet(required=False) is not None
    except RuntimeError:
        return False


def load_mfa_store() -> dict[str, dict]:
    raw = read_json_file(MFA_STORE_PATH, {})
    return raw if isinstance(raw, dict) else {}


def save_mfa_store(store: dict[str, dict]) -> None:
    atomic_write_json(MFA_STORE_PATH, store)


def encrypt_mfa_secret(secret: str) -> str:
    return mfa_fernet(required=True).encrypt(secret.encode("ascii")).decode("ascii")


def decrypt_mfa_secret(token: str) -> str:
    keys = [env_secret("MFA_ENCRYPTION_KEY") or env_secret("DATA_ENCRYPTION_KEY")]
    keys.extend(item.strip() for item in env_secret("MFA_ENCRYPTION_KEY_PREVIOUS").split(",") if item.strip())
    for key in keys:
        try:
            return Fernet(key.encode("ascii")).decrypt(str(token).encode("ascii")).decode("ascii")
        except (InvalidToken, ValueError, TypeError):
            continue
    raise RuntimeError("The MFA secret could not be decrypted")


def user_mfa_enabled(user_id: str) -> bool:
    entry = load_mfa_store().get(str(user_id), {})
    return bool(isinstance(entry, dict) and entry.get("enabled") and entry.get("secret"))


def verify_user_mfa(user_id: str, code: object) -> bool:
    store = load_mfa_store()
    entry = store.get(str(user_id), {})
    if not isinstance(entry, dict) or not entry.get("enabled") or not entry.get("secret"):
        return False
    supplied = str(code or "").strip().upper().replace(" ", "").replace("-", "")
    normalized = "".join(ch for ch in supplied if ch.isdigit())
    if len(normalized) == 6 and pyotp.TOTP(decrypt_mfa_secret(entry["secret"])).verify(normalized, valid_window=1):
        return True
    recovery_hash = hashlib.sha256(supplied.encode("utf-8")).hexdigest()
    recovery_hashes = list(entry.get("recoveryHashes") or [])
    if recovery_hash in recovery_hashes:
        recovery_hashes.remove(recovery_hash)
        entry["recoveryHashes"] = recovery_hashes
        store[str(user_id)] = entry
        save_mfa_store(store)
        return True
    return False


def ensure_boss_admin_account() -> None:
    """Provision the isolated platform-controller account from server secrets only."""
    email = str(os.getenv("BOSS_ADMIN_EMAIL", "") or "").strip().lower()
    password = env_secret("BOSS_ADMIN_INITIAL_PASSWORD")
    if not email or not password:
        return
    try:
        email = validate_email(email)
        validate_password_strength(password)
    except ValueError as exc:
        app.logger.error("Boss Admin provisioning skipped: %s", exc)
        return
    users = load_user_store()
    user = find_user_by_email(users, email)
    if user is None:
        user = normalize_user({
            "id": f"boss-admin-{now_ms()}",
            "fullname": str(os.getenv("BOSS_ADMIN_NAME", "Platform Controller") or "Platform Controller").strip(),
            "phone": "",
            "email": email,
            "role": "BossAdmin",
            "position": "Platform Engineer",
            "department": "IT",
            "branch": "HEAD OFFICE",
            "accountStatus": "active",
            "isVerified": True,
            "registrationTime": now_ms(),
            "mustChangePassword": str(os.getenv("BOSS_ADMIN_REQUIRE_PASSWORD_CHANGE", "true")).strip().lower() in {"1", "true", "yes"},
        })
        users.append(user)
        save_user_store(users)
    elif user.get("role") != "BossAdmin":
        app.logger.error("Boss Admin provisioning skipped: the configured email belongs to another account")
        return
    passwords = load_password_store()
    if not passwords.get(email):
        passwords[email] = hash_password_for_storage(password)
        save_password_store(passwords)


seed_password_store_if_needed()






def load_reset_tokens() -> dict[str, dict]:
    raw = read_json_file(RESET_TOKENS_PATH, {})
    if not isinstance(raw, dict):
        return {}
    current = int(time.time())
    tokens = {}
    for token, item in raw.items():
        if not isinstance(token, str) or not isinstance(item, dict):
            continue
        expires_at = int(item.get("expiresAt", 0) or 0)
        if expires_at <= current:
            continue
        try:
            email = validate_email(str(item.get("email", "")), enforce_current_domain=False)
        except ValueError:
            continue
        tokens[normalized_token_storage_key(token)] = {
            "email": email,
            "expiresAt": expires_at,
        }
    return tokens


def save_reset_tokens(store: dict[str, dict]) -> None:
    atomic_write_json(RESET_TOKENS_PATH, store)


SENSITIVE_STORE_FIELDS = {
    os.path.abspath(PAYROLL_BATCHES_STORE_PATH): {"basicSalary", "supervisionAllowance", "riskAllowance", "responsibilityAllowance", "entertainmentAllowance", "fuelTransportAllowance", "rentUtilityAllowance", "otherAllowances", "payeIncomeTax", "staffWelfare", "icuDues", "loans", "otherDeductions", "ssf", "esp", "pf", "totalIncome", "totalDeductions", "netSalary", "employerSsf", "employerPf", "email"},
    os.path.abspath(SALARY_HISTORY_STORE_PATH): {"oldValue", "newValue"},
    os.path.abspath(EMAIL_DELIVERY_STORE_PATH): {"recipientEmail", "errorMessage"},
}


def data_fernet(required: bool = False) -> Fernet | None:
    key = env_secret("DATA_ENCRYPTION_KEY")
    if not key:
        if required:
            raise RuntimeError("DATA_ENCRYPTION_KEY is required to read encrypted payroll data")
        return None
    try:
        return Fernet(key.encode("ascii"))
    except (ValueError, TypeError) as exc:
        raise RuntimeError("DATA_ENCRYPTION_KEY is not a valid Fernet key") from exc


def transform_sensitive_values(value, fields: set[str], encrypting: bool):
    if isinstance(value, dict):
        if "__encrypted__" in value:
            if encrypting:
                return value
            keys = [env_secret("DATA_ENCRYPTION_KEY")]
            keys.extend(item.strip() for item in env_secret("DATA_ENCRYPTION_KEY_PREVIOUS").split(",") if item.strip())
            for key in keys:
                try:
                    decrypted = Fernet(key.encode("ascii")).decrypt(str(value["__encrypted__"]).encode("ascii")).decode("utf-8")
                    return json.loads(decrypted)
                except (InvalidToken, ValueError, TypeError, json.JSONDecodeError):
                    continue
            raise RuntimeError("Encrypted payroll data could not be decrypted with the configured key ring")
        result = {}
        for key, item in value.items():
            if encrypting and key in fields and item is not None:
                token = data_fernet(required=True).encrypt(json.dumps(item, ensure_ascii=True).encode("utf-8")).decode("ascii")
                result[key] = {"__encrypted__": token, "keyVersion": env_secret("DATA_ENCRYPTION_KEY_VERSION") or "v1"}
            else:
                result[key] = transform_sensitive_values(item, fields, encrypting)
        return result
    if isinstance(value, list):
        return [transform_sensitive_values(item, fields, encrypting) for item in value]
    return value


def load_json_list_store(path: str) -> list[dict]:
    raw = read_json_file(path, [])
    fields = SENSITIVE_STORE_FIELDS.get(os.path.abspath(path))
    if fields:
        raw = transform_sensitive_values(raw, fields, False)
    return raw if isinstance(raw, list) else []


def save_json_list_store(path: str, items: list[dict]) -> None:
    fields = SENSITIVE_STORE_FIELDS.get(os.path.abspath(path))
    payload = transform_sensitive_values(items, fields, True) if fields and data_fernet() else items
    atomic_write_json(path, payload)


def mutate_json_list_store(path: str, callback):
    fields = SENSITIVE_STORE_FIELDS.get(os.path.abspath(path))
    def transform(raw):
        decoded = transform_sensitive_values(raw, fields, False) if fields else raw
        updated, result = callback(decoded if isinstance(decoded, list) else [])
        encoded = transform_sensitive_values(updated, fields, True) if fields and data_fernet() else updated
        return encoded, result
    return DATABASE_STORE.mutate(os.path.basename(path), [], transform)


def normalize_portal_branches(values) -> list[str]:
    seen = set()
    branches = []
    if not isinstance(values, list):
        values = []
    for value in values:
        branch = str(value or "").strip().upper()
        if not branch or branch in seen:
            continue
        seen.add(branch)
        branches.append(branch)
    return branches or list(DEFAULT_PORTAL_BRANCHES)


def normalize_portal_list(values, fallback: list[str], uppercase: bool = False) -> list[str]:
    seen = set()
    items = []
    if not isinstance(values, list):
        values = []
    for value in values:
        item = str(value or "").strip()
        if uppercase:
            item = item.upper()
        key = item.upper()
        if not item or key in seen:
            continue
        seen.add(key)
        items.append(item)
    return items or list(fallback)


def merge_missing_portal_defaults(values: list[str], defaults: list[str], uppercase: bool = False) -> list[str]:
    items = normalize_portal_list(values, defaults, uppercase)
    seen = {str(item).strip().upper() for item in items}
    for value in defaults:
        item = str(value or "").strip()
        if uppercase:
            item = item.upper()
        key = item.upper()
        if item and key not in seen:
            items.append(item)
            seen.add(key)
    return items


def normalize_email_domain(value) -> str:
    domain = str(value or "").strip().lower()
    if not domain:
        return OFFICIAL_EMAIL_DOMAIN
    domain = domain.replace(" ", "")
    if not domain.startswith("@"):
        domain = f"@{domain}"
    return domain


def normalize_positive_number(value, fallback: int) -> int:
    try:
        number = int(float(value))
    except (TypeError, ValueError):
        return fallback
    return number if number > 0 else fallback


def normalize_percentage(value: object, fallback: float) -> float:
    try:
        number = round(float(value), 4)
    except (TypeError, ValueError):
        return fallback
    return number if 0 <= number <= 100 else fallback


def normalize_money_limit(value: object, fallback: float) -> float:
    try:
        number = round(float(value), 2)
    except (TypeError, ValueError):
        return fallback
    return number if 1 <= number <= 100_000_000 else fallback


def normalize_effective_month(value: object, fallback: str = "2000-01") -> str:
    month = str(value or "").strip()
    if re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", month):
        return month
    return fallback


def normalize_contribution_rates(value: object) -> dict[str, float]:
    incoming = value if isinstance(value, dict) else {}
    fallback = DEFAULT_PORTAL_SETTINGS["contributionRates"]
    return {
        key: normalize_percentage(incoming.get(key), default)
        for key, default in fallback.items()
    }


def normalize_payroll_validation_rules(value: object) -> dict[str, float]:
    incoming = value if isinstance(value, dict) else {}
    fallback = DEFAULT_PORTAL_SETTINGS["payrollValidationRules"]
    return {
        "maxBasicSalary": normalize_money_limit(incoming.get("maxBasicSalary"), fallback["maxBasicSalary"]),
        "maxOtherAmount": normalize_money_limit(incoming.get("maxOtherAmount"), fallback["maxOtherAmount"]),
        "deductionWarningPercent": normalize_percentage(incoming.get("deductionWarningPercent"), fallback["deductionWarningPercent"]),
    }


def normalize_contribution_rate_history(value: object) -> list[dict]:
    if not isinstance(value, list):
        return []
    by_month: dict[str, dict] = {}
    for item in value:
        if not isinstance(item, dict):
            continue
        month = normalize_effective_month(item.get("effectiveMonth"), "")
        if not month:
            continue
        by_month[month] = {
            "effectiveMonth": month,
            "rates": normalize_contribution_rates(item.get("rates")),
            "changedAt": int(item.get("changedAt", 0) or 0),
            "changedBy": str(item.get("changedBy") or "System"),
        }
    return sorted(by_month.values(), key=lambda item: item["effectiveMonth"])


def contribution_rate_profile_for_period(period: str, settings: dict | None = None) -> dict:
    current = settings or load_portal_settings_store()
    target = normalize_effective_month(period, datetime.now().strftime("%Y-%m"))
    profile = {
        "effectiveMonth": "2000-01",
        "rates": normalize_contribution_rates(None),
    }
    history = normalize_contribution_rate_history(current.get("contributionRateHistory"))
    current_item = {
        "effectiveMonth": normalize_effective_month(current.get("contributionRateEffectiveMonth")),
        "rates": normalize_contribution_rates(current.get("contributionRates")),
    }
    history = [item for item in history if item["effectiveMonth"] != current_item["effectiveMonth"]] + [current_item]
    for item in sorted(history, key=lambda value: value["effectiveMonth"]):
        if item["effectiveMonth"] <= target:
            profile = {"effectiveMonth": item["effectiveMonth"], "rates": item["rates"]}
    return profile


def load_portal_settings_store() -> dict:
    raw = read_json_file(PORTAL_SETTINGS_STORE_PATH, {})
    if not isinstance(raw, dict):
        raw = {}
    def finance_text(name: str) -> str:
        return str(raw.get(name) or DEFAULT_PORTAL_SETTINGS[name]).strip()
    def labels(name: str) -> dict:
        fallback = DEFAULT_PORTAL_SETTINGS[name]
        incoming = raw.get(name) if isinstance(raw.get(name), dict) else {}
        return {key: str(incoming.get(key) or value).strip() for key, value in fallback.items()}
    return {
        "bankName": finance_text("bankName"),
        "shortBankName": str(raw.get("shortBankName") or DEFAULT_PORTAL_SETTINGS["shortBankName"]).strip(),
        "portalName": finance_text("portalName"),
        "emailDomain": normalize_email_domain(raw.get("emailDomain")),
        "branches": normalize_portal_branches(raw.get("branches")),
        "departments": merge_missing_portal_defaults(raw.get("departments"), DEFAULT_PORTAL_DEPARTMENTS, True),
        "loginSubtitle": finance_text("loginSubtitle"),
        "loginButtonText": str(raw.get("loginButtonText") or DEFAULT_PORTAL_SETTINGS["loginButtonText"]),
        "authorizedAccessText": str(raw.get("authorizedAccessText") or DEFAULT_PORTAL_SETTINGS["authorizedAccessText"]),
        "portalControlPassword": str(raw.get("portalControlPassword") or DEFAULT_PORTAL_SETTINGS["portalControlPassword"]),
        "itAccessCode": str(raw.get("itAccessCode") or DEFAULT_PORTAL_SETTINGS["itAccessCode"]),
        "hrAccessCode": str(raw.get("hrAccessCode") or DEFAULT_PORTAL_SETTINGS["hrAccessCode"]),
        "sessionDays": normalize_positive_number(raw.get("sessionDays"), DEFAULT_PORTAL_SETTINGS["sessionDays"]),
        "sessionTimeoutMinutes": normalize_positive_number(raw.get("sessionTimeoutMinutes"), DEFAULT_PORTAL_SETTINGS["sessionTimeoutMinutes"]),
        "restrictPayslipDownloads": bool(raw.get("restrictPayslipDownloads", DEFAULT_PORTAL_SETTINGS["restrictPayslipDownloads"])),
        "approvedPayrollOnly": True,
        "requirePrivilegedMfa": bool(raw.get("requirePrivilegedMfa", True)),
        "bankAddress": str(raw.get("bankAddress") or DEFAULT_PORTAL_SETTINGS["bankAddress"]).strip(),
        "bankLogo": str(raw.get("bankLogo") or DEFAULT_PORTAL_SETTINGS["bankLogo"]).strip(),
        "authorizedSignature": str(raw.get("authorizedSignature") or "").strip(),
        "emailFooter": finance_text("emailFooter"),
        "payslipTitle": str(raw.get("payslipTitle") or DEFAULT_PORTAL_SETTINGS["payslipTitle"]).strip(),
        "confidentialityNote": str(raw.get("confidentialityNote") or DEFAULT_PORTAL_SETTINGS["confidentialityNote"]).strip(),
        "allowanceLabels": labels("allowanceLabels"), "deductionLabels": labels("deductionLabels"),
        "employerContributionLabels": labels("employerContributionLabels"),
        "pdfPasswordRule": str(raw.get("pdfPasswordRule") or DEFAULT_PORTAL_SETTINGS["pdfPasswordRule"]).strip().lower(),
        "emailProvider": str(raw.get("emailProvider") or DEFAULT_PORTAL_SETTINGS["emailProvider"]).strip().lower(),
        "smtpServer": str(raw.get("smtpServer") or "").strip(), "smtpPort": normalize_positive_number(raw.get("smtpPort"), 465),
        "smtpSecurity": str(raw.get("smtpSecurity") or "ssl").strip().lower(), "smtpUsername": str(raw.get("smtpUsername") or "").strip(),
        "smtpSender": str(raw.get("smtpSender") or "").strip(),
        "defaultEmailSubject": str(raw.get("defaultEmailSubject") or DEFAULT_PORTAL_SETTINGS["defaultEmailSubject"]),
        "defaultEmailBody": str(raw.get("defaultEmailBody") or DEFAULT_PORTAL_SETTINGS["defaultEmailBody"]),
        "payrollApprovalRequired": bool(raw.get("payrollApprovalRequired", True)),
        "contributionRates": normalize_contribution_rates(raw.get("contributionRates")),
        "contributionRateEffectiveMonth": normalize_effective_month(raw.get("contributionRateEffectiveMonth")),
        "contributionRateHistory": normalize_contribution_rate_history(raw.get("contributionRateHistory")),
        "payrollValidationRules": normalize_payroll_validation_rules(raw.get("payrollValidationRules")),
        "allowLightMode": bool(raw.get("allowLightMode", True)), "allowDarkMode": bool(raw.get("allowDarkMode", True)),
        "defaultTheme": str(raw.get("defaultTheme") or "light").strip().lower(),
        "inactiveStaffInHistoricalReports": bool(raw.get("inactiveStaffInHistoricalReports", True)),
        "requireTestEmail": bool(raw.get("requireTestEmail", True)),
        "backupSchedule": str(raw.get("backupSchedule") or "weekly").strip().lower(),
        "auditRetentionYears": normalize_positive_number(raw.get("auditRetentionYears"), 7),
        "payrollRetentionYears": normalize_positive_number(raw.get("payrollRetentionYears"), 7),
        "deliveryRetentionYears": normalize_positive_number(raw.get("deliveryRetentionYears"), 3),
        "passwordResetMinutes": normalize_positive_number(raw.get("passwordResetMinutes"), DEFAULT_PORTAL_SETTINGS["passwordResetMinutes"]),
        "dashboardLabel": str(raw.get("dashboardLabel") or DEFAULT_PORTAL_SETTINGS["dashboardLabel"]),
        "profileLabel": str(raw.get("profileLabel") or DEFAULT_PORTAL_SETTINGS["profileLabel"]),
        "activeStaffLabel": str(raw.get("activeStaffLabel") or DEFAULT_PORTAL_SETTINGS["activeStaffLabel"]),
        "branchCoverageLabel": str(raw.get("branchCoverageLabel") or DEFAULT_PORTAL_SETTINGS["branchCoverageLabel"]),
        "openOperationsLabel": str(raw.get("openOperationsLabel") or DEFAULT_PORTAL_SETTINGS["openOperationsLabel"]),
        "resolutionRateLabel": str(raw.get("resolutionRateLabel") or DEFAULT_PORTAL_SETTINGS["resolutionRateLabel"]),
        "updatedAt": int(raw.get("updatedAt", 0) or 0),
        "updatedBy": raw.get("updatedBy") if isinstance(raw.get("updatedBy"), dict) else None,
    }


def save_portal_settings_store(settings: dict) -> None:
    atomic_write_json(PORTAL_SETTINGS_STORE_PATH, settings)


ensure_boss_admin_account()




def request_ip_address() -> str:
    forwarded_for = request.headers.get("X-Forwarded-For", "")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip() or "unknown"
    return str(request.remote_addr or "unknown")


def load_audit_logs_store() -> list[dict]:
    items = load_json_list_store(AUDIT_LOGS_STORE_PATH)
    normalized = []
    for item in items:
        try:
            target_text = str(item.get("target", "")).strip()
            details = item.get("details") if isinstance(item.get("details"), dict) else {}
            if not details and target_text.startswith("{"):
                try:
                    parsed = json.loads(target_text)
                    details = parsed if isinstance(parsed, dict) else {}
                except json.JSONDecodeError:
                    details = {}
            normalized.append(
                {
                    "id": int(item.get("id", 0) or 0),
                    "actorId": str(item.get("actorId", "") or "system"),
                    "actorName": str(item.get("actorName", "") or "System"),
                    "action": str(item.get("action", "")).strip(),
                    "target": target_text,
                    "details": details,
                    "oldValue": item.get("oldValue", details.get("oldValue", details.get("before", details.get("beforeEmail")))),
                    "newValue": item.get("newValue", details.get("newValue", details.get("after", details.get("email")))),
                    "ipAddress": str(item.get("ipAddress", "") or "unknown"),
                    "timestamp": int(item.get("timestamp", 0) or 0),
                }
            )
        except Exception:
            continue
    return [
        item
        for item in normalized
        if item["id"] > 0 and item["action"] and item["target"] and item["timestamp"] > 0
    ]


def save_audit_logs_store(items: list[dict]) -> None:
    save_json_list_store(AUDIT_LOGS_STORE_PATH, items[:1000])


def record_audit_log(
    actor: dict | None,
    action: str,
    target: object,
    ip_address: str | None = None,
) -> dict:
    logs = load_audit_logs_store()
    target_text = (
        target
        if isinstance(target, str)
        else json.dumps(target, ensure_ascii=True, sort_keys=True)
    )
    entry = {
        "id": next_content_id(logs, floor=1),
        "actorId": str(actor.get("id", "system") if actor else "system"),
        "actorName": str(actor.get("fullname", "System") if actor else "System"),
        "action": str(action or "").strip().upper(),
        "target": str(target_text or "").strip(),
        "details": target if isinstance(target, dict) else {},
        "oldValue": target.get("oldValue", target.get("before", target.get("beforeEmail"))) if isinstance(target, dict) else None,
        "newValue": target.get("newValue", target.get("after", target.get("email"))) if isinstance(target, dict) else None,
        "ipAddress": ip_address or request_ip_address(),
        "timestamp": now_ms(),
    }
    logs.insert(0, entry)
    save_audit_logs_store(logs)
    return entry




def staff_audit_target(user: dict, extra: dict | None = None) -> dict:
    target = {
        "staffId": str(user.get("id", "")),
        "staffName": str(user.get("fullname", "")),
        "email": str(user.get("email", "")),
        "role": str(user.get("role", "")),
        "department": str(user.get("department", "")),
        "branch": str(user.get("branch", "")),
    }
    if extra:
        target.update(extra)
    return target














def load_sessions() -> dict[str, dict]:
    raw = read_json_file(SESSIONS_STORE_PATH, {})
    if not isinstance(raw, dict):
        return {}
    current = now_seconds()
    sessions = {}
    idle_timeout = int(load_portal_settings_store()["sessionTimeoutMinutes"]) * 60
    for token, item in raw.items():
        if not isinstance(token, str) or not isinstance(item, dict):
            continue
        user_id = str(item.get("userId", "")).strip()
        expires_at = int(item.get("expiresAt", 0) or 0)
        last_activity_at = int(item.get("lastActivityAt", current) or current)
        created_at = int(item.get("createdAt", last_activity_at) or last_activity_at)
        if not user_id or expires_at <= current or last_activity_at + idle_timeout <= current:
            continue
        sessions[normalized_token_storage_key(token)] = {
            "userId": user_id,
            "expiresAt": expires_at,
            "lastActivityAt": last_activity_at,
            "createdAt": created_at,
            "csrfHash": str(item.get("csrfHash", "")),
        }
    return sessions


def save_sessions(store: dict[str, dict]) -> None:
    atomic_write_json(SESSIONS_STORE_PATH, store)


def issue_session(user_id: str) -> tuple[str, str]:
    sessions = load_sessions()
    token = secrets.token_urlsafe(32)
    csrf_token = secrets.token_urlsafe(32)
    current = now_seconds()
    sessions[token_storage_key(token)] = {
        "userId": user_id,
        "expiresAt": current + int(load_portal_settings_store()["sessionDays"]) * 24 * 60 * 60,
        "lastActivityAt": current,
        "createdAt": current,
        "csrfHash": token_storage_key(csrf_token),
    }
    save_sessions(sessions)
    return token, csrf_token


def session_cookie_secure() -> bool:
    return request.is_secure or str(request.headers.get("X-Forwarded-Proto", "")).lower() == "https" or str(os.getenv("FORCE_HTTPS", "false")).lower() in {"1", "true", "yes"}


def attach_session_cookies(response, token: str, csrf_token: str):
    max_age = int(load_portal_settings_store()["sessionDays"]) * 24 * 60 * 60
    common = {"secure": session_cookie_secure(), "samesite": "Strict", "path": "/", "max_age": max_age}
    response.set_cookie(SESSION_COOKIE_NAME, token, httponly=True, **common)
    response.set_cookie(CSRF_COOKIE_NAME, csrf_token, httponly=False, **common)
    return response


def clear_session_cookies(response):
    response.delete_cookie(SESSION_COOKIE_NAME, path="/", secure=session_cookie_secure(), samesite="Strict")
    response.delete_cookie(CSRF_COOKIE_NAME, path="/", secure=session_cookie_secure(), samesite="Strict")
    return response


def revoke_session(token: str) -> None:
    sessions = load_sessions()
    if token in sessions or token_storage_key(token) in sessions:
        sessions.pop(token, None)
        sessions.pop(token_storage_key(token), None)
        save_sessions(sessions)


def revoke_user_sessions(user_id: str) -> None:
    sessions = load_sessions()
    filtered = {
        token: session
        for token, session in sessions.items()
        if session.get("userId") != user_id
    }
    if filtered != sessions:
        save_sessions(filtered)

def require_authenticated_user():
    token = parse_session_token()
    if not token:
        return None, None, (jsonify({"error": "Authentication required"}), 401)
    sessions = load_sessions()
    stored_key = token_storage_key(token) if token_storage_key(token) in sessions else token
    session = sessions.get(stored_key)
    if not session:
        return None, None, (jsonify({"error": "Invalid or expired session"}), 401)
    users = load_user_store()
    user = find_user_by_id(users, session["userId"])
    if not user or user["isArchived"] or not user["isActive"] or not user["isVerified"]:
        revoke_session(token)
        return None, None, (jsonify({"error": "Invalid or expired session"}), 401)
    session["lastActivityAt"] = now_seconds()
    sessions[stored_key] = session
    save_sessions(sessions)
    return token, user, None


def require_portal_controller():
    token, user, error = require_authenticated_user()
    if error:
        return token, user, error
    if user.get("role") != "BossAdmin":
        return token, user, (jsonify({"error": "Boss Admin access required"}), 403)
    return token, user, None


def require_notification_viewer():
    token, user, error = require_authenticated_user()
    if error:
        return token, user, error
    if user.get("role") == "BossAdmin":
        return token, user, (jsonify({"error": "Bank activity is not available to the platform controller"}), 403)
    return token, user, None


def require_staff_manager():
    token, user, error = require_authenticated_user()
    if error:
        return token, user, error
    if user["role"] not in {"SuperAdmin", "Admin"} and not user_has_permission(user, "userManagement"):
        return token, user, (jsonify({"error": "Admin access required"}), 403)
    return token, user, None


def require_staff_records_manager():
    token, user, error = require_authenticated_user()
    if error:
        return token, user, error
    if user["role"] not in {"SuperAdmin", "Admin", "FinanceOfficer"}:
        return token, user, (jsonify({"error": "Finance or Admin access required"}), 403)
    return token, user, None


def require_payroll_viewer():
    token, user, error = require_authenticated_user()
    if error:
        return token, user, error
    if user["role"] not in {"SuperAdmin", "FinanceOfficer", "FinanceApprover"}:
        return token, user, (jsonify({"error": "Payroll access required"}), 403)
    return token, user, None


def require_payroll_preparer():
    token, user, error = require_authenticated_user()
    if error:
        return token, user, error
    if user["role"] not in {"SuperAdmin", "FinanceOfficer"}:
        return token, user, (jsonify({"error": "Finance preparation access required"}), 403)
    return token, user, None


def require_payroll_approver():
    token, user, error = require_authenticated_user()
    if error:
        return token, user, error
    if user["role"] not in {"SuperAdmin", "FinanceApprover"}:
        return token, user, (jsonify({"error": "Finance approval access required"}), 403)
    return token, user, None


def require_module_manager(permission_key: str):
    token, user, error = require_authenticated_user()
    if error:
        return token, user, error
    if not user_has_permission(user, permission_key):
        return token, user, (jsonify({"error": "Admin access required"}), 403)
    return token, user, None




def build_reset_url(base_url: str, token: str) -> str:
    parsed = urlparse(base_url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("A valid reset page URL is required")
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query["token"] = token
    return urlunparse(parsed._replace(query=urlencode(query)))


def mail_config() -> dict[str, str | int]:
    settings = load_portal_settings_store()
    provider = str(settings.get("emailProvider") or "smtp").strip().lower()
    presets = {
        "microsoft365": ("smtp.office365.com", 587, "starttls"),
        "gmail": ("smtp.gmail.com", 465, "ssl"),
        "sendgrid": ("smtp.sendgrid.net", 587, "starttls"),
    }
    preset_server, preset_port, preset_security = presets.get(provider, ("", 465, "ssl"))
    configured_server = str(settings.get("smtpServer") or "").strip()
    required = {
        "MAIL_SERVER": os.getenv("MAIL_SERVER", "") or configured_server or preset_server,
        "MAIL_USERNAME": os.getenv("MAIL_USERNAME", "") or settings.get("smtpUsername", "") or ("apikey" if provider == "sendgrid" else ""),
        "MAIL_PASSWORD": env_secret("MAIL_PASSWORD"),
        "MAIL_DEFAULT_SENDER": os.getenv("MAIL_DEFAULT_SENDER", "") or settings.get("smtpSender", ""),
    }
    missing = [key for key, value in required.items() if not value]
    if missing:
        raise RuntimeError(f"Missing mail configuration: {', '.join(missing)}")
    return {
        **required,
        "MAIL_PORT": int(os.getenv("MAIL_PORT", "") or (settings.get("smtpPort") if configured_server else preset_port)),
        "MAIL_SECURITY": str(os.getenv("MAIL_SECURITY", "") or (settings.get("smtpSecurity") if configured_server else preset_security)).strip().lower(),
    }


def send_mail(to_email: str, subject: str, text_body: str, html_body: str, attachment: tuple[str, bytes, str] | None = None, delivery_id: str = "") -> str:
    cfg = mail_config()
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = str(cfg["MAIL_DEFAULT_SENDER"])
    msg["To"] = to_email
    message_id = make_msgid(domain=load_portal_settings_store()["emailDomain"].lstrip("@"))
    msg["Message-ID"] = message_id
    if delivery_id:
        msg["X-BCB-Delivery-ID"] = delivery_id
    msg.set_content(text_body)
    msg.add_alternative(html_body, subtype="html")
    if attachment:
        filename, content, mime_type = attachment
        maintype, subtype = (mime_type.split("/", 1) + ["octet-stream"])[:2]
        msg.add_attachment(content, maintype=maintype, subtype=subtype, filename=filename)

    smtp_class = smtplib.SMTP_SSL if cfg["MAIL_SECURITY"] == "ssl" else smtplib.SMTP
    with smtp_class(str(cfg["MAIL_SERVER"]), int(cfg["MAIL_PORT"]), timeout=30) as smtp:
        if cfg["MAIL_SECURITY"] == "starttls":
            smtp.starttls()
        smtp.login(str(cfg["MAIL_USERNAME"]), str(cfg["MAIL_PASSWORD"]))
        smtp.send_message(msg)
    return message_id




def send_password_reset_link_email(email: str, reset_url: str) -> None:
    text_body = (
        "Dear Staff,\n\n"
        "Use the link below to reset your Bawjiase Staff Portal password:\n"
        f"{reset_url}\n\n"
        "This link expires in 30 minutes.\n\n"
        "Bawjiase Community Bank PLC"
    )
    html_body = f"""
    <html>
      <body style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6;">
        <div style="max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px;">
          <h2 style="color: #15803d; text-align: center;">Password Reset</h2>
          <p>Dear Staff,</p>
          <p>Use the button below to reset your Bawjiase Staff Portal password.</p>
          <p style="text-align: center; margin: 28px 0;">
            <a href="{reset_url}" style="background: #15803d; color: #ffffff; padding: 12px 22px; border-radius: 8px; text-decoration: none; font-weight: 700;">Reset Password</a>
          </p>
          <p>This link expires in 30 minutes.</p>
          <p style="font-weight: 700; color: #4b5563;">Bawjiase Community Bank PLC</p>
        </div>
      </body>
    </html>
    """
    send_mail(email, "Bawjiase Staff Portal - Password Reset", text_body, html_body)


def portal_public_url() -> str:
    return os.getenv("PORTAL_PUBLIC_URL", "").strip().rstrip("/")


def build_portal_link(path: str) -> str | None:
    base = portal_public_url()
    if not base:
        return None
    return f"{base}{path if path.startswith('/') else f'/{path}'}"


def eligible_users_for_visibility(visibility: str, department: str | None = None) -> list[dict]:
    normalized_visibility = str(visibility or "General").strip()
    normalized_department = str(department or "").strip().upper()
    users = load_user_store()
    eligible = [
        user
        for user in users
        if user["isActive"] and user["isVerified"] and not user["isArchived"]
    ]
    if normalized_visibility == "Department" and normalized_department:
        return [
            user
            for user in eligible
            if str(user.get("department", "")).strip().upper() == normalized_department
        ]
    return eligible


def item_branch_scope(item: dict) -> list[str]:
    return normalize_scope_list(item.get("branchScope"), empty_default=["ALL"])


def item_department_scope(item: dict) -> list[str]:
    derived_department = str(item.get("department", "")).strip().upper()
    empty_default = [derived_department] if derived_department and str(item.get("visibility", "General")).strip() == "Department" else ["ALL"]
    return normalize_scope_list(item.get("departmentScope"), empty_default=empty_default)


def value_in_scope(scope: list[str], current_value: str) -> bool:
    if "ALL" in scope:
        return True
    return str(current_value or "").strip().upper() in scope


def branch_allowed_for_user(user: dict, branch: str) -> bool:
    if is_global_manager(user):
        return True
    managed_branches = normalize_scope_list(user.get("managedBranches"), empty_default=[])
    return value_in_scope(managed_branches, branch)


def department_allowed_for_user(user: dict, branch: str, department: str) -> bool:
    if is_global_manager(user):
        return True
    managed = normalize_managed_departments_by_branch(user.get("managedDepartmentsByBranch"))
    branch_departments = managed.get(str(branch or "").strip().upper())
    if not branch_departments:
        return False
    return value_in_scope(branch_departments, department)


def can_manage_scope(user: dict, branch_scope: list[str], department_scope: list[str]) -> bool:
    if is_global_manager(user):
        return True
    if "ALL" in branch_scope:
        return False
    normalized_departments = department_scope if department_scope else ["ALL"]
    managed_departments = normalize_managed_departments_by_branch(
        user.get("managedDepartmentsByBranch")
    )
    for branch in [item for item in branch_scope if item != "ALL"]:
        if not branch_allowed_for_user(user, branch):
            return False
        branch_managed_departments = managed_departments.get(branch, [])
        for department in normalized_departments:
            if department == "ALL":
                if "ALL" not in branch_managed_departments:
                    return False
            elif not department_allowed_for_user(user, branch, department):
                return False
    return True


def is_assigned_supervisor(user: dict | None) -> bool:
    if not user or str(user.get("role", "")).strip() != "Supervisor":
        return False
    return bool(normalize_scope_list(user.get("managedBranches"), empty_default=[]))


def can_view_staff_record(viewer: dict, staff_user: dict) -> bool:
    if is_global_manager(viewer) or user_has_permission(viewer, "userManagement"):
        return True
    if str(viewer.get("id")) == str(staff_user.get("id")):
        return True
    if not is_assigned_supervisor(viewer):
        return False
    return branch_allowed_for_user(viewer, staff_user.get("branch", ""))


def manageable_scope_message(user: dict) -> str:
    if is_global_manager(user):
        return "You can manage all branches and departments."
    managed_branches = normalize_scope_list(user.get("managedBranches"), empty_default=[])
    managed_departments = normalize_managed_departments_by_branch(
        user.get("managedDepartmentsByBranch")
    )
    if not managed_branches:
        return "No supervisor branch scope is assigned to your account."
    parts = []
    for branch in managed_branches:
        departments = managed_departments.get(branch, [])
        label = "all departments" if "ALL" in departments else ", ".join(departments)
        parts.append(f"{branch} > {label or 'no departments'}")
    return f"You can only manage: {'; '.join(parts)}."




def scoped_access_denial(user: dict):
    return jsonify({"error": manageable_scope_message(user)}), 403


def eligible_users_for_item(item: dict) -> list[dict]:
    users = load_user_store()
    eligible = [
        user
        for user in users
        if user["isActive"] and user["isVerified"] and not user["isArchived"]
    ]
    branch_scope = item_branch_scope(item)
    department_scope = item_department_scope(item)
    return [
        user
        for user in eligible
        if value_in_scope(branch_scope, str(user.get("branch", "")))
        and value_in_scope(department_scope, str(user.get("department", "")))
    ]


def user_can_access_item(user: dict, item: dict) -> bool:
    if bool(item.get("isArchived", False)):
        return False
    return value_in_scope(item_branch_scope(item), str(user.get("branch", ""))) and value_in_scope(
        item_department_scope(item), str(user.get("department", ""))
    )


def filter_items_for_user(items: list[dict], user: dict) -> list[dict]:
    return [item for item in items if user_can_access_item(user, item)]


def user_can_manage_item(user: dict, item: dict, permission_key: str) -> bool:
    if is_global_manager(user):
        return True
    if not user_has_permission(user, permission_key):
        return False
    return can_manage_scope(user, item_branch_scope(item), item_department_scope(item))


def create_notifications_for_users(
    users: list[dict],
    *,
    kind: str,
    title: str,
    message: str,
    link_to: str | None,
) -> int:
    items = load_json_list_store(NOTIFICATIONS_STORE_PATH)
    created_at = now_ms()
    count = 0
    for user in users:
        items.insert(
            0,
            {
                "id": next_content_id(items, floor=1),
                "userId": user["id"],
                "kind": kind,
                "title": title,
                "message": message,
                "linkTo": link_to,
                "isRead": False,
                "createdAt": created_at,
            },
        )
        count += 1
    save_json_list_store(NOTIFICATIONS_STORE_PATH, items)
    return count


def notify_active_managers(*, kind: str, title: str, message: str, link_to: str | None) -> int:
    users = [
        user
        for user in load_user_store()
        if user.get("isActive")
        and user.get("isVerified")
        and not user.get("isArchived")
        and (
            str(user.get("role")) in {"SuperAdmin", "Admin"}
            or user_has_permission(user, "userManagement")
        )
    ]
    return create_notifications_for_users(
        users,
        kind=kind,
        title=title,
        message=message,
        link_to=link_to,
    )






























def is_local_upload_ref(value: object, filename: str) -> bool:
    return str(value or "").strip() == f"LOCAL:{filename}"




def find_user_by_local_image(filename: str) -> dict | None:
    users = load_user_store()
    return next(
        (
            user
            for user in users
            if is_local_upload_ref(user.get("imageFile"), filename)
        ),
        None,
    )






def remove_uploaded_file_if_unused(filename: str) -> None:
    if not filename:
        return
    profile_match = find_user_by_local_image(filename)
    if profile_match:
        return
    file_path = os.path.join(UPLOADS_DIR, filename)
    if os.path.isfile(file_path):
        os.remove(file_path)




def handle_options():
    if request.method == "OPTIONS":
        return ("", 204)
    return None


def upload_public_url(filename: str) -> str:
    return f"/uploads/{filename}"


def scan_uploaded_file(path: str) -> None:
    scanner = str(os.getenv("MALWARE_SCANNER_COMMAND", "")).strip()
    if not scanner:
        if str(os.getenv("REQUIRE_MALWARE_SCANNER", "false")).strip().lower() in {"1", "true", "yes"}:
            raise ValueError("The upload security scanner is required but not configured")
        return
    try:
        result = subprocess.run([scanner, "--no-summary", path], capture_output=True, text=True, timeout=30, check=False)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise ValueError("The upload security scanner is unavailable") from exc
    if result.returncode != 0:
        raise ValueError("The uploaded file did not pass the security scan")


def save_uploaded_media(file_storage, kind: str) -> dict:
    if not file_storage or not getattr(file_storage, "filename", ""):
        raise ValueError("A file is required")
    original_name = secure_filename(str(file_storage.filename))
    if not original_name:
        raise ValueError("Invalid file name")
    ext = os.path.splitext(original_name)[1].lower()
    if kind in {"profile", "branding"}:
        allowed = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
    else:
        raise ValueError("Unsupported upload type")
    if ext not in allowed:
        raise ValueError("Unsupported file type")
    filename = f"{kind}-{secrets.token_hex(8)}{ext}"
    target_path = os.path.join(UPLOADS_DIR, filename)
    file_storage.save(target_path)
    try:
        scan_uploaded_file(target_path)
        with PILImage.open(target_path) as uploaded_image:
            uploaded_image.verify()
        with PILImage.open(target_path) as uploaded_image:
            detected_format = str(uploaded_image.format or "").upper()
            allowed_formats = {"JPEG", "PNG", "WEBP", "GIF"}
            if detected_format not in allowed_formats or uploaded_image.width * uploaded_image.height > 25_000_000:
                raise ValueError("Uploaded image format or dimensions are not allowed")
    except (UnidentifiedImageError, OSError, ValueError, PILImage.DecompressionBombError) as exc:
        try:
            os.remove(target_path)
        except OSError:
            pass
        raise ValueError("Uploaded file content is not a valid image") from exc
    return {
        "filename": filename,
        "url": upload_public_url(filename),
        "contentType": {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp", "GIF": "image/gif"}[detected_format],
    }


@app.route("/api/health", methods=["GET"])
def health():
    start_payslip_worker()
    database = DATABASE_STORE.health()
    deliveries = load_json_list_store(EMAIL_DELIVERY_STORE_PATH)
    queued = len([item for item in deliveries if item.get("status") in {"Pending", "Sending", "Retried"}])
    worker = payslip_worker_status()
    external_worker_required = str(os.getenv("PAYSLIP_WORKER_MODE", "embedded")).strip().lower() == "external"
    worker_ready = bool(worker.get("healthy")) if external_worker_required else PAYSLIP_WORKER_STARTED
    database_ready = bool(database.get("ok"))
    status = "online" if database_ready and worker_ready else "degraded" if database_ready else "offline"
    return jsonify({
        "ok": database_ready,
        "status": status,
        "checkedAt": now_ms(),
        "database": database,
        "deliveryQueue": {"pending": queued, "workerStarted": PAYSLIP_WORKER_STARTED, "workerReady": worker_ready, **worker},
    }), 200 if database_ready else 503


@app.route("/api/readiness", methods=["GET"])
def readiness():
    """Deployment readiness without exposing secrets or confidential records."""
    database = DATABASE_STORE.health()
    worker = payslip_worker_status()
    external_worker_required = str(os.getenv("PAYSLIP_WORKER_MODE", "embedded")).strip().lower() == "external"
    configuration_ready = True
    if str(os.getenv("VALIDATE_PRODUCTION_CONFIG", "")).strip().lower() in {"1", "true", "yes"}:
        from production_config import validate_production_config
        configuration_ready = not validate_production_config()
    worker_ready = worker.get("healthy", False) if external_worker_required else PAYSLIP_WORKER_STARTED
    ready = bool(database.get("ok") and configuration_ready and worker_ready)
    payload = {
        "ok": ready,
        "database": {"ok": bool(database.get("ok")), "backend": database.get("backend")},
        "configuration": {"ok": configuration_ready},
        "worker": {"ok": bool(worker_ready), "mode": worker.get("mode")},
    }
    return jsonify(payload), 200 if ready else 503


@app.route("/api/metrics", methods=["GET"])
def operational_metrics():
    """Small authenticated operational snapshot without payroll or recipient details."""
    _, auth_user, error = require_authenticated_user()
    if error:
        return error
    if auth_user.get("role") != "SuperAdmin":
        return jsonify({"error": "Super Admin access required"}), 403
    deliveries = load_json_list_store(EMAIL_DELIVERY_STORE_PATH)
    delivery_counts = {}
    for record in deliveries:
        status = str(record.get("status") or "Unknown")
        delivery_counts[status] = delivery_counts.get(status, 0) + 1
    return jsonify({
        "database": DATABASE_STORE.health(),
        "worker": {**payslip_worker_status(), "embeddedStarted": PAYSLIP_WORKER_STARTED},
        "counts": {
            "users": len(load_user_store()),
            "staff": len(load_json_list_store(STAFF_RECORDS_STORE_PATH)),
            "payrollBatches": len(load_json_list_store(PAYROLL_BATCHES_STORE_PATH)),
            "auditEvents": len(load_audit_logs_store()),
            "deliveries": delivery_counts,
        },
        "generatedAt": now_ms(),
    })


@app.route("/api/monitoring/status", methods=["GET"])
def monitoring_status():
    """Token-protected, non-confidential production signals for alerting."""
    expected_token = env_secret("MONITORING_TOKEN")
    supplied_token = str(request.headers.get("X-Monitoring-Token", "")).strip()
    if not expected_token or not supplied_token or not secrets.compare_digest(supplied_token, expected_token):
        return jsonify({"error": "Monitoring authentication failed"}), 401

    database = DATABASE_STORE.health()
    worker = payslip_worker_status()
    deliveries = load_json_list_store(EMAIL_DELIVERY_STORE_PATH)
    pending = sum(1 for item in deliveries if item.get("status") in {"Pending", "Sending", "Retried"})
    failed = sum(1 for item in deliveries if item.get("status") in {"Failed", "Bounced"})
    max_pending = max(0, int(os.getenv("MONITORING_MAX_PENDING_DELIVERIES", "100")))
    max_failed = max(0, int(os.getenv("MONITORING_MAX_FAILED_DELIVERIES", "0")))

    usage = shutil.disk_usage(DATA_DIR)
    storage_percent = round((usage.used / usage.total) * 100, 1) if usage.total else 100.0
    max_storage_percent = min(99, max(1, int(os.getenv("MONITORING_MAX_STORAGE_PERCENT", "85"))))

    backup_dir = os.getenv("BACKUP_DIR", os.path.join(DATA_DIR, "backups"))
    backup_files = []
    if os.path.isdir(backup_dir):
        backup_files = [os.path.join(backup_dir, name) for name in os.listdir(backup_dir) if name.endswith(".bcbbackup")]
    newest_backup = max((os.path.getmtime(path) for path in backup_files), default=0)
    backup_age_hours = round((time.time() - newest_backup) / 3600, 1) if newest_backup else None
    max_backup_age_hours = max(1, int(os.getenv("MONITORING_MAX_BACKUP_AGE_HOURS", "192")))

    checks = {
        "database": bool(database.get("ok")),
        "worker": bool(worker.get("healthy")),
        "deliveryQueue": pending <= max_pending and failed <= max_failed,
        "storage": storage_percent < max_storage_percent,
        "backup": backup_age_hours is not None and backup_age_hours <= max_backup_age_hours,
    }
    ok = all(checks.values())
    return jsonify({
        "ok": ok,
        "status": "operational" if ok else "attention_required",
        "checks": checks,
        "database": {"backend": database.get("backend"), "ok": bool(database.get("ok"))},
        "worker": {"mode": worker.get("mode"), "healthy": bool(worker.get("healthy"))},
        "delivery": {"pending": pending, "failedOrBounced": failed, "maxPending": max_pending, "maxFailedOrBounced": max_failed},
        "storage": {"usedPercent": storage_percent, "maxUsedPercent": max_storage_percent},
        "backup": {"available": bool(backup_files), "ageHours": backup_age_hours, "maxAgeHours": max_backup_age_hours},
        "checkedAt": now_ms(),
    }), 200 if ok else 503


@app.route("/uploads/<path:filename>", methods=["GET"])
def get_uploaded_media(filename: str):
    safe_name = secure_filename(filename)
    if not safe_name or safe_name != filename:
        return jsonify({"error": "Invalid file name"}), 400
    _, auth_user, error = require_authenticated_user()
    if error:
        return error
    image_owner = find_user_by_local_image(safe_name)
    if image_owner and (auth_user.get("role") != "BossAdmin" or image_owner.get("id") == auth_user.get("id")):
        return send_from_directory(UPLOADS_DIR, safe_name, conditional=True)
    settings = load_portal_settings_store()
    if any(str(settings.get(key, "")).endswith(safe_name) for key in {"bankLogo", "authorizedSignature"}):
        return send_from_directory(UPLOADS_DIR, safe_name, conditional=True)
    return jsonify({"error": "File not found"}), 404


@app.route("/api/system-settings/branding-upload", methods=["POST", "OPTIONS"])
def upload_branding_asset():
    preflight = handle_options()
    if preflight:
        return preflight
    _, auth_user, error = require_portal_controller()
    if error:
        return error
    upload = request.files.get("file")
    if upload and request.content_length and request.content_length > 5 * 1024 * 1024:
        return jsonify({"error": "Branding images must be 5 MB or smaller"}), 413
    try:
        saved = save_uploaded_media(upload, "branding")
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    record_audit_log(auth_user, "UPLOAD_SYSTEM_BRANDING", {"filename": saved["filename"], "assetType": str(request.form.get("assetType") or "branding")})
    return jsonify({"ok": True, "asset": saved}), 201


@app.route("/api/uploads/profile-photo", methods=["POST", "OPTIONS"])
def upload_profile_photo_file():
    preflight = handle_options()
    if preflight:
        return preflight
    _, _, error = require_authenticated_user()
    if error:
        return error
    if request.content_length and request.content_length > 5 * 1024 * 1024:
        return jsonify({"error": "Profile photos must be 5 MB or smaller"}), 413
    try:
        saved = save_uploaded_media(request.files.get("file"), "profile")
        return jsonify({"ok": True, **saved})
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400


@app.route("/mail-api/uploads/<path:filename>", methods=["GET"])
def get_uploaded_media_legacy(filename: str):
    return get_uploaded_media(filename)


@app.route("/mail-api/api/<path:path>", methods=["GET", "POST", "OPTIONS"])
def legacy_mail_api(path: str):
    destination = f"/api/{path}"
    query = request.query_string.decode("utf-8", errors="ignore").strip()
    if query:
        destination = f"{destination}?{query}"
    return redirect(destination, code=307)


@app.route("/api/presence", methods=["GET"])
def get_presence():
    _, auth_user, error = require_authenticated_user()
    if error:
        return error
    if auth_user.get("role") == "BossAdmin":
        return jsonify({"error": "Bank presence activity is not available to the platform controller"}), 403
    store = prune_presence(load_presence_store())
    save_presence_store(store)
    return jsonify({"presence": store})


@app.route("/api/presence/ping", methods=["POST", "OPTIONS"])
def ping_presence():
    preflight = handle_options()
    if preflight:
        return preflight
    _, auth_user, error = require_authenticated_user()
    if error:
        return error
    data, error = require_json()
    if error:
        return error
    user_id = str(data.get("userId", "")).strip()
    if not user_id:
        return jsonify({"error": "userId is required"}), 400
    if auth_user["id"] != user_id:
        return jsonify({"error": "Cannot update another user's presence"}), 403
    current_ms = now_ms()
    set_user_last_seen(user_id, current_ms)
    store = prune_presence(load_presence_store())
    store[user_id] = int(time.time())
    save_presence_store(store)
    return jsonify({"ok": True, "lastSeen": current_ms})


@app.route("/api/presence/logout", methods=["POST", "OPTIONS"])
def logout_presence():
    preflight = handle_options()
    if preflight:
        return preflight
    _, auth_user, error = require_authenticated_user()
    if error:
        return error
    data, error = require_json()
    if error:
        return error
    user_id = str(data.get("userId", "")).strip()
    if not user_id:
        return jsonify({"error": "userId is required"}), 400
    if auth_user["id"] != user_id:
        return jsonify({"error": "Cannot update another user's presence"}), 403
    set_user_last_seen(user_id, now_ms())
    store = prune_presence(load_presence_store())
    store.pop(user_id, None)
    save_presence_store(store)
    return jsonify({"ok": True})


@app.route("/api/notifications", methods=["GET"])
def get_notifications():
    _, auth_user, error = require_notification_viewer()
    if error:
        return error
    items = load_json_list_store(NOTIFICATIONS_STORE_PATH)
    user_items = [
        item
        for item in items
        if str(item.get("userId", "")).strip() == auth_user["id"]
    ]
    user_items.sort(key=lambda item: int(item.get("createdAt", 0) or 0), reverse=True)
    return jsonify({"notifications": user_items})


@app.route("/api/notifications/unread-count", methods=["GET"])
def get_unread_notification_count():
    _, auth_user, error = require_notification_viewer()
    if error:
        return error
    items = load_json_list_store(NOTIFICATIONS_STORE_PATH)
    count = sum(
        1
        for item in items
        if str(item.get("userId", "")).strip() == auth_user["id"]
        and not bool(item.get("isRead", False))
    )
    return jsonify({"count": count})


@app.route("/api/notifications/<int:item_id>/read", methods=["POST", "OPTIONS"])
def mark_notification_read(item_id: int):
    preflight = handle_options()
    if preflight:
        return preflight
    _, auth_user, error = require_notification_viewer()
    if error:
        return error
    items = load_json_list_store(NOTIFICATIONS_STORE_PATH)
    notification = next(
        (
            item
            for item in items
            if int(item.get("id", 0) or 0) == item_id
            and str(item.get("userId", "")).strip() == auth_user["id"]
        ),
        None,
    )
    if not notification:
        return jsonify({"error": "Notification not found"}), 404
    notification["isRead"] = True
    save_json_list_store(NOTIFICATIONS_STORE_PATH, items)
    return jsonify({"ok": True})


@app.route("/api/notifications/read-all", methods=["POST", "OPTIONS"])
def mark_all_notifications_read():
    preflight = handle_options()
    if preflight:
        return preflight
    _, auth_user, error = require_notification_viewer()
    if error:
        return error
    items = load_json_list_store(NOTIFICATIONS_STORE_PATH)
    changed = False
    for item in items:
        if str(item.get("userId", "")).strip() == auth_user["id"] and not bool(item.get("isRead", False)):
            item["isRead"] = True
            changed = True
    if changed:
        save_json_list_store(NOTIFICATIONS_STORE_PATH, items)
    return jsonify({"ok": True})


@app.route("/api/notifications/<int:item_id>/delete", methods=["POST", "OPTIONS"])
def delete_notification(item_id: int):
    preflight = handle_options()
    if preflight:
        return preflight
    _, auth_user, error = require_notification_viewer()
    if error:
        return error
    items = load_json_list_store(NOTIFICATIONS_STORE_PATH)
    filtered = [
        item
        for item in items
        if not (
            int(item.get("id", 0) or 0) == item_id
            and str(item.get("userId", "")).strip() == auth_user["id"]
        )
    ]
    if len(filtered) == len(items):
        return jsonify({"error": "Notification not found"}), 404
    save_json_list_store(NOTIFICATIONS_STORE_PATH, filtered)
    record_audit_log(
        auth_user,
        "DELETE_NOTIFICATION",
        {"notificationId": item_id},
    )
    return jsonify({"ok": True})


@app.route("/api/audit-logs", methods=["GET"])
def get_audit_logs():
    _, user, error = require_authenticated_user()
    if error:
        return error
    if user["role"] not in {"SuperAdmin", "Admin", "Auditor"}:
        return jsonify({"error": "Audit access required"}), 403
    logs = sorted(load_audit_logs_store(), key=lambda item: int(item["timestamp"]), reverse=True)
    return jsonify({"logs": logs})


REPORT_DEFINITIONS = {
    "payroll_summary": {"title": "Payroll Summary", "columns": [
        {"key": "period", "label": "Period"}, {"key": "batchName", "label": "Payroll Batch"}, {"key": "version", "label": "Version"},
        {"key": "status", "label": "Status"}, {"key": "staffCount", "label": "Staff"}, {"key": "totalIncome", "label": "Total Income (GHS)"},
        {"key": "totalDeductions", "label": "Deductions (GHS)"}, {"key": "totalNetSalary", "label": "Net Salary (GHS)"}, {"key": "preparedBy", "label": "Prepared By"},
    ]},
    "staff_payslip_history": {"title": "Staff Payslip History", "columns": [
        {"key": "period", "label": "Period"}, {"key": "staffId", "label": "Staff ID"}, {"key": "staffName", "label": "Staff Name"},
        {"key": "department", "label": "Department"}, {"key": "branch", "label": "Branch"}, {"key": "totalIncome", "label": "Income (GHS)"},
        {"key": "totalDeductions", "label": "Deductions (GHS)"}, {"key": "netSalary", "label": "Net Salary (GHS)"}, {"key": "status", "label": "Payslip Status"},
    ]},
    "email_delivery": {"title": "Email Delivery Report", "columns": [
        {"key": "period", "label": "Period"}, {"key": "staffId", "label": "Staff ID"}, {"key": "staffName", "label": "Staff Name"},
        {"key": "recipientEmail", "label": "Recipient Email"}, {"key": "status", "label": "Status"}, {"key": "sentTime", "label": "Sent Time"},
        {"key": "attempts", "label": "Attempts"}, {"key": "sentBy", "label": "Sent By"}, {"key": "errorMessage", "label": "Error Message"},
    ]},
    "failed_emails": {"title": "Failed Emails Report", "columns": [
        {"key": "period", "label": "Period"}, {"key": "staffId", "label": "Staff ID"}, {"key": "staffName", "label": "Staff Name"},
        {"key": "recipientEmail", "label": "Recipient Email"}, {"key": "status", "label": "Status"}, {"key": "attempts", "label": "Attempts"},
        {"key": "errorMessage", "label": "Failure Reason"}, {"key": "sentBy", "label": "Last Sent By"},
    ]},
    "salary_changes": {"title": "Salary Change Report", "columns": [
        {"key": "period", "label": "Effective Month"}, {"key": "staffId", "label": "Staff ID"}, {"key": "staffName", "label": "Staff Name"},
        {"key": "fieldLabel", "label": "Salary Field"}, {"key": "oldValue", "label": "Old Value (GHS)"}, {"key": "newValue", "label": "New Value (GHS)"},
        {"key": "reason", "label": "Reason"}, {"key": "changedBy", "label": "Changed By"}, {"key": "changedTime", "label": "Changed Time"},
    ]},
    "inactive_staff": {"title": "Inactive Staff Report", "columns": [
        {"key": "staffId", "label": "Staff ID"}, {"key": "staffName", "label": "Staff Name"}, {"key": "email", "label": "Email"},
        {"key": "department", "label": "Department"}, {"key": "position", "label": "Position"}, {"key": "branch", "label": "Branch"},
        {"key": "phone", "label": "Phone"}, {"key": "updatedTime", "label": "Last Updated"},
    ]},
    "audit_trail": {"title": "Audit Trail Report", "columns": [
        {"key": "dateTime", "label": "Date and Time"}, {"key": "actorName", "label": "User"}, {"key": "action", "label": "Action"},
        {"key": "oldValue", "label": "Old Value"}, {"key": "newValue", "label": "New Value"}, {"key": "target", "label": "Record / Details"},
        {"key": "ipAddress", "label": "IP Address"},
    ]},
}


def require_report_viewer():
    token, user, error = require_authenticated_user()
    if error:
        return token, user, error
    if user.get("role") not in {"SuperAdmin", "FinanceApprover", "Auditor", "Management"}:
        return token, user, (jsonify({"error": "Reports access required"}), 403)
    return token, user, None


def report_date_time(value: object) -> str:
    try:
        return datetime.fromtimestamp(int(value or 0) / 1000).astimezone().strftime("%Y-%m-%d %H:%M:%S")
    except (TypeError, ValueError, OSError):
        return ""


def report_rows(report_type: str) -> list[dict]:
    batches = load_json_list_store(PAYROLL_BATCHES_STORE_PATH)
    staff_records = load_json_list_store(STAFF_RECORDS_STORE_PATH)
    staff_by_id = {item.get("id"): item for item in staff_records}
    include_inactive_history = load_portal_settings_store().get("inactiveStaffInHistoricalReports", True)
    def include_historical_staff(staff_id: object) -> bool:
        return include_inactive_history or staff_by_id.get(staff_id, {}).get("employmentStatus") != "inactive"
    if report_type == "payroll_summary":
        return [{"period": batch.get("period"), "batchName": batch.get("name"), "version": batch.get("version", 1), "status": batch.get("status"), "staffCount": batch.get("summary", {}).get("staffCount", len(batch.get("entries", []))), "totalIncome": batch.get("summary", {}).get("totalIncome", 0), "totalDeductions": batch.get("summary", {}).get("totalDeductions", 0), "totalNetSalary": batch.get("summary", {}).get("totalNetSalary", 0), "preparedBy": batch.get("createdBy", ""), "department": "", "branch": "", "staff": ""} for batch in batches]
    if report_type == "staff_payslip_history":
        rows = []
        for batch in batches:
            for entry in batch.get("entries", []):
                if not include_historical_staff(entry.get("staffRecordId")):
                    continue
                rows.append({"period": batch.get("period"), "batchName": batch.get("name"), "version": batch.get("version", 1), "status": batch.get("status"), "staffId": entry.get("staffId"), "staffName": entry.get("fullName"), "staff": f"{entry.get('staffId', '')} {entry.get('fullName', '')}", "department": entry.get("department"), "branch": entry.get("branch"), "totalIncome": entry.get("totalIncome", 0), "totalDeductions": entry.get("totalDeductions", 0), "netSalary": entry.get("netSalary", 0)})
        return rows
    if report_type in {"email_delivery", "failed_emails"}:
        rows = []
        for item in load_json_list_store(EMAIL_DELIVERY_STORE_PATH):
            if item.get("isTest"):
                continue
            if not include_historical_staff(item.get("staffRecordId")):
                continue
            if report_type == "failed_emails" and item.get("status") not in {"Failed", "Bounced"}:
                continue
            staff = staff_by_id.get(item.get("staffRecordId"), {})
            rows.append({**item, "staff": f"{item.get('staffId', '')} {item.get('staffName', '')}", "department": staff.get("department", ""), "branch": staff.get("branch", ""), "sentTime": report_date_time(item.get("sentAt") or item.get("updatedAt"))})
        return rows
    if report_type == "salary_changes":
        rows = []
        for item in load_json_list_store(SALARY_HISTORY_STORE_PATH):
            if not include_historical_staff(item.get("staffRecordId")):
                continue
            staff = staff_by_id.get(item.get("staffRecordId"), {})
            rows.append({**item, "period": item.get("effectiveMonth"), "staff": f"{item.get('staffId', '')} {item.get('staffName', '')}", "department": staff.get("department", ""), "branch": staff.get("branch", ""), "changedTime": report_date_time(item.get("changedAt"))})
        return rows
    if report_type == "inactive_staff":
        return [{"staffId": item.get("staffId"), "staffName": item.get("fullName"), "staff": f"{item.get('staffId', '')} {item.get('fullName', '')}", "email": item.get("email"), "department": item.get("department"), "position": item.get("position"), "branch": item.get("branch"), "phone": item.get("phone"), "updatedTime": report_date_time(item.get("updatedAt")), "period": ""} for item in staff_records if item.get("employmentStatus") == "inactive"]
    if report_type == "audit_trail":
        rows = []
        for item in load_audit_logs_store():
            details = item.get("details", {})
            audit_period = datetime.fromtimestamp(int(item.get("timestamp", 0)) / 1000).astimezone().strftime("%Y-%m") if item.get("timestamp") else ""
            rows.append({**item, "dateTime": report_date_time(item.get("timestamp")), "oldValue": item.get("oldValue"), "newValue": item.get("newValue"), "department": details.get("department", ""), "branch": details.get("branch", ""), "staff": f"{details.get('staffId', '')} {details.get('staffName', '')}", "period": audit_period})
        return rows
    return []


def report_filters_from_request() -> dict:
    return {key: str(request.args.get(key, "")).strip() for key in ["month", "year", "department", "branch", "staff", "search", "dateFrom", "dateTo", "action"]}


def filter_report_rows(rows: list[dict], filters: dict) -> list[dict]:
    filtered = []
    for row in rows:
        period = str(row.get("period", ""))
        if filters.get("month") and period != filters["month"]:
            continue
        if filters.get("year") and not period.startswith(filters["year"]):
            continue
        if filters.get("department") and str(row.get("department", "")).lower() != filters["department"].lower():
            continue
        if filters.get("branch") and str(row.get("branch", "")).lower() != filters["branch"].lower():
            continue
        if filters.get("staff") and filters["staff"].lower() not in str(row.get("staff", "")).lower():
            continue
        if filters.get("search") and filters["search"].lower() not in " ".join(str(value) for value in row.values()).lower():
            continue
        if filters.get("action") and str(row.get("action", "")).lower() != filters["action"].lower():
            continue
        row_date = next((str(row.get(key, ""))[:10] for key in ["dateTime", "sentTime", "changedTime", "updatedTime"] if row.get(key)), "")
        if not row_date and period:
            row_date = f"{period[:7]}-01" if len(period) >= 7 else ""
        if filters.get("dateFrom") and (not row_date or row_date < filters["dateFrom"]):
            continue
        if filters.get("dateTo") and (not row_date or row_date > filters["dateTo"]):
            continue
        filtered.append(row)
    return filtered


def reporting_dashboard_data() -> dict:
    staff = load_json_list_store(STAFF_RECORDS_STORE_PATH)
    batches = [item for item in load_json_list_store(PAYROLL_BATCHES_STORE_PATH) if item.get("status") != "cancelled"]
    deliveries = [item for item in load_json_list_store(EMAIL_DELIVERY_STORE_PATH) if not item.get("isTest")]
    history = load_json_list_store(SALARY_HISTORY_STORE_PATH)
    batches.sort(key=lambda item: (str(item.get("period", "")), int(item.get("version", 1) or 1)), reverse=True)
    current = batches[0] if batches else None
    summary = (current or {}).get("summary", {})
    successful = sum(1 for item in deliveries if item.get("status") in {"Sent", "Delivered"})
    failed = sum(1 for item in deliveries if item.get("status") in {"Failed", "Bounced"})
    pending = sum(1 for item in deliveries if item.get("status") in {"Pending", "Sending", "Retried"})
    corrected = sum(len(item.get("entries", [])) for item in batches if item.get("revisionOf") or int(item.get("version", 1) or 1) > 1 or any(event.get("action") == "corrected" for event in item.get("approvalHistory", [])))
    active_staff = [item for item in staff if item.get("employmentStatus") == "active"]
    missing_email_count = sum(1 for item in active_staff if not str(item.get("email") or "").strip())
    official_domain = load_portal_settings_store()["emailDomain"]
    invalid_email_count = sum(1 for item in active_staff if str(item.get("email") or "").strip() and not str(item.get("email") or "").strip().lower().endswith(official_domain))
    rejected_batches = [item for item in batches if item.get("status") == "rejected"]
    warnings = []
    if rejected_batches:
        rejected_count = len(rejected_batches)
        warnings.append({"id": "rejected-payroll", "severity": "critical", "title": f"{rejected_count} rejected payroll batch{'es' if rejected_count != 1 else ''} {'needs' if rejected_count == 1 else 'need'} correction", "message": "Finance must address the approver comments before payslips can be generated or sent.", "count": rejected_count, "href": "/payroll/batches"})
    if missing_email_count or invalid_email_count:
        affected = missing_email_count + invalid_email_count
        warnings.append({"id": "staff-email", "severity": "warning", "title": f"{affected} active staff email record{'s' if affected != 1 else ''} {'needs' if affected == 1 else 'need'} attention", "message": f"Missing: {missing_email_count}. Invalid official addresses: {invalid_email_count}.", "count": affected, "href": "/staff"})
    if failed:
        warnings.append({"id": "failed-email", "severity": "warning", "title": f"{failed} payslip email{'s' if failed != 1 else ''} failed or bounced", "message": "Review the delivery report and resend only after correcting the recipient details.", "count": failed, "href": "/payslips/send"})
    monthly = []
    for batch in sorted(batches, key=lambda item: str(item.get("period", ""))):
        monthly.append({"period": batch.get("period"), "income": batch.get("summary", {}).get("totalIncome", 0), "deductions": batch.get("summary", {}).get("totalDeductions", 0), "net": batch.get("summary", {}).get("totalNetSalary", 0)})
    department_cost = {}
    for entry in (current or {}).get("entries", []):
        department = entry.get("department") or "Unassigned"
        department_cost[department] = round(department_cost.get(department, 0) + float(entry.get("totalIncome") or 0), 2)
    changes_by_period = {}
    for item in history:
        period = str(item.get("effectiveMonth", "Unknown"))
        changes_by_period[period] = changes_by_period.get(period, 0) + 1
    return {
        "metrics": {"activeStaff": sum(1 for item in staff if item.get("employmentStatus") == "active"), "inactiveStaff": sum(1 for item in staff if item.get("employmentStatus") == "inactive"), "currentBatch": (current or {}).get("name", "No payroll batch"), "currentBatchStatus": (current or {}).get("status", "none"), "totalIncome": summary.get("totalIncome", 0), "totalDeductions": summary.get("totalDeductions", 0), "totalNetSalary": summary.get("totalNetSalary", 0), "successfulEmails": successful, "failedEmails": failed, "pendingEmails": pending, "correctedPayslips": corrected},
        "charts": {"monthlyPayroll": monthly, "departmentCost": [{"department": key, "cost": value} for key, value in sorted(department_cost.items(), key=lambda item: item[1], reverse=True)], "emailDelivery": [{"status": "Successful", "count": successful}, {"status": "Failed", "count": failed}, {"status": "Pending", "count": pending}], "salaryChanges": [{"period": key, "count": value} for key, value in sorted(changes_by_period.items())]},
        "recentBatches": batches[:5],
        "warnings": warnings,
        "refreshedAt": now_ms(),
    }


@app.route("/api/reporting/dashboard", methods=["GET"])
def reporting_dashboard():
    _, user, error = require_authenticated_user()
    if error:
        return error
    if user.get("role") not in {"SuperAdmin", "Admin", "FinanceOfficer", "FinanceApprover", "Management"}:
        return jsonify({"error": "Dashboard access required"}), 403
    return jsonify(reporting_dashboard_data())


@app.route("/api/reports", methods=["GET"])
def get_report_data():
    _, _, error = require_report_viewer()
    if error:
        return error
    report_type = str(request.args.get("type", "payroll_summary")).strip()
    definition = REPORT_DEFINITIONS.get(report_type)
    if not definition:
        return jsonify({"error": "Unknown report type"}), 400
    filters = report_filters_from_request()
    rows = filter_report_rows(report_rows(report_type), filters)
    page = max(1, int(request.args.get("page", 1) or 1))
    page_size = min(200, max(10, int(request.args.get("pageSize", 100) or 100)))
    total = len(rows)
    rows = rows[(page - 1) * page_size:page * page_size]
    staff = load_json_list_store(STAFF_RECORDS_STORE_PATH)
    return jsonify({"type": report_type, "title": definition["title"], "columns": definition["columns"], "rows": rows, "filters": filters, "pagination": {"page": page, "pageSize": page_size, "total": total, "pages": max(1, (total + page_size - 1) // page_size)}, "options": {"departments": sorted({str(item.get("department")) for item in staff if item.get("department")}), "branches": sorted({str(item.get("branch")) for item in staff if item.get("branch")}), "staff": sorted([{"id": item.get("id"), "staffId": item.get("staffId"), "name": item.get("fullName")} for item in staff], key=lambda item: str(item.get("name")))}})


@app.route("/api/reports/export", methods=["GET"])
def export_report_data():
    _, auth_user, error = require_report_viewer()
    if error:
        return error
    report_type = str(request.args.get("type", "payroll_summary")).strip()
    export_format = str(request.args.get("format", "pdf")).strip().lower()
    definition = REPORT_DEFINITIONS.get(report_type)
    if not definition or export_format not in {"pdf", "xlsx"}:
        return jsonify({"error": "Select a valid report type and PDF or Excel format"}), 400
    filters = report_filters_from_request()
    rows = filter_report_rows(report_rows(report_type), filters)
    bank_name = str(load_portal_settings_store().get("bankName") or "Bawjiase Community Bank PLC")
    content = generate_report_pdf(definition["title"], definition["columns"], rows, filters, bank_name) if export_format == "pdf" else generate_report_xlsx(definition["title"], definition["columns"], rows, filters, bank_name)
    filename = secure_filename(f"{definition['title']}-{datetime.now().strftime('%Y%m%d')}.{export_format}")
    record_audit_log(auth_user, "EXPORT_REPORT", {"reportType": report_type, "format": export_format, "rowCount": len(rows), "filters": filters})
    return send_file(BytesIO(content), mimetype="application/pdf" if export_format == "pdf" else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", as_attachment=True, download_name=filename, max_age=0)


@app.route("/api/portal-settings", methods=["GET"])
def get_portal_settings():
    settings = load_portal_settings_store()
    public_settings = {key: value for key, value in settings.items() if key not in {"portalControlPassword", "itAccessCode", "hrAccessCode", "smtpServer", "smtpUsername", "smtpSender", "updatedBy", "contributionRateHistory"}}
    public_settings["selfRegistrationEnabled"] = self_registration_enabled()
    public_settings["mfaEnrollmentAvailable"] = mfa_configuration_available()
    return jsonify({"settings": public_settings})


@app.route("/api/system-settings", methods=["GET"])
def get_system_settings():
    _, auth_user, error = require_portal_controller()
    if error:
        return error
    settings = load_portal_settings_store()
    safe = {key: value for key, value in settings.items() if key not in {"portalControlPassword", "itAccessCode", "hrAccessCode"}}
    safe["smtpPasswordConfigured"] = bool(env_secret("MAIL_PASSWORD"))
    safe["canManageBackups"] = boss_database_maintenance_enabled()
    return jsonify({"settings": safe})


@app.route("/api/system-settings/test-smtp", methods=["POST", "OPTIONS"])
def test_smtp_configuration():
    preflight = handle_options()
    if preflight:
        return preflight
    _, auth_user, error = require_portal_controller()
    if error:
        return error
    try:
        cfg = mail_config()
        smtp_class = smtplib.SMTP_SSL if cfg["MAIL_SECURITY"] == "ssl" else smtplib.SMTP
        with smtp_class(str(cfg["MAIL_SERVER"]), int(cfg["MAIL_PORT"]), timeout=20) as smtp:
            if cfg["MAIL_SECURITY"] == "starttls":
                smtp.starttls()
            smtp.login(str(cfg["MAIL_USERNAME"]), str(cfg["MAIL_PASSWORD"]))
        record_audit_log(auth_user, "TEST_SMTP_CONFIGURATION", {"server": cfg["MAIL_SERVER"], "port": cfg["MAIL_PORT"], "result": "success"})
        return jsonify({"ok": True, "message": "SMTP connection and authentication succeeded"})
    except Exception as exc:
        record_audit_log(auth_user, "TEST_SMTP_CONFIGURATION", {"result": "failed", "error": str(exc)[:300]})
        return jsonify({"error": f"SMTP test failed: {exc}"}), 503


@app.route("/api/system-settings/test-pdf", methods=["POST", "OPTIONS"])
def test_pdf_configuration():
    preflight = handle_options()
    if preflight:
        return preflight
    _, auth_user, error = require_portal_controller()
    if error:
        return error
    try:
        settings, logo_path = payslip_pdf_settings()
        sample = calculate_payroll_entry({"staffRecordId": "configuration-test", "staffId": "BCB-TEST", "fullName": "Configuration Test", "email": auth_user.get("email"), "department": "FINANCE", "branch": "HEAD OFFICE", **{field: (1000 if field == "basicSalary" else 0) for field in PAYROLL_MANUAL_FIELDS}})
        content = generate_payslip_pdf({"name": "Configuration Test Payroll", "period": datetime.now().strftime("%Y-%m"), "version": 1}, sample, str(settings.get("bankName") or "Bawjiase Community Bank PLC"), logo_path, settings)
        record_audit_log(auth_user, "TEST_PDF_CONFIGURATION", {"result": "success", "bytes": len(content), "passwordRule": settings.get("pdfPasswordRule")})
        return jsonify({"ok": True, "message": "PDF configuration generated a valid sample payslip", "bytes": len(content)})
    except Exception as exc:
        record_audit_log(auth_user, "TEST_PDF_CONFIGURATION", {"result": "failed", "error": str(exc)[:300]})
        return jsonify({"error": f"PDF configuration test failed: {exc}"}), 500


@app.route("/api/portal-settings", methods=["POST", "OPTIONS"])
def update_portal_settings():
    preflight = handle_options()
    if preflight:
        return preflight
    _, auth_user, error = require_portal_controller()
    if error:
        return error
    data, error = require_json()
    if error:
        return error
    current_settings = load_portal_settings_store()
    branches = normalize_portal_branches(data.get("branches"))
    contribution_rates = normalize_contribution_rates(data.get("contributionRates"))
    contribution_effective_month = normalize_effective_month(data.get("contributionRateEffectiveMonth"))
    contribution_history = normalize_contribution_rate_history(current_settings.get("contributionRateHistory"))
    if contribution_rates != current_settings.get("contributionRates") or contribution_effective_month != current_settings.get("contributionRateEffectiveMonth"):
        previous_effective_month = normalize_effective_month(current_settings.get("contributionRateEffectiveMonth"))
        if not any(item["effectiveMonth"] == previous_effective_month for item in contribution_history):
            contribution_history.append({
                "effectiveMonth": previous_effective_month,
                "rates": normalize_contribution_rates(current_settings.get("contributionRates")),
                "changedAt": int(current_settings.get("updatedAt", 0) or 0),
                "changedBy": str((current_settings.get("updatedBy") or {}).get("fullname") or "System"),
            })
        contribution_history = [item for item in contribution_history if item["effectiveMonth"] != contribution_effective_month]
        contribution_history.append({
            "effectiveMonth": contribution_effective_month,
            "rates": contribution_rates,
            "changedAt": now_ms(),
            "changedBy": auth_user.get("fullname") or auth_user.get("email"),
        })
        contribution_history.sort(key=lambda item: item["effectiveMonth"])
    settings = {
        "bankName": str(data.get("bankName") or DEFAULT_PORTAL_SETTINGS["bankName"]).strip(),
        "shortBankName": str(data.get("shortBankName") or DEFAULT_PORTAL_SETTINGS["shortBankName"]).strip(),
        "portalName": str(data.get("portalName") or DEFAULT_PORTAL_SETTINGS["portalName"]).strip(),
        "emailDomain": normalize_email_domain(data.get("emailDomain")),
        "branches": branches,
        "departments": normalize_portal_list(data.get("departments"), DEFAULT_PORTAL_DEPARTMENTS, True),
        "loginSubtitle": str(data.get("loginSubtitle") or DEFAULT_PORTAL_SETTINGS["loginSubtitle"]),
        "loginButtonText": str(data.get("loginButtonText") or DEFAULT_PORTAL_SETTINGS["loginButtonText"]),
        "authorizedAccessText": str(data.get("authorizedAccessText") or DEFAULT_PORTAL_SETTINGS["authorizedAccessText"]),
        "portalControlPassword": str(current_settings.get("portalControlPassword") or DEFAULT_PORTAL_SETTINGS["portalControlPassword"]),
        "itAccessCode": str(data.get("itAccessCode")) if "itAccessCode" in data else str(current_settings.get("itAccessCode") or ""),
        "hrAccessCode": str(data.get("hrAccessCode")) if "hrAccessCode" in data else str(current_settings.get("hrAccessCode") or ""),
        "sessionDays": normalize_positive_number(data.get("sessionDays"), DEFAULT_PORTAL_SETTINGS["sessionDays"]),
        "sessionTimeoutMinutes": normalize_positive_number(data.get("sessionTimeoutMinutes"), DEFAULT_PORTAL_SETTINGS["sessionTimeoutMinutes"]),
        "restrictPayslipDownloads": bool(data.get("restrictPayslipDownloads", True)),
        "approvedPayrollOnly": True,
        "requirePrivilegedMfa": bool(data.get("requirePrivilegedMfa", True)),
        "bankAddress": str(data.get("bankAddress") or DEFAULT_PORTAL_SETTINGS["bankAddress"]).strip()[:500],
        "bankLogo": str(data.get("bankLogo") or current_settings.get("bankLogo") or DEFAULT_PORTAL_SETTINGS["bankLogo"]).strip(),
        "authorizedSignature": str(data.get("authorizedSignature") or current_settings.get("authorizedSignature") or "").strip(),
        "emailFooter": str(data.get("emailFooter") or DEFAULT_PORTAL_SETTINGS["emailFooter"]).strip()[:1000],
        "payslipTitle": str(data.get("payslipTitle") or DEFAULT_PORTAL_SETTINGS["payslipTitle"]).strip()[:100],
        "confidentialityNote": str(data.get("confidentialityNote") or DEFAULT_PORTAL_SETTINGS["confidentialityNote"]).strip()[:500],
        "allowanceLabels": {key: str((data.get("allowanceLabels") or {}).get(key) or value).strip()[:80] for key, value in DEFAULT_PORTAL_SETTINGS["allowanceLabels"].items()},
        "deductionLabels": {key: str((data.get("deductionLabels") or {}).get(key) or value).strip()[:80] for key, value in DEFAULT_PORTAL_SETTINGS["deductionLabels"].items()},
        "employerContributionLabels": {key: str((data.get("employerContributionLabels") or {}).get(key) or value).strip()[:80] for key, value in DEFAULT_PORTAL_SETTINGS["employerContributionLabels"].items()},
        "pdfPasswordRule": str(data.get("pdfPasswordRule") or "staff_id").strip().lower(),
        "emailProvider": str(data.get("emailProvider") or "smtp").strip().lower(),
        "smtpServer": str(data.get("smtpServer") or "").strip()[:255],
        "smtpPort": normalize_positive_number(data.get("smtpPort"), 465),
        "smtpSecurity": str(data.get("smtpSecurity") or "ssl").strip().lower(),
        "smtpUsername": str(data.get("smtpUsername") or "").strip()[:255],
        "smtpSender": str(data.get("smtpSender") or "").strip()[:255],
        "defaultEmailSubject": str(data.get("defaultEmailSubject") or DEFAULT_PORTAL_SETTINGS["defaultEmailSubject"]).strip()[:200],
        "defaultEmailBody": str(data.get("defaultEmailBody") or DEFAULT_PORTAL_SETTINGS["defaultEmailBody"]).strip()[:10000],
        "payrollApprovalRequired": bool(data.get("payrollApprovalRequired", True)),
        "contributionRates": contribution_rates,
        "contributionRateEffectiveMonth": contribution_effective_month,
        "contributionRateHistory": contribution_history,
        "payrollValidationRules": normalize_payroll_validation_rules(data.get("payrollValidationRules")),
        "allowLightMode": bool(data.get("allowLightMode", True)), "allowDarkMode": bool(data.get("allowDarkMode", True)),
        "defaultTheme": str(data.get("defaultTheme") or "light").strip().lower(),
        "inactiveStaffInHistoricalReports": bool(data.get("inactiveStaffInHistoricalReports", True)),
        "requireTestEmail": bool(data.get("requireTestEmail", True)),
        "backupSchedule": str(data.get("backupSchedule") or "weekly").strip().lower(),
        "auditRetentionYears": normalize_positive_number(data.get("auditRetentionYears"), 7),
        "payrollRetentionYears": normalize_positive_number(data.get("payrollRetentionYears"), 7),
        "deliveryRetentionYears": normalize_positive_number(data.get("deliveryRetentionYears"), 3),
        "passwordResetMinutes": normalize_positive_number(data.get("passwordResetMinutes"), DEFAULT_PORTAL_SETTINGS["passwordResetMinutes"]),
        "dashboardLabel": str(data.get("dashboardLabel") or DEFAULT_PORTAL_SETTINGS["dashboardLabel"]),
        "profileLabel": str(data.get("profileLabel") or DEFAULT_PORTAL_SETTINGS["profileLabel"]),
        "activeStaffLabel": str(data.get("activeStaffLabel") or DEFAULT_PORTAL_SETTINGS["activeStaffLabel"]),
        "branchCoverageLabel": str(data.get("branchCoverageLabel") or DEFAULT_PORTAL_SETTINGS["branchCoverageLabel"]),
        "openOperationsLabel": str(data.get("openOperationsLabel") or DEFAULT_PORTAL_SETTINGS["openOperationsLabel"]),
        "resolutionRateLabel": str(data.get("resolutionRateLabel") or DEFAULT_PORTAL_SETTINGS["resolutionRateLabel"]),
        "updatedAt": now_ms(),
        "updatedBy": {
            "id": auth_user["id"],
            "fullname": auth_user["fullname"],
            "email": auth_user["email"],
        },
    }
    if settings["pdfPasswordRule"] not in {"none", "staff_id", "phone"}:
        return jsonify({"error": "PDF password rule must be none, Staff ID, or phone number"}), 400
    if settings["smtpSecurity"] not in {"ssl", "starttls"} or settings["defaultTheme"] not in {"light", "dark"} or settings["backupSchedule"] not in {"off", "daily", "weekly", "monthly"}:
        return jsonify({"error": "One or more system settings are invalid"}), 400
    if not settings["allowLightMode"] and not settings["allowDarkMode"]:
        return jsonify({"error": "At least one appearance mode must remain enabled"}), 400
    if any(settings[key] < 1 or settings[key] > 25 for key in ("auditRetentionYears", "payrollRetentionYears", "deliveryRetentionYears")):
        return jsonify({"error": "Retention periods must be between 1 and 25 years"}), 400
    if (settings["defaultTheme"] == "light" and not settings["allowLightMode"]) or (settings["defaultTheme"] == "dark" and not settings["allowDarkMode"]):
        return jsonify({"error": "The default theme must be one of the enabled appearance modes"}), 400
    before = {key: value for key, value in current_settings.items() if key not in {"portalControlPassword", "itAccessCode", "hrAccessCode"}}
    save_portal_settings_store(settings)
    record_audit_log(
        auth_user,
        "UPDATE_PORTAL_SETTINGS",
        {
            "oldValue": before,
            "newValue": {key: value for key, value in settings.items() if key not in {"portalControlPassword", "itAccessCode", "hrAccessCode"}},
            "updatedAt": settings["updatedAt"],
        },
    )
    response_settings = {key: value for key, value in settings.items() if key not in {"portalControlPassword", "itAccessCode", "hrAccessCode"}}
    response_settings["smtpPasswordConfigured"] = bool(env_secret("MAIL_PASSWORD"))
    response_settings["canManageBackups"] = boss_database_maintenance_enabled()
    return jsonify({"ok": True, "settings": response_settings})


def build_backup_payload(generated_by: dict | None = None) -> dict:
    return {
        "metadata": {
            "app": "bawjiase-finance-payslip-platform",
            "generatedAt": now_ms(),
            "generatedBy": generated_by or {"id": "system", "fullname": "Scheduled Backup", "role": "system"},
            "schemaVersion": 3,
        },
        "stores": {
            "users": load_user_store(),
            "passwords": load_password_store(),
            "notifications": load_json_list_store(NOTIFICATIONS_STORE_PATH),
            "auditLogs": load_audit_logs_store(),
            "staffRecords": load_json_list_store(STAFF_RECORDS_STORE_PATH),
            "payrollBatches": load_json_list_store(PAYROLL_BATCHES_STORE_PATH),
            "salaryHistory": load_json_list_store(SALARY_HISTORY_STORE_PATH),
            "emailDelivery": load_json_list_store(EMAIL_DELIVERY_STORE_PATH),
            "portalSettings": load_portal_settings_store(),
            "mfa": load_mfa_store(),
        },
    }


def encrypt_backup_payload(backup: dict) -> bytes:
    key = env_secret("BACKUP_ENCRYPTION_KEY")
    if not key:
        raise RuntimeError("BACKUP_ENCRYPTION_KEY is not configured")
    try:
        return Fernet(key.encode("ascii")).encrypt(json.dumps(backup, ensure_ascii=True).encode("utf-8"))
    except (ValueError, TypeError) as exc:
        raise RuntimeError("BACKUP_ENCRYPTION_KEY is invalid") from exc


def scheduled_backup_due(schedule: str, last_created: float) -> bool:
    seconds = {"daily": 86400, "weekly": 604800, "monthly": 2592000}.get(schedule)
    return bool(seconds and time.time() - last_created >= seconds)


def run_scheduled_backup_once() -> str | None:
    schedule = str(load_portal_settings_store().get("backupSchedule", "weekly")).lower()
    backup_dir = os.getenv("BACKUP_DIR", os.path.join(DATA_DIR, "backups"))
    os.makedirs(backup_dir, exist_ok=True)
    existing = sorted((os.path.join(backup_dir, name) for name in os.listdir(backup_dir) if name.endswith(".bcbbackup")), key=os.path.getmtime)
    last_created = os.path.getmtime(existing[-1]) if existing else 0
    if not scheduled_backup_due(schedule, last_created):
        return None
    encrypted = encrypt_backup_payload(build_backup_payload())
    target = os.path.join(backup_dir, f"scheduled-{time.strftime('%Y%m%d-%H%M%S', time.gmtime())}.bcbbackup")
    with open(target, "wb") as handle:
        handle.write(encrypted)
    retention = max(2, int(os.getenv("BACKUP_RETENTION_COUNT", "12")))
    for old_path in (existing + [target])[:-retention]:
        try:
            os.remove(old_path)
        except OSError:
            pass
    record_audit_log(None, "SCHEDULED_ENCRYPTED_BACKUP", {"schedule": schedule, "file": os.path.basename(target)})
    return target


def start_backup_scheduler() -> None:
    global BACKUP_SCHEDULER_STARTED
    with BACKUP_SCHEDULER_LOCK:
        if BACKUP_SCHEDULER_STARTED:
            return
        BACKUP_SCHEDULER_STARTED = True
    def worker():
        while True:
            try:
                run_scheduled_backup_once()
            except Exception:
                app.logger.exception("Scheduled backup failed")
            time.sleep(max(60, int(os.getenv("BACKUP_CHECK_INTERVAL_SECONDS", "900"))))
    threading.Thread(target=worker, name="encrypted-backup-scheduler", daemon=True).start()


@app.route("/api/backup/export", methods=["GET"])
def export_production_backup():
    _, auth_user, error = require_portal_controller()
    if error:
        return error
    if not boss_database_maintenance_enabled():
        return jsonify({"error": "Database export is disabled to protect confidential bank records"}), 403
    backup = build_backup_payload({"id": auth_user["id"], "fullname": auth_user["fullname"], "email": auth_user["email"], "role": auth_user["role"]})
    try:
        encrypted = encrypt_backup_payload(backup)
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 503
    stamp = time.strftime("%Y%m%d-%H%M%S", time.gmtime())
    record_audit_log(
        auth_user,
        "EXPORT_PRODUCTION_BACKUP",
        {
            "stores": list(backup["stores"].keys()),
            "generatedAt": backup["metadata"]["generatedAt"],
        },
    )
    return send_file(BytesIO(encrypted), mimetype="application/octet-stream", as_attachment=True, download_name=f"bawjiase-secure-backup-{stamp}.bcbbackup", max_age=0)


@app.route("/api/security/status", methods=["GET"])
def get_security_status():
    _, auth_user, error = require_portal_controller()
    if error:
        return error
    settings = load_portal_settings_store()
    try:
        mail_config()
        smtp_configured = True
    except RuntimeError:
        smtp_configured = False
    return jsonify({"security": {
        "passwordHashing": "Werkzeug scrypt/PBKDF2 adaptive hashing",
        "sessionTimeoutMinutes": settings.get("sessionTimeoutMinutes", 30),
        "maxLoginAttempts": MAX_LOGIN_ATTEMPTS,
        "lockoutMinutes": ACCOUNT_LOCKOUT_SECONDS // 60,
        "dataEncryptionConfigured": bool(env_secret("DATA_ENCRYPTION_KEY")),
        "backupEncryptionConfigured": bool(env_secret("BACKUP_ENCRYPTION_KEY")),
        "mfaEncryptionConfigured": mfa_configuration_available(),
        "smtpCredentialsConfigured": smtp_configured,
        "deliveryWebhookConfigured": bool(env_secret("DELIVERY_WEBHOOK_SECRET")),
        "httpOnlySessionCookies": True,
        "csrfProtection": True,
        "malwareScannerConfigured": bool(str(os.getenv("MALWARE_SCANNER_COMMAND", "")).strip()),
        "malwareScannerRequired": str(os.getenv("REQUIRE_MALWARE_SCANNER", "false")).strip().lower() in {"1", "true", "yes"},
        "payslipWorkerMode": str(os.getenv("PAYSLIP_WORKER_MODE", "embedded")).strip().lower(),
        "payslipWorkerHealthy": payslip_worker_status()["healthy"],
        "databaseBackend": DATABASE_STORE.backend,
        "forceHttps": str(os.getenv("FORCE_HTTPS", "false")).strip().lower() in {"1", "true", "yes"},
        "restrictPayslipDownloads": settings.get("restrictPayslipDownloads", True),
        "approvedPayrollOnly": True,
        "canManageBackups": boss_database_maintenance_enabled(),
    }})


@app.route("/api/backup/restore", methods=["POST", "OPTIONS"])
def restore_production_backup():
    preflight = handle_options()
    if preflight:
        return preflight
    _, auth_user, error = require_portal_controller()
    if error:
        return error
    if not boss_database_maintenance_enabled():
        return jsonify({"error": "Database restore is disabled to protect confidential bank records"}), 403
    data, error = require_json()
    if error:
        return error
    if str(data.get("confirmation", "")).strip() != "RESTORE":
        return jsonify({"error": "Type RESTORE to confirm database replacement"}), 400
    encoded = str(data.get("backupBase64", "")).strip()
    if not encoded or len(encoded) > 70_000_000:
        return jsonify({"error": "A valid backup file is required"}), 400
    key = env_secret("BACKUP_ENCRYPTION_KEY")
    if not key:
        return jsonify({"error": "BACKUP_ENCRYPTION_KEY is not configured"}), 503
    try:
        encrypted = base64.b64decode(encoded, validate=True)
        backup = json.loads(Fernet(key.encode("ascii")).decrypt(encrypted).decode("utf-8"))
    except (ValueError, TypeError, InvalidToken, json.JSONDecodeError):
        return jsonify({"error": "Backup is invalid, corrupted, or encrypted with a different key"}), 400
    metadata, stores = backup.get("metadata", {}), backup.get("stores", {})
    required = {"users", "passwords", "staffRecords", "payrollBatches", "salaryHistory", "auditLogs", "portalSettings"}
    if metadata.get("app") != "bawjiase-finance-payslip-platform" or int(metadata.get("schemaVersion", 0)) not in {2, 3} or not required.issubset(stores):
        return jsonify({"error": "Backup schema is not supported"}), 400
    if not all(isinstance(stores.get(key), list) for key in ["users", "staffRecords", "payrollBatches", "salaryHistory", "auditLogs"]):
        return jsonify({"error": "Backup data structure is invalid"}), 400
    if not isinstance(stores.get("passwords"), dict) or not isinstance(stores.get("portalSettings"), dict):
        return jsonify({"error": "Backup data structure is invalid"}), 400
    save_user_store(stores["users"])
    save_password_store(stores["passwords"])
    save_json_list_store(STAFF_RECORDS_STORE_PATH, stores["staffRecords"])
    save_json_list_store(PAYROLL_BATCHES_STORE_PATH, stores["payrollBatches"])
    save_json_list_store(SALARY_HISTORY_STORE_PATH, stores["salaryHistory"])
    save_json_list_store(EMAIL_DELIVERY_STORE_PATH, stores.get("emailDelivery", []))
    save_audit_logs_store(stores["auditLogs"])
    save_portal_settings_store(stores["portalSettings"])
    save_json_list_store(NOTIFICATIONS_STORE_PATH, stores.get("notifications", []))
    if isinstance(stores.get("mfa"), dict):
        save_mfa_store(stores["mfa"])
    record_audit_log(auth_user, "RESTORE_PRODUCTION_BACKUP", {"generatedAt": metadata.get("generatedAt"), "schemaVersion": metadata.get("schemaVersion")})
    save_sessions({})
    return jsonify({"ok": True, "message": "Encrypted backup restored. All users must sign in again."})


@app.route("/api/users", methods=["POST", "OPTIONS"])
def create_user_account():
    preflight = handle_options()
    if preflight:
        return preflight
    _, auth_user, error = require_staff_manager()
    if error:
        return error
    data, error = require_json()
    if error:
        return error
    try:
        email = validate_email(str(data.get("email", "")))
        fullname = normalize_required_text(data.get("fullname"), "Full name")
        department = normalize_portal_department_name(data.get("department"))
        branch = normalize_portal_branch_name(data.get("branch"))
        password = str(data.get("password", ""))
        validate_password_strength(password)
        if str(data.get("role", "")).strip() == "BossAdmin":
            return jsonify({"error": "Boss Admin accounts can only be provisioned from the secure server environment"}), 403
        role = normalize_role(data.get("role"), department)
        if role == "SuperAdmin" and auth_user["role"] != "SuperAdmin":
            return jsonify({"error": "Only a Super Admin can create another Super Admin"}), 403
        account_status = str(data.get("accountStatus") or "active").strip().lower()
        if account_status not in ACCOUNT_STATUSES:
            raise ValueError("Account status must be active, suspended, or disabled")
        users = load_user_store()
        if find_user_by_email(users, email):
            return jsonify({"error": "Email already registered"}), 400
        staff_record_id = str(data.get("staffRecordId") or "").strip()
        if staff_record_id:
            staff_record = next((item for item in load_json_list_store(STAFF_RECORDS_STORE_PATH) if item.get("id") == staff_record_id), None)
            if not staff_record or staff_record.get("employmentStatus") != "active":
                return jsonify({"error": "Select an active Staff Directory record"}), 400
            if str(staff_record.get("email", "")).lower() != email:
                return jsonify({"error": "The user email must match the linked Staff Directory email"}), 400
            if any(item.get("staffRecordId") == staff_record_id for item in users):
                return jsonify({"error": "This Staff Directory record is already linked to a user"}), 409
        user = normalize_user({
            "id": f"user-{int(time.time() * 1000)}",
            "fullname": fullname,
            "phone": str(data.get("phone", "")).strip(),
            "email": email,
            "role": role,
            "position": str(data.get("position") or "Staff").strip(),
            "department": department,
            "branch": branch,
            "staffRecordId": staff_record_id or None,
            "accountStatus": account_status,
            "isVerified": True,
            "registrationTime": now_ms(),
            "lastSeen": 0,
            "isArchived": False,
            "mustChangePassword": True,
        })
        users.append(user)
        save_user_store(users)
        passwords = load_password_store()
        passwords[email] = hash_password_for_storage(password)
        save_password_store(passwords)
        record_audit_log(auth_user, "CREATE_USER", staff_audit_target(user))
        return jsonify({"ok": True, "user": user}), 201
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400


@app.route("/api/users/<user_id>/reset-password", methods=["POST", "OPTIONS"])
def admin_reset_user_password(user_id: str):
    preflight = handle_options()
    if preflight:
        return preflight
    _, auth_user, error = require_staff_manager()
    if error:
        return error
    data, error = require_json()
    if error:
        return error
    users = load_user_store()
    user = find_user_by_id(users, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
    if user.get("role") == "BossAdmin":
        return jsonify({"error": "The platform controller account is isolated from bank user administration"}), 403
    if user["role"] == "SuperAdmin" and auth_user["role"] != "SuperAdmin":
        return jsonify({"error": "Only a Super Admin can reset another Super Admin password"}), 403
    password = str(data.get("password", ""))
    try:
        validate_password_strength(password)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    passwords = load_password_store()
    passwords[user["email"]] = hash_password_for_storage(password)
    save_password_store(passwords)
    user["mustChangePassword"] = True
    save_user_store(users)
    revoke_user_sessions(user_id)
    record_audit_log(auth_user, "ADMIN_PASSWORD_RESET", staff_audit_target(user))
    return jsonify({"ok": True})


@app.route("/api/users/<user_id>/reset-mfa", methods=["POST", "OPTIONS"])
def admin_reset_user_mfa(user_id: str):
    preflight = handle_options()
    if preflight:
        return preflight
    _, auth_user, error = require_staff_manager()
    if error:
        return error
    users = load_user_store()
    user = find_user_by_id(users, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
    if user.get("role") == "BossAdmin":
        return jsonify({"error": "The platform controller account is isolated from bank user administration"}), 403
    if user_id == auth_user["id"]:
        return jsonify({"error": "Use your profile security controls to disable your own MFA"}), 400
    if user["role"] == "SuperAdmin" and auth_user["role"] != "SuperAdmin":
        return jsonify({"error": "Only a Super Admin can reset another Super Admin's MFA"}), 403
    store = load_mfa_store()
    store.pop(user_id, None)
    save_mfa_store(store)
    revoke_user_sessions(user_id)
    record_audit_log(auth_user, "ADMIN_MFA_RESET", staff_audit_target(user))
    return jsonify({"ok": True})


@app.route("/api/users", methods=["GET"])
def list_users():
    _, _, error = require_staff_manager()
    if error:
        return error
    bank_users = [user for user in load_user_store() if user.get("role") != "BossAdmin"]
    return jsonify({"users": serialize_users_with_presence(bank_users)})


@app.route("/api/users/<user_id>", methods=["GET"])
def get_user(user_id: str):
    _, auth_user, error = require_authenticated_user()
    if error:
        return error
    if auth_user["id"] != user_id and auth_user["role"] not in {"SuperAdmin", "Admin"}:
        return jsonify({"error": "Access denied"}), 403
    users = load_user_store()
    user = find_user_by_id(users, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
    if user.get("role") == "BossAdmin" and auth_user.get("id") != user_id:
        return jsonify({"error": "Access denied"}), 403
    presence = prune_presence(load_presence_store())
    save_presence_store(presence)
    return jsonify({"user": serialize_user_with_presence(user, presence)})


@app.route("/api/users/<user_id>/activity", methods=["GET"])
def get_user_activity(user_id: str):
    _, _, error = require_staff_manager()
    if error:
        return error
    user = find_user_by_id(load_user_store(), user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
    if user.get("role") == "BossAdmin":
        return jsonify({"error": "The platform controller account is isolated from bank user administration"}), 403
    identifiers = [str(user_id).lower(), str(user.get("email", "")).lower(), str(user.get("fullname", "")).lower()]
    activity = []
    for item in load_audit_logs_store():
        searchable = " ".join(str(value) for value in item.values()).lower()
        if str(item.get("actorId", "")) == user_id or any(value and value in searchable for value in identifiers):
            activity.append(item)
    activity.sort(key=lambda item: int(item.get("timestamp", 0) or 0), reverse=True)
    return jsonify({"activity": activity[:100]})


@app.route("/api/users/<user_id>/profile", methods=["POST", "OPTIONS"])
def update_profile(user_id: str):
    preflight = handle_options()
    if preflight:
        return preflight
    _, auth_user, error = require_authenticated_user()
    if error:
        return error
    if auth_user["id"] != user_id and auth_user["role"] not in {"SuperAdmin", "Admin"}:
        return jsonify({"error": "Access denied"}), 403
    data, error = require_json()
    if error:
        return error
    users = load_user_store()
    user = find_user_by_id(users, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    can_manage_org_fields = auth_user["role"] in {"SuperAdmin", "Admin"}
    before_profile = {
        "fullname": user.get("fullname"),
        "phone": user.get("phone"),
        "position": user.get("position"),
        "department": user.get("department"),
        "branch": user.get("branch"),
    }
    previous_image = str(user.get("imageFile") or "").strip()
    try:
        requested_department = normalize_portal_department_name(data.get("department", user["department"]))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    if requested_department == "IT" and user["department"] != "IT":
        it_access_code = str(load_portal_settings_store().get("itAccessCode") or IT_ACCESS_CODE)
        if not it_access_code:
            return jsonify({"error": "IT security code is not configured on the server."}), 500
        if str(data.get("accessCode", "")).strip() != it_access_code:
            return jsonify({"error": "Access denied: invalid IT security code."}), 400
    if "fullname" in data:
        try:
            user["fullname"] = normalize_required_text(data.get("fullname"), "Full name")
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
    if "phone" in data:
        try:
            user["phone"] = normalize_phone(data.get("phone")) or user["phone"]
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
    if "position" in data:
        user["position"] = str(data.get("position", "")).strip() or user["position"]
    if "staffRecordId" in data and not user.get("staffRecordId"):
        staff_record_id = str(data.get("staffRecordId") or "").strip()
        if staff_record_id:
            staff_record = next((item for item in load_json_list_store(STAFF_RECORDS_STORE_PATH) if item.get("id") == staff_record_id), None)
            if not staff_record or str(staff_record.get("email", "")).lower() != user["email"]:
                return jsonify({"error": "Linked staff record must exist and use the same email"}), 400
            if any(item.get("staffRecordId") == staff_record_id and item.get("id") != user_id for item in users):
                return jsonify({"error": "This staff record is already linked"}), 409
            user["staffRecordId"] = staff_record_id
    if "department" in data and can_manage_org_fields and requested_department:
        user["department"] = requested_department
        if user.get("role") != "Supervisor":
            user["role"] = role_from_department(requested_department)
        user["permissions"] = normalize_user_permissions(user.get("permissions"), user["role"])
        user["managedBranches"] = normalize_scope_list(
            user.get("managedBranches"),
            empty_default=["ALL"] if user["role"] in {"SuperAdmin", "Admin"} else [],
        )
        if user["role"] != "Supervisor":
            user["managedDepartmentsByBranch"] = {}
    if "branch" in data and can_manage_org_fields:
        try:
            user["branch"] = normalize_portal_branch_name(data.get("branch"))
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
    if "imageFile" in data:
        image_file = data.get("imageFile")
        user["imageFile"] = str(image_file) if image_file else None
        if previous_image.startswith("LOCAL:") and previous_image != user["imageFile"]:
            remove_uploaded_file_if_unused(previous_image.replace("LOCAL:", "", 1).strip())
    save_user_store(users)
    after_profile = {
        "fullname": user.get("fullname"),
        "phone": user.get("phone"),
        "position": user.get("position"),
        "department": user.get("department"),
        "branch": user.get("branch"),
    }
    if after_profile != before_profile:
        record_audit_log(
            auth_user,
            "UPDATE_PROFILE",
            staff_audit_target(
                user,
                {
                    "changedBySelf": auth_user["id"] == user["id"],
                    "before": before_profile,
                    "after": after_profile,
                },
            ),
        )
    current_image = str(user.get("imageFile") or "").strip()
    if "imageFile" in data and current_image != previous_image:
        if previous_image and current_image:
            action = "CHANGE_PROFILE_PHOTO"
        elif current_image:
            action = "ADD_PROFILE_PHOTO"
        else:
            action = "REMOVE_PROFILE_PHOTO"
        record_audit_log(
            auth_user,
            action,
            staff_audit_target(
                user,
                {"changedBySelf": auth_user["id"] == user["id"]},
            ),
        )
    return jsonify({"ok": True, "user": user})


@app.route("/api/staff/active", methods=["GET"])
def get_active_staff():
    _, auth_user, error = require_authenticated_user()
    if error:
        return error
    if auth_user.get("role") == "BossAdmin":
        return jsonify({"error": "Bank staff records are not available to the platform controller"}), 403
    users = load_user_store()
    active_users = [
        user for user in users
        if user.get("role") != "BossAdmin" and user["isActive"] and not user["isArchived"] and user["fullname"] not in {"MASTER ADMIN", "System Admin"}
    ]
    return jsonify({"users": serialize_users_with_presence(active_users)})


PAYROLL_INCOME_FIELDS = [
    "basicSalary", "supervisionAllowance", "riskAllowance", "responsibilityAllowance",
    "entertainmentAllowance", "fuelTransportAllowance", "rentUtilityAllowance", "otherAllowances",
]
PAYROLL_MANUAL_DEDUCTION_FIELDS = ["payeIncomeTax", "staffWelfare", "icuDues", "loans", "otherDeductions"]
PAYROLL_MANUAL_FIELDS = PAYROLL_INCOME_FIELDS + PAYROLL_MANUAL_DEDUCTION_FIELDS
PAYROLL_TRACKED_FIELDS = PAYROLL_MANUAL_FIELDS + [
    "ssf", "esp", "pf", "totalIncome", "totalDeductions", "netSalary", "employerSsf", "employerPf",
]
PAYROLL_FIELD_LABELS = {
    "basicSalary": "Basic Salary", "supervisionAllowance": "Supervision Allowance",
    "riskAllowance": "Risk Allowance", "responsibilityAllowance": "Responsibility Allowance",
    "entertainmentAllowance": "Entertainment Allowance", "fuelTransportAllowance": "Fuel/Transport Allowance",
    "rentUtilityAllowance": "Rent/Utility Allowance", "otherAllowances": "Other Allowances",
    "ssf": "5.5% SSF", "esp": "4.5% ESP", "pf": "4.5% PF", "payeIncomeTax": "P.A.Y.E Income Tax",
    "staffWelfare": "Staff Welfare", "icuDues": "ICU Dues", "loans": "Loans",
    "otherDeductions": "Other Deductions", "totalIncome": "Total Income",
    "totalDeductions": "Total Deductions", "netSalary": "Net Salary",
    "employerSsf": "Employer SSF", "employerPf": "Employer PF",
}


def payroll_number(value: object, field_name: str, allow_empty: bool = True, maximum: float = 1_000_000) -> float | None:
    if value is None or str(value).strip() == "":
        if allow_empty:
            return None
        raise ValueError(f"{field_name} is required")
    try:
        amount = round(float(value), 2)
    except (TypeError, ValueError):
        raise ValueError(f"{field_name} must be a valid amount")
    if amount < 0:
        raise ValueError(f"{field_name} cannot be negative")
    if amount > maximum:
        raise ValueError(f"{field_name} contains an unusually large amount")
    return amount


def calculate_payroll_entry(
    data: dict,
    existing: dict | None = None,
    contribution_rates: dict | None = None,
    validation_rules: dict | None = None,
) -> dict:
    current = dict(existing or {})
    rates = normalize_contribution_rates(contribution_rates)
    rules = normalize_payroll_validation_rules(validation_rules)
    entry = {
        "staffRecordId": str(data.get("staffRecordId", current.get("staffRecordId", ""))),
        "staffId": str(data.get("staffId", current.get("staffId", ""))),
        "fullName": str(data.get("fullName", current.get("fullName", ""))),
        "email": str(data.get("email", current.get("email", ""))).strip().lower(),
        "department": str(data.get("department", current.get("department", ""))),
        "branch": str(data.get("branch", current.get("branch", ""))),
    }
    for field in PAYROLL_MANUAL_FIELDS:
        maximum = rules["maxBasicSalary"] if field == "basicSalary" else rules["maxOtherAmount"]
        entry[field] = payroll_number(data.get(field, current.get(field)), field, maximum=maximum)
    basic = float(entry.get("basicSalary") or 0)
    entry["ssf"] = round(basic * rates["employeeSsf"] / 100, 2)
    entry["esp"] = round(basic * rates["employeeEsp"] / 100, 2)
    entry["pf"] = round(basic * rates["employeePf"] / 100, 2)
    entry["employerSsf"] = round(basic * rates["employerSsf"] / 100, 2)
    entry["employerPf"] = round(basic * rates["employerPf"] / 100, 2)
    entry["totalIncome"] = round(sum(float(entry.get(field) or 0) for field in PAYROLL_INCOME_FIELDS), 2)
    entry["totalDeductions"] = round(entry["ssf"] + entry["esp"] + entry["pf"] + sum(float(entry.get(field) or 0) for field in PAYROLL_MANUAL_DEDUCTION_FIELDS), 2)
    entry["netSalary"] = round(entry["totalIncome"] - entry["totalDeductions"], 2)
    return entry


def payroll_entry_issues(entry: dict, validation_rules: dict | None = None, email_domain: str | None = None) -> list[str]:
    rules = normalize_payroll_validation_rules(validation_rules)
    official_domain = normalize_email_domain(email_domain or load_portal_settings_store().get("emailDomain"))
    issues = []
    missing = [field for field in PAYROLL_MANUAL_FIELDS if entry.get(field) is None]
    if missing:
        issues.append("Empty salary fields")
    if not entry.get("email"):
        issues.append("Missing email address")
    elif not str(entry.get("email")).endswith(official_domain):
        issues.append("Invalid email address")
    if float(entry.get("basicSalary") or 0) <= 0:
        issues.append("Basic salary must be greater than zero")
    if float(entry.get("basicSalary") or 0) > rules["maxBasicSalary"]:
        issues.append("Basic salary exceeds the configured warning limit")
    if any(float(entry.get(field) or 0) > rules["maxOtherAmount"] for field in PAYROLL_MANUAL_FIELDS if field != "basicSalary"):
        issues.append("Unusually large figure")
    if float(entry.get("netSalary") or 0) < 0:
        issues.append("Deductions exceed income")
    return issues


def payroll_batch_summary(entries: list[dict]) -> dict:
    return {
        "staffCount": len(entries),
        "totalIncome": round(sum(float(item.get("totalIncome") or 0) for item in entries), 2),
        "totalDeductions": round(sum(float(item.get("totalDeductions") or 0) for item in entries), 2),
        "totalNetSalary": round(sum(float(item.get("netSalary") or 0) for item in entries), 2),
        "totalEmployerSsf": round(sum(float(item.get("employerSsf") or 0) for item in entries), 2),
        "totalEmployerPf": round(sum(float(item.get("employerPf") or 0) for item in entries), 2),
    }


def approval_event(action: str, user: dict, comments: str = "") -> dict:
    return {
        "id": f"approval-{now_ms()}-{secrets.randbelow(100000):05d}",
        "action": action,
        "actorId": user.get("id"),
        "actorName": user.get("fullname"),
        "actorRole": user.get("role"),
        "timestamp": now_ms(),
        "comments": comments,
    }


def payroll_review_summary(batch: dict) -> dict:
    rules = normalize_payroll_validation_rules(batch.get("payrollValidationRules"))
    official_domain = normalize_email_domain(batch.get("emailDomain") or OFFICIAL_EMAIL_DOMAIN)
    staff_by_id = {item.get("id"): item for item in load_json_list_store(STAFF_RECORDS_STORE_PATH)}
    baseline_by_staff = {item.get("staffRecordId"): item for item in batch.get("baselineEntries", [])}
    salary_changes, missing_emails, invalid_emails, inactive_staff, suspicious = [], [], [], [], []
    for entry in batch.get("entries", []):
        staff = staff_by_id.get(entry.get("staffRecordId"), {})
        identity = {"staffRecordId": entry.get("staffRecordId"), "staffId": entry.get("staffId"), "fullName": entry.get("fullName")}
        changes = payroll_entry_changes(entry, baseline_by_staff.get(entry.get("staffRecordId")))
        if changes:
            salary_changes.append({**identity, "changeCount": len(changes), "reason": entry.get("changeReason", "")})
        email = str(entry.get("email") or "").strip().lower()
        if not email:
            missing_emails.append(identity)
        elif not email.endswith(official_domain):
            invalid_emails.append({**identity, "email": email})
        if str(staff.get("employmentStatus", "inactive")).lower() != "active":
            inactive_staff.append(identity)
        flags = []
        if float(entry.get("basicSalary") or 0) > rules["maxBasicSalary"]:
            flags.append(f"Basic salary exceeds GHS {rules['maxBasicSalary']:,.2f}")
        if any(float(entry.get(field) or 0) > rules["maxOtherAmount"] for field in PAYROLL_MANUAL_FIELDS if field != "basicSalary"):
            flags.append(f"Allowance or deduction exceeds GHS {rules['maxOtherAmount']:,.2f}")
        if float(entry.get("netSalary") or 0) < 0:
            flags.append("Deductions exceed income")
        if float(entry.get("totalIncome") or 0) > 0 and float(entry.get("totalDeductions") or 0) > float(entry.get("totalIncome") or 0) * rules["deductionWarningPercent"] / 100:
            flags.append(f"Deductions exceed {rules['deductionWarningPercent']:g}% of income")
        if flags:
            suspicious.append({**identity, "issues": flags})
    summary = payroll_batch_summary(batch.get("entries", []))
    return {
        **summary,
        "salaryChangeCount": len(salary_changes), "missingEmailCount": len(missing_emails),
        "invalidEmailCount": len(invalid_emails), "inactiveStaffCount": len(inactive_staff),
        "suspiciousFigureCount": len(suspicious), "salaryChanges": salary_changes,
        "missingEmails": missing_emails, "invalidEmails": invalid_emails,
        "inactiveStaff": inactive_staff, "suspiciousFigures": suspicious,
    }


def enrich_payroll_batch(batch: dict) -> dict:
    batch.setdefault("contributionRates", normalize_contribution_rates(None))
    batch.setdefault("contributionRateEffectiveMonth", "2000-01")
    batch.setdefault("payrollValidationRules", normalize_payroll_validation_rules(None))
    batch["reviewSummary"] = payroll_review_summary(batch)
    batch.setdefault("approvalHistory", [])
    return batch


def payroll_entry_changes(entry: dict, baseline: dict | None) -> list[dict]:
    baseline = baseline or {}
    changes = []
    for field in PAYROLL_TRACKED_FIELDS:
        old_value = baseline.get(field)
        new_value = entry.get(field)
        old_number = None if old_value is None else round(float(old_value or 0), 2)
        new_number = None if new_value is None else round(float(new_value or 0), 2)
        if old_number != new_number:
            changes.append({"field": field, "fieldLabel": PAYROLL_FIELD_LABELS.get(field, field), "oldValue": old_number, "newValue": new_number})
    return changes


def payroll_baseline(entries: list[dict]) -> list[dict]:
    return [{key: item.get(key) for key in ["staffRecordId", "staffId", "fullName", *PAYROLL_TRACKED_FIELDS]} for item in entries]


@app.route("/api/payroll-batches", methods=["GET"])
def list_payroll_batches():
    _, _, error = require_payroll_viewer()
    if error:
        return error
    batches = load_json_list_store(PAYROLL_BATCHES_STORE_PATH)
    batches.sort(key=lambda item: str(item.get("period", "")), reverse=True)
    return jsonify({"batches": [enrich_payroll_batch(batch) for batch in batches]})


@app.route("/api/payroll-batches", methods=["POST", "OPTIONS"])
def create_payroll_batch():
    preflight = handle_options()
    if preflight:
        return preflight
    _, auth_user, error = require_payroll_preparer()
    if error:
        return error
    data, error = require_json()
    if error:
        return error
    period = str(data.get("period", "")).strip()
    name = str(data.get("name", "")).strip()
    if len(period) != 7 or period[4] != "-" or not period.replace("-", "").isdigit():
        return jsonify({"error": "Payroll month is required"}), 400
    if not name:
        return jsonify({"error": "Payroll batch name is required"}), 400
    batches = load_json_list_store(PAYROLL_BATCHES_STORE_PATH)
    if any(item.get("period") == period and item.get("status") != "cancelled" and not item.get("revisionOf") for item in batches):
        return jsonify({"error": "A payroll batch already exists for this month"}), 400
    active_staff = [item for item in load_json_list_store(STAFF_RECORDS_STORE_PATH) if item.get("employmentStatus") == "active"]
    source_id = str(data.get("sourceBatchId", "")).strip()
    source = next((item for item in batches if item.get("id") == source_id), None) if source_id else None
    if source_id and (not source or source.get("status") == "cancelled"):
        return jsonify({"error": "The selected source payroll is not available"}), 400
    if source and str(source.get("period", "")) >= period:
        return jsonify({"error": "Payroll can only be copied from an earlier month"}), 400
    portal_settings = load_portal_settings_store()
    rate_profile = contribution_rate_profile_for_period(period, portal_settings)
    contribution_rates = rate_profile["rates"]
    validation_rules = normalize_payroll_validation_rules(portal_settings.get("payrollValidationRules"))
    source_entries = {str(item.get("staffId", "")).lower(): item for item in (source.get("entries", []) if source else [])}
    entries = []
    baselines = []
    for item in active_staff:
        previous = source_entries.get(str(item.get("staffId", "")).lower(), {})
        payload = {
            "staffRecordId": item.get("id"), "staffId": item.get("staffId"), "fullName": item.get("fullName"),
            "email": item.get("email"), "department": item.get("department"), "branch": item.get("branch"),
            **{field: previous.get(field) for field in PAYROLL_MANUAL_FIELDS},
        }
        calculated = calculate_payroll_entry(payload, contribution_rates=contribution_rates, validation_rules=validation_rules)
        if previous:
            baseline = {
                "staffRecordId": item.get("id"), "staffId": item.get("staffId"), "fullName": item.get("fullName"),
                **{field: previous.get(field) for field in PAYROLL_TRACKED_FIELDS},
            }
            change_reason = ""
            if payroll_entry_changes(calculated, baseline):
                change_reason = f"Statutory contribution rates or payroll values updated effective {rate_profile['effectiveMonth']}"
        else:
            baseline = {key: calculated.get(key) for key in ["staffRecordId", "staffId", "fullName", *PAYROLL_TRACKED_FIELDS]}
            change_reason = ""
        entries.append({**calculated, "changeReason": change_reason})
        baselines.append(baseline)
    now = now_ms()
    batch = {
        "id": f"payroll-{now}-{secrets.randbelow(10000):04d}", "name": name, "period": period,
        "status": "draft", "entries": entries, "baselineEntries": baselines,
        "summary": payroll_batch_summary(entries), "sourceBatchId": source.get("id") if source else None,
        "sourceBatchName": source.get("name") if source else None, "version": 1, "revisionOf": None,
        "contributionRates": contribution_rates,
        "contributionRateEffectiveMonth": rate_profile["effectiveMonth"],
        "payrollValidationRules": validation_rules,
        "emailDomain": portal_settings["emailDomain"],
        "requiresChangeApproval": False, "pendingChangeCount": 0,
        "createdBy": auth_user.get("fullname"), "createdById": auth_user.get("id"),
        "createdAt": now, "updatedAt": now, "submittedAt": None,
        "approvalHistory": [approval_event("created", auth_user, "Payroll batch created")],
    }
    batches.append(batch)
    save_json_list_store(PAYROLL_BATCHES_STORE_PATH, batches)
    record_audit_log(auth_user, "CREATE_PAYROLL_BATCH", {"batchId": batch["id"], "name": name, "period": period, "staffCount": len(entries), "copiedFrom": batch.get("sourceBatchName")})
    return jsonify({"ok": True, "batch": batch}), 201


@app.route("/api/payroll-batches/<batch_id>", methods=["GET"])
def get_payroll_batch(batch_id: str):
    _, _, error = require_payroll_viewer()
    if error:
        return error
    batch = next((item for item in load_json_list_store(PAYROLL_BATCHES_STORE_PATH) if item.get("id") == batch_id), None)
    if not batch:
        return jsonify({"error": "Payroll batch not found"}), 404
    return jsonify({"batch": enrich_payroll_batch(batch)})


@app.route("/api/payroll-batches/<batch_id>/draft", methods=["POST", "OPTIONS"])
def save_payroll_batch_draft(batch_id: str):
    preflight = handle_options()
    if preflight:
        return preflight
    _, auth_user, error = require_payroll_preparer()
    if error:
        return error
    data, error = require_json()
    if error:
        return error
    batches = load_json_list_store(PAYROLL_BATCHES_STORE_PATH)
    batch = next((item for item in batches if item.get("id") == batch_id), None)
    if not batch:
        return jsonify({"error": "Payroll batch not found"}), 404
    if batch.get("status") not in {"draft", "rejected", "corrected"}:
        return jsonify({"error": "Only draft or returned payroll batches can be edited"}), 409
    incoming = data.get("entries")
    if not isinstance(incoming, list) or len(incoming) != len(batch.get("entries", [])):
        return jsonify({"error": "The payroll entry list is incomplete"}), 400
    existing_by_staff = {item.get("staffRecordId"): item for item in batch.get("entries", [])}
    baseline_by_staff = {item.get("staffRecordId"): item for item in batch.get("baselineEntries", [])}
    status_before_save = batch.get("status")
    audit_changes = []
    try:
        entries = []
        for item in incoming:
            existing_entry = existing_by_staff.get(item.get("staffRecordId"), {})
            calculated = calculate_payroll_entry(
                item,
                existing_entry,
                contribution_rates=batch.get("contributionRates"),
                validation_rules=batch.get("payrollValidationRules"),
            )
            changes = payroll_entry_changes(calculated, baseline_by_staff.get(calculated.get("staffRecordId")))
            saved_changes = payroll_entry_changes(calculated, existing_entry)
            reason = str(item.get("changeReason") or existing_by_staff.get(item.get("staffRecordId"), {}).get("changeReason") or "").strip()
            if changes and not reason:
                raise ValueError(f"Reason for change is required for {calculated.get('fullName')}")
            calculated["changeReason"] = reason if changes else ""
            entries.append(calculated)
            if saved_changes:
                audit_changes.append({"entry": calculated, "changes": saved_changes, "reason": reason})
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    batch["entries"] = entries
    batch["summary"] = payroll_batch_summary(entries)
    batch["pendingChangeCount"] = sum(len(payroll_entry_changes(item, baseline_by_staff.get(item.get("staffRecordId")))) for item in entries)
    batch["requiresChangeApproval"] = batch["pendingChangeCount"] > 0
    if batch.get("status") == "rejected":
        batch["status"] = "corrected"
        batch.setdefault("approvalHistory", []).append(approval_event("corrected", auth_user, "Corrections saved by Finance Officer"))
    batch["updatedAt"] = now_ms()
    save_json_list_store(PAYROLL_BATCHES_STORE_PATH, batches)
    record_audit_log(auth_user, "SAVE_PAYROLL_DRAFT", {"batchId": batch_id, "name": batch.get("name")})
    for change_set in audit_changes:
        entry = change_set["entry"]
        old_values = {item["fieldLabel"]: item["oldValue"] for item in change_set["changes"]}
        new_values = {item["fieldLabel"]: item["newValue"] for item in change_set["changes"]}
        action = "CORRECT_PAYSLIP" if status_before_save in {"rejected", "corrected"} else "EDIT_SALARY"
        record_audit_log(auth_user, action, {"batchId": batch_id, "period": batch.get("period"), "staffId": entry.get("staffId"), "staffName": entry.get("fullName"), "department": entry.get("department"), "branch": entry.get("branch"), "oldValue": old_values, "newValue": new_values, "reason": change_set["reason"]})
    return jsonify({"ok": True, "batch": batch})


@app.route("/api/payroll-batches/<batch_id>/submit", methods=["POST", "OPTIONS"])
def submit_payroll_batch(batch_id: str):
    preflight = handle_options()
    if preflight:
        return preflight
    _, auth_user, error = require_payroll_preparer()
    if error:
        return error
    batches = load_json_list_store(PAYROLL_BATCHES_STORE_PATH)
    batch = next((item for item in batches if item.get("id") == batch_id), None)
    if not batch:
        return jsonify({"error": "Payroll batch not found"}), 404
    if batch.get("status") not in {"draft", "corrected"}:
        return jsonify({"error": "Only draft or corrected payroll batches can be submitted"}), 409
    invalid = [
        {"staffId": item.get("staffId"), "name": item.get("fullName"), "issues": payroll_entry_issues(item, batch.get("payrollValidationRules"), batch.get("emailDomain") or OFFICIAL_EMAIL_DOMAIN)}
        for item in batch.get("entries", [])
        if payroll_entry_issues(item, batch.get("payrollValidationRules"), batch.get("emailDomain") or OFFICIAL_EMAIL_DOMAIN)
    ]
    if invalid:
        return jsonify({"error": "Resolve all payroll validation issues before submission", "invalidEntries": invalid}), 400
    baseline_by_staff = {item.get("staffRecordId"): item for item in batch.get("baselineEntries", [])}
    history = load_json_list_store(SALARY_HISTORY_STORE_PATH)
    # A corrected resubmission replaces this batch's pending/rejected change rows;
    # the decision trail itself remains permanent in approvalHistory and audit logs.
    history = [item for item in history if item.get("batchId") != batch_id]
    history_entries = []
    for entry in batch.get("entries", []):
        changes = payroll_entry_changes(entry, baseline_by_staff.get(entry.get("staffRecordId")))
        reason = str(entry.get("changeReason", "")).strip()
        if changes and not reason:
            return jsonify({"error": f"Reason for change is required for {entry.get('fullName')}"}), 400
        for change in changes:
            history_entries.append({
                "id": f"salary-change-{now_ms()}-{secrets.randbelow(100000):05d}",
                "staffRecordId": entry.get("staffRecordId"), "staffId": entry.get("staffId"),
                "staffName": entry.get("fullName"), "batchId": batch_id, "batchName": batch.get("name"),
                "effectiveMonth": batch.get("period"), "version": batch.get("version", 1),
                **change, "reason": reason, "changedBy": auth_user.get("fullname"),
                "changedById": auth_user.get("id"), "changedAt": now_ms(), "approvalStatus": "pending",
            })
    history.extend(history_entries)
    save_json_list_store(SALARY_HISTORY_STORE_PATH, history)
    maker_checker = str(os.getenv("ENFORCE_MAKER_CHECKER", "true")).strip().lower() in {"1", "true", "yes"}
    approval_required = maker_checker or load_portal_settings_store().get("payrollApprovalRequired", True) or bool(history_entries)
    batch["status"] = "submitted" if approval_required else "approved"
    batch["submittedAt"] = now_ms()
    batch["submittedBy"] = auth_user.get("fullname")
    batch["updatedAt"] = now_ms()
    batch["requiresChangeApproval"] = bool(history_entries)
    batch["salaryChangeCount"] = len(history_entries)
    batch.setdefault("approvalHistory", []).append(approval_event("submitted", auth_user, str((request.get_json(silent=True) or {}).get("comments", "")).strip()))
    if not approval_required:
        batch["approvedAt"] = now_ms()
        batch["approvedBy"] = "System policy"
        batch.setdefault("approvalHistory", []).append(approval_event("approved", auth_user, "Automatically approved because manual approval is disabled and no salary changes were detected"))
        for item in history:
            if item.get("batchId") == batch_id:
                item["approvalStatus"] = "approved"
        save_json_list_store(SALARY_HISTORY_STORE_PATH, history)
    save_json_list_store(PAYROLL_BATCHES_STORE_PATH, batches)
    record_audit_log(auth_user, "SUBMIT_PAYROLL_FOR_APPROVAL" if approval_required else "AUTO_APPROVE_PAYROLL", {"batchId": batch_id, "name": batch.get("name"), **batch.get("summary", {})})
    return jsonify({"ok": True, "batch": batch})


@app.route("/api/payroll-batches/<batch_id>/cancel", methods=["POST", "OPTIONS"])
def cancel_payroll_batch(batch_id: str):
    preflight = handle_options()
    if preflight:
        return preflight
    _, auth_user, error = require_payroll_preparer()
    if error:
        return error
    data, error = require_json()
    if error:
        return error
    reason = str(data.get("reason", "")).strip()
    if not reason:
        return jsonify({"error": "Cancellation reason is required"}), 400
    batches = load_json_list_store(PAYROLL_BATCHES_STORE_PATH)
    batch = next((item for item in batches if item.get("id") == batch_id), None)
    if not batch:
        return jsonify({"error": "Payroll batch not found"}), 404
    if batch.get("status") != "draft":
        return jsonify({"error": "Only draft payroll batches can be cancelled"}), 409
    batch["status"] = "cancelled"
    batch["cancelledAt"] = now_ms()
    batch["cancelledBy"] = auth_user.get("fullname")
    batch["cancellationReason"] = reason
    batch["updatedAt"] = now_ms()
    save_json_list_store(PAYROLL_BATCHES_STORE_PATH, batches)
    record_audit_log(auth_user, "CANCEL_PAYROLL_BATCH", {"batchId": batch_id, "name": batch.get("name"), "reason": reason})
    return jsonify({"ok": True, "batch": batch})


@app.route("/api/payroll-batches/<batch_id>/approve", methods=["POST", "OPTIONS"])
def approve_payroll_batch(batch_id: str):
    preflight = handle_options()
    if preflight:
        return preflight
    _, auth_user, error = require_payroll_approver()
    if error:
        return error
    data = request.get_json(silent=True) or {}
    comments = str(data.get("comments", "")).strip()
    batches = load_json_list_store(PAYROLL_BATCHES_STORE_PATH)
    batch = next((item for item in batches if item.get("id") == batch_id), None)
    if not batch:
        return jsonify({"error": "Payroll batch not found"}), 404
    if batch.get("status") != "submitted":
        return jsonify({"error": "Only submitted payroll batches can be approved"}), 409
    if str(batch.get("createdById") or "") == str(auth_user.get("id") or ""):
        record_audit_log(auth_user, "BLOCK_SELF_APPROVAL", {"batchId": batch_id, "name": batch.get("name")})
        return jsonify({"error": "Maker-checker control: the payroll preparer cannot approve their own batch"}), 403
    batch["status"] = "approved"
    batch["approvedAt"] = now_ms()
    batch["approvedBy"] = auth_user.get("fullname")
    batch["updatedAt"] = now_ms()
    batch["decisionComments"] = comments
    batch.setdefault("approvalHistory", []).append(approval_event("approved", auth_user, comments))
    history = load_json_list_store(SALARY_HISTORY_STORE_PATH)
    for item in history:
        if item.get("batchId") == batch_id:
            item["approvalStatus"] = "approved"
            item["approvedBy"] = auth_user.get("fullname")
            item["approvedAt"] = batch["approvedAt"]
    save_json_list_store(SALARY_HISTORY_STORE_PATH, history)
    save_json_list_store(PAYROLL_BATCHES_STORE_PATH, batches)
    record_audit_log(auth_user, "APPROVE_PAYROLL_BATCH", {"batchId": batch_id, "name": batch.get("name"), "salaryChangeCount": batch.get("salaryChangeCount", 0)})
    return jsonify({"ok": True, "batch": batch})


@app.route("/api/payroll-batches/<batch_id>/decision", methods=["POST", "OPTIONS"])
def decide_payroll_batch(batch_id: str):
    preflight = handle_options()
    if preflight:
        return preflight
    _, auth_user, error = require_payroll_approver()
    if error:
        return error
    data, error = require_json()
    if error:
        return error
    action = str(data.get("action", "")).strip().lower()
    comments = str(data.get("comments", "")).strip()
    if action not in {"reject", "request_correction"}:
        return jsonify({"error": "Decision must be reject or request_correction"}), 400
    if not comments:
        return jsonify({"error": "A reason is required when rejecting or requesting correction"}), 400
    batches = load_json_list_store(PAYROLL_BATCHES_STORE_PATH)
    batch = next((item for item in batches if item.get("id") == batch_id), None)
    if not batch:
        return jsonify({"error": "Payroll batch not found"}), 404
    if batch.get("status") != "submitted":
        return jsonify({"error": "Only submitted payroll batches can be returned"}), 409
    now = now_ms()
    batch["status"] = "rejected"
    batch["rejectedAt"] = now
    batch["rejectedBy"] = auth_user.get("fullname")
    batch["rejectionReason"] = comments
    batch["decisionType"] = action
    batch["updatedAt"] = now
    batch.setdefault("approvalHistory", []).append(approval_event(action, auth_user, comments))
    history = load_json_list_store(SALARY_HISTORY_STORE_PATH)
    for item in history:
        if item.get("batchId") == batch_id:
            item["approvalStatus"] = "rejected"
            item["rejectionReason"] = comments
    save_json_list_store(SALARY_HISTORY_STORE_PATH, history)
    save_json_list_store(PAYROLL_BATCHES_STORE_PATH, batches)
    audit_action = "REJECT_PAYROLL_BATCH" if action == "reject" else "REQUEST_PAYROLL_CORRECTION"
    record_audit_log(auth_user, audit_action, {"batchId": batch_id, "name": batch.get("name"), "reason": comments})
    return jsonify({"ok": True, "batch": enrich_payroll_batch(batch)})


@app.route("/api/payroll-batches/<batch_id>/revise", methods=["POST", "OPTIONS"])
def revise_sent_payroll_batch(batch_id: str):
    preflight = handle_options()
    if preflight:
        return preflight
    _, auth_user, error = require_payroll_preparer()
    if error:
        return error
    data, error = require_json()
    if error:
        return error
    reason = str(data.get("reason", "")).strip()
    if not reason:
        return jsonify({"error": "Revision reason is required"}), 400
    batches = load_json_list_store(PAYROLL_BATCHES_STORE_PATH)
    original = next((item for item in batches if item.get("id") == batch_id), None)
    if not original:
        return jsonify({"error": "Payroll batch not found"}), 404
    if original.get("status") not in {"sent", "partially_sent"}:
        return jsonify({"error": "Only sent payroll batches can be revised"}), 409
    root_id = original.get("revisionOf") or original.get("id")
    existing_versions = [int(item.get("version", 1) or 1) for item in batches if (item.get("revisionOf") or item.get("id")) == root_id]
    version = max(existing_versions or [1]) + 1
    now = now_ms()
    entries = [{**item, "changeReason": ""} for item in original.get("entries", [])]
    revision = {
        **{key: value for key, value in original.items() if key not in {"id", "status", "createdAt", "updatedAt", "submittedAt", "submittedBy", "approvedAt", "approvedBy", "sentAt", "sentBy", "cancelledAt", "cancelledBy", "cancellationReason"}},
        "id": f"payroll-revision-{now}-{secrets.randbelow(10000):04d}",
        "name": f"{original.get('name')} — Revision {version}", "status": "draft", "version": version,
        "revisionOf": root_id, "revisesBatchId": original.get("id"), "revisionReason": reason,
        "entries": entries, "baselineEntries": payroll_baseline(entries), "pendingChangeCount": 0,
        "requiresChangeApproval": False, "salaryChangeCount": 0,
        "createdBy": auth_user.get("fullname"), "createdById": auth_user.get("id"),
        "createdAt": now, "updatedAt": now, "submittedAt": None,
        "approvalHistory": [approval_event("created", auth_user, f"Revision created: {reason}")],
    }
    batches.append(revision)
    save_json_list_store(PAYROLL_BATCHES_STORE_PATH, batches)
    record_audit_log(auth_user, "CREATE_PAYSLIP_REVISION", {"originalBatchId": original.get("id"), "revisionBatchId": revision["id"], "version": version, "reason": reason})
    return jsonify({"ok": True, "batch": revision}), 201


@app.route("/api/salary-history", methods=["GET"])
def get_salary_change_history():
    _, user, error = require_authenticated_user()
    if error:
        return error
    if user.get("role") not in {"SuperAdmin", "Admin", "FinanceOfficer", "FinanceApprover", "Auditor"}:
        return jsonify({"error": "Salary history access required"}), 403
    staff_record_id = str(request.args.get("staffRecordId", "")).strip()
    history = load_json_list_store(SALARY_HISTORY_STORE_PATH)
    if staff_record_id:
        history = [item for item in history if str(item.get("staffRecordId")) == staff_record_id]
    history.sort(key=lambda item: int(item.get("changedAt", 0)), reverse=True)
    return jsonify({"history": history})


def payslip_password_for(entry: dict, rule: str, custom_password: str) -> str | None:
    normalized_rule = str(rule or "none").strip().lower()
    if normalized_rule == "none":
        return None
    if normalized_rule == "staff_id":
        password = str(entry.get("staffId", "")).strip()
        if not password:
            raise ValueError("Staff ID is missing for this payslip")
        return password
    if normalized_rule == "phone":
        staff = next((item for item in load_json_list_store(STAFF_RECORDS_STORE_PATH) if item.get("id") == entry.get("staffRecordId")), None)
        password = "".join(char for char in str((staff or {}).get("phone", "")) if char.isdigit())
        if len(password) < 7:
            raise ValueError(f"A valid phone number is missing for {entry.get('fullName')}")
        return password
    if normalized_rule == "custom":
        password = str(custom_password or "").strip()
        if len(password) < 6:
            raise ValueError("Custom PDF password must contain at least 6 characters")
        return password
    raise ValueError("PDF password rule must be none, staff_id, phone, or custom")


def payslip_password_request() -> tuple[str, str]:
    default_rule = load_portal_settings_store().get("pdfPasswordRule", "staff_id")
    return (
        str(request.headers.get("X-PDF-Password-Rule") or request.args.get("passwordRule", default_rule)),
        str(request.headers.get("X-PDF-Custom-Password") or request.args.get("customPassword", "")),
    )


def branding_asset_path(value: object, fallback: str = "") -> str:
    reference = str(value or "").strip()
    if reference.startswith("/uploads/"):
        candidate = os.path.join(UPLOADS_DIR, secure_filename(reference.rsplit("/", 1)[-1]))
        return candidate if os.path.isfile(candidate) else fallback
    if reference.startswith("/assets/"):
        candidate = os.path.join(os.path.dirname(BASE_DIR), "public", reference.lstrip("/"))
        return candidate if os.path.isfile(candidate) else fallback
    return fallback


def payslip_pdf_settings() -> tuple[dict, str]:
    settings = load_portal_settings_store()
    fallback_logo = os.path.join(os.path.dirname(BASE_DIR), "public", "assets", "images", "bcb-logo.png")
    logo_path = branding_asset_path(settings.get("bankLogo"), fallback_logo)
    settings["_signaturePath"] = branding_asset_path(settings.get("authorizedSignature"))
    return settings, logo_path


def payslip_pdf_settings_for_batch(batch: dict) -> tuple[dict, str]:
    settings, logo_path = payslip_pdf_settings()
    rates = normalize_contribution_rates(batch.get("contributionRates"))
    settings["deductionLabels"] = {
        **dict(settings.get("deductionLabels") or {}),
        "ssf": f"{rates['employeeSsf']:g}% SSF",
        "esp": f"{rates['employeeEsp']:g}% ESP",
        "pf": f"{rates['employeePf']:g}% PF",
    }
    settings["employerContributionLabels"] = {
        **dict(settings.get("employerContributionLabels") or {}),
        "employerSsf": f"Employer SSF ({rates['employerSsf']:g}%)",
        "employerPf": f"Employer PF ({rates['employerPf']:g}%)",
    }
    return settings, logo_path


def payslip_ready_batch(batch_id: str) -> tuple[dict | None, object | None]:
    batch = next((item for item in load_json_list_store(PAYROLL_BATCHES_STORE_PATH) if item.get("id") == batch_id), None)
    if not batch:
        return None, (jsonify({"error": "Payroll batch not found"}), 404)
    if batch.get("status") not in {"approved", "generated", "partially_sent", "sent"}:
        return None, (jsonify({"error": "Payroll must be approved before generating payslips"}), 409)
    return batch, None


def require_payslip_download_permission(user: dict):
    settings = load_portal_settings_store()
    if settings.get("restrictPayslipDownloads", True) and user.get("role") not in {"SuperAdmin", "FinanceOfficer", "FinanceApprover"}:
        return jsonify({"error": "Your role is not authorized to download confidential payslips"}), 403
    return None


def mark_payroll_generated(batch_id: str, auth_user: dict) -> None:
    batches = load_json_list_store(PAYROLL_BATCHES_STORE_PATH)
    batch = next((item for item in batches if item.get("id") == batch_id), None)
    if not batch or batch.get("status") != "approved":
        return
    batch["status"] = "generated"
    batch["generatedAt"] = now_ms()
    batch["generatedBy"] = auth_user.get("fullname")
    batch["updatedAt"] = now_ms()
    batch.setdefault("approvalHistory", []).append(approval_event("generated", auth_user, "Payslip PDFs generated"))
    save_json_list_store(PAYROLL_BATCHES_STORE_PATH, batches)


@app.route("/api/payroll-batches/<batch_id>/payslip/<staff_record_id>.pdf", methods=["GET"])
def download_staff_payslip(batch_id: str, staff_record_id: str):
    _, auth_user, error = require_payroll_viewer()
    if error:
        return error
    download_error = require_payslip_download_permission(auth_user)
    if download_error:
        return download_error
    batch, error = payslip_ready_batch(batch_id)
    if error:
        return error
    entry = next((item for item in batch.get("entries", []) if str(item.get("staffRecordId")) == staff_record_id), None)
    if not entry:
        return jsonify({"error": "Staff payslip was not found in this payroll batch"}), 404
    issues = payroll_entry_issues(entry, batch.get("payrollValidationRules"), batch.get("emailDomain") or OFFICIAL_EMAIL_DOMAIN)
    if issues:
        return jsonify({"error": f"Payslip cannot be generated: {', '.join(issues)}"}), 400
    try:
        password_rule, custom_password = payslip_password_request()
        password = payslip_password_for(entry, password_rule, custom_password)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    settings, logo_path = payslip_pdf_settings_for_batch(batch)
    pdf_bytes = protect_pdf(generate_payslip_pdf(batch, entry, str(settings.get("bankName") or "Bawjiase Community Bank PLC"), logo_path, settings), password)
    filename = secure_filename(f"{entry.get('staffId')}-{batch.get('period')}-payslip-v{batch.get('version', 1)}.pdf")
    mark_payroll_generated(batch_id, auth_user)
    record_audit_log(auth_user, "GENERATE_PAYSLIP_PDF", {"batchId": batch_id, "staffId": entry.get("staffId"), "version": batch.get("version", 1), "passwordProtected": bool(password)})
    return send_file(BytesIO(pdf_bytes), mimetype="application/pdf", as_attachment=request.args.get("download") == "1", download_name=filename, max_age=0)


@app.route("/api/payroll-batches/<batch_id>/payslips.zip", methods=["GET"])
def download_batch_payslips_zip(batch_id: str):
    _, auth_user, error = require_payroll_viewer()
    if error:
        return error
    download_error = require_payslip_download_permission(auth_user)
    if download_error:
        return download_error
    batch, error = payslip_ready_batch(batch_id)
    if error:
        return error
    settings, logo_path = payslip_pdf_settings_for_batch(batch)
    archive_buffer = BytesIO()
    try:
        password_rule, custom_password = payslip_password_request()
        with zipfile.ZipFile(archive_buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for entry in batch.get("entries", []):
                issues = payroll_entry_issues(entry, batch.get("payrollValidationRules"), batch.get("emailDomain") or OFFICIAL_EMAIL_DOMAIN)
                if issues:
                    raise ValueError(f"{entry.get('fullName')}: {', '.join(issues)}")
                password = payslip_password_for(entry, password_rule, custom_password)
                pdf_bytes = protect_pdf(generate_payslip_pdf(batch, entry, str(settings.get("bankName") or "Bawjiase Community Bank PLC"), logo_path, settings), password)
                filename = secure_filename(f"{entry.get('staffId')}-{entry.get('fullName')}-payslip-v{batch.get('version', 1)}.pdf")
                archive.writestr(filename, pdf_bytes)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    archive_buffer.seek(0)
    filename = secure_filename(f"{batch.get('name')}-version-{batch.get('version', 1)}-payslips.zip")
    mark_payroll_generated(batch_id, auth_user)
    record_audit_log(auth_user, "DOWNLOAD_PAYSLIPS_ZIP", {"batchId": batch_id, "staffCount": len(batch.get("entries", [])), "version": batch.get("version", 1), "passwordRule": password_rule})
    return send_file(archive_buffer, mimetype="application/zip", as_attachment=True, download_name=filename, max_age=0)


DEFAULT_PAYSLIP_EMAIL_TEMPLATE = {
    "subject": "Your Payslip for {month} {year}",
    "body": "Dear {staff_name},\n\nPlease find attached your confidential payslip for {month} {year}.\n\nThe PDF password is your Staff ID.\n\nRegards,\nFinance Department\nBawjiase Community Bank PLC",
}


def payslip_email_template(batch: dict) -> dict:
    stored = batch.get("emailTemplate") if isinstance(batch.get("emailTemplate"), dict) else {}
    settings = load_portal_settings_store()
    return {
        "subject": str(stored.get("subject") or settings.get("defaultEmailSubject") or DEFAULT_PAYSLIP_EMAIL_TEMPLATE["subject"]),
        "body": str(stored.get("body") or settings.get("defaultEmailBody") or DEFAULT_PAYSLIP_EMAIL_TEMPLATE["body"]),
    }


def payroll_period_parts(period: str) -> tuple[str, str]:
    try:
        parsed = datetime.strptime(str(period), "%Y-%m")
        return parsed.strftime("%B"), parsed.strftime("%Y")
    except ValueError:
        return str(period), ""


def render_payslip_email(template: dict, entry: dict, batch: dict) -> tuple[str, str, str]:
    month, year = payroll_period_parts(batch.get("period", ""))
    values = {"staff_name": str(entry.get("fullName", "Staff Member")), "month": month, "year": year}
    subject = str(template.get("subject", "")).format_map(values).strip()
    text_body = str(template.get("body", "")).format_map(values).strip()
    footer = str(load_portal_settings_store().get("emailFooter") or "").strip()
    if footer and footer not in text_body:
        text_body = f"{text_body}\n\n{footer}"
    html_body = "<div style='font-family:Arial,sans-serif;line-height:1.6;color:#263238'>" + html.escape(text_body).replace("\n", "<br>") + "</div>"
    return subject, text_body, html_body


def validate_payslip_recipients(batch: dict) -> list[dict]:
    staff_by_id = {item.get("id"): item for item in load_json_list_store(STAFF_RECORDS_STORE_PATH)}
    seen, problems = {}, []
    email_pattern = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
    official_domain = normalize_email_domain(batch.get("emailDomain") or OFFICIAL_EMAIL_DOMAIN)
    for entry in batch.get("entries", []):
        staff = staff_by_id.get(entry.get("staffRecordId"))
        email = str(entry.get("email") or "").strip().lower()
        issue = ""
        if not staff:
            issue = "Staff directory record is missing"
        elif str(staff.get("employmentStatus", "inactive")).lower() != "active":
            issue = "Staff member is inactive"
        elif not email:
            issue = "Email address is missing"
        elif not email_pattern.fullmatch(email) or not email.endswith(official_domain):
            issue = "Email address is invalid"
        elif str(staff.get("email") or "").strip().lower() != email:
            issue = "Staff email changed after payroll approval; correct and reapprove the batch"
        elif email in seen:
            issue = f"Duplicate email address also used by {seen[email]}"
        if issue:
            problems.append({"staffRecordId": entry.get("staffRecordId"), "staffId": entry.get("staffId"), "fullName": entry.get("fullName"), "email": email, "issue": issue})
        else:
            seen[email] = entry.get("fullName")
    return problems


def delivery_status_event(status: str, message: str = "") -> dict:
    return {"status": status, "timestamp": now_ms(), "message": message}


def save_delivery_status(delivery_id: str, status: str, error_message: str = "", **updates) -> dict | None:
    with PAYSLIP_DELIVERY_LOCK:
        records = load_json_list_store(EMAIL_DELIVERY_STORE_PATH)
        record = next((item for item in records if item.get("id") == delivery_id), None)
        if not record:
            return None
        record["status"] = status
        record["errorMessage"] = error_message
        record["updatedAt"] = now_ms()
        record.update(updates)
        record.setdefault("statusHistory", []).append(delivery_status_event(status, error_message))
        save_json_list_store(EMAIL_DELIVERY_STORE_PATH, records)
        return dict(record)


def claim_payslip_delivery(delivery_id: str) -> dict | None:
    """Atomically lease a durable delivery record and reject duplicate jobs."""
    def claim(records):
        record = next((item for item in records if item.get("id") == delivery_id), None)
        if not record or record.get("status") not in {"Pending", "Retried"}:
            return records, None
        record["status"] = "Sending"
        record["leaseId"] = secrets.token_urlsafe(12)
        record["leasedAt"] = now_ms()
        record["updatedAt"] = record["leasedAt"]
        record.setdefault("statusHistory", []).append(delivery_status_event("Sending", "Durable worker claimed delivery"))
        return records, dict(record)
    return mutate_json_list_store(EMAIL_DELIVERY_STORE_PATH, claim)


def update_batch_delivery_status(batch_id: str) -> None:
    with PAYSLIP_DELIVERY_LOCK:
        deliveries = [item for item in load_json_list_store(EMAIL_DELIVERY_STORE_PATH) if item.get("batchId") == batch_id and not item.get("isTest")]
        if not deliveries:
            return
        successful = [item for item in deliveries if item.get("status") in {"Sent", "Delivered"}]
        active = [item for item in deliveries if item.get("status") in {"Pending", "Sending", "Retried"}]
        batches = load_json_list_store(PAYROLL_BATCHES_STORE_PATH)
        batch = next((item for item in batches if item.get("id") == batch_id), None)
        if not batch:
            return
        previous = batch.get("status")
        if len(successful) == len(deliveries) and not active:
            batch["status"] = "sent"
            batch["sentAt"] = max(int(item.get("sentAt") or 0) for item in successful)
            batch["sentBy"] = deliveries[0].get("sentBy")
            if previous != "sent":
                actor = {"id": deliveries[0].get("sentById"), "fullname": deliveries[0].get("sentBy"), "role": deliveries[0].get("sentByRole")}
                batch.setdefault("approvalHistory", []).append(approval_event("sent", actor, f"{len(successful)} payslips sent privately"))
        elif successful:
            batch["status"] = "partially_sent"
        batch["updatedAt"] = now_ms()
        save_json_list_store(PAYROLL_BATCHES_STORE_PATH, batches)


def process_payslip_delivery(delivery_id: str) -> None:
    record = claim_payslip_delivery(delivery_id)
    if not record:
        return
    try:
        batches = load_json_list_store(PAYROLL_BATCHES_STORE_PATH)
        batch = next((item for item in batches if item.get("id") == record.get("batchId")), None)
        if not batch or batch.get("status") not in {"approved", "generated", "partially_sent"}:
            raise RuntimeError("Payroll is no longer approved for sending")
        entry = next((item for item in batch.get("entries", []) if item.get("staffRecordId") == record.get("staffRecordId")), None)
        if not entry:
            raise RuntimeError("Payroll entry is missing")
        problems = validate_payslip_recipients({**batch, "entries": [entry]})
        if problems:
            raise RuntimeError(problems[0]["issue"])
        template = record.get("template") or payslip_email_template(batch)
        subject, text_body, html_body = render_payslip_email(template, entry, batch)
        settings, logo_path = payslip_pdf_settings_for_batch(batch)
        pdf_password = payslip_password_for(entry, settings.get("pdfPasswordRule", "staff_id"), "")
        pdf_bytes = protect_pdf(generate_payslip_pdf(batch, entry, str(settings.get("bankName") or "Bawjiase Community Bank PLC"), logo_path, settings), pdf_password)
        filename = secure_filename(f"{entry.get('staffId')}-{batch.get('period')}-payslip-v{batch.get('version', 1)}.pdf")
        message_id = send_mail(record["recipientEmail"], subject, text_body, html_body, (filename, pdf_bytes, "application/pdf"), delivery_id)
        save_delivery_status(delivery_id, "Sent", "", sentAt=now_ms(), subject=subject, providerMessageId=message_id)
    except smtplib.SMTPRecipientsRefused as exc:
        save_delivery_status(delivery_id, "Bounced", str(exc))
        app.logger.warning(json.dumps({"event": "payslip_delivery_bounced", "deliveryId": delivery_id, "batchId": record.get("batchId")}, separators=(",", ":")))
    except Exception as exc:
        save_delivery_status(delivery_id, "Failed", str(exc))
        app.logger.error(json.dumps({"event": "payslip_delivery_failed", "deliveryId": delivery_id, "batchId": record.get("batchId"), "errorType": type(exc).__name__}, separators=(",", ":")))
    finally:
        update_batch_delivery_status(record.get("batchId"))


def payslip_worker_status() -> dict:
    status = read_json_file(WORKER_STATUS_STORE_PATH, {})
    last_heartbeat = int(status.get("lastHeartbeat", 0) or 0) if isinstance(status, dict) else 0
    return {
        "mode": str(os.getenv("PAYSLIP_WORKER_MODE", "embedded")).strip().lower(),
        "lastHeartbeat": last_heartbeat,
        "healthy": bool(last_heartbeat and now_ms() - last_heartbeat < 90_000),
    }


def record_payslip_worker_heartbeat() -> None:
    atomic_write_json(WORKER_STATUS_STORE_PATH, {"lastHeartbeat": now_ms(), "pid": os.getpid()})


def payslip_delivery_worker() -> None:
    while True:
        record_payslip_worker_heartbeat()
        try:
            delivery_id = PAYSLIP_DELIVERY_QUEUE.get(timeout=2)
        except Empty:
            for pending in load_json_list_store(EMAIL_DELIVERY_STORE_PATH):
                if pending.get("status") in {"Pending", "Retried"}:
                    PAYSLIP_DELIVERY_QUEUE.put(pending["id"])
            continue
        try:
            with app.app_context():
                process_payslip_delivery(delivery_id)
        finally:
            PAYSLIP_DELIVERY_QUEUE.task_done()


def start_payslip_worker(*, force: bool = False) -> None:
    global PAYSLIP_WORKER_STARTED
    if not force and str(os.getenv("PAYSLIP_WORKER_MODE", "embedded")).strip().lower() == "external":
        return
    if str(os.getenv("DISABLE_BACKGROUND_WORKER", "false")).lower() in {"1", "true", "yes"} and not force:
        return
    if PAYSLIP_WORKER_STARTED:
        return
    PAYSLIP_WORKER_STARTED = True
    threading.Thread(target=payslip_delivery_worker, name="payslip-email-worker", daemon=True).start()
    for record in load_json_list_store(EMAIL_DELIVERY_STORE_PATH):
        if record.get("status") in {"Pending", "Sending", "Retried"}:
            if record.get("status") == "Sending":
                save_delivery_status(record["id"], "Retried", "Recovered after service restart")
            PAYSLIP_DELIVERY_QUEUE.put(record["id"])


def require_sendable_payroll(batch_id: str) -> tuple[dict | None, object | None]:
    batch = next((item for item in load_json_list_store(PAYROLL_BATCHES_STORE_PATH) if item.get("id") == batch_id), None)
    if not batch:
        return None, (jsonify({"error": "Payroll batch not found"}), 404)
    if batch.get("status") not in {"approved", "generated", "partially_sent"}:
        return None, (jsonify({"error": "Only approved payroll batches can send payslips"}), 409)
    return batch, None


@app.route("/api/payroll-batches/<batch_id>/email-delivery", methods=["GET"])
def get_payslip_email_delivery(batch_id: str):
    _, _, error = require_payroll_viewer()
    if error:
        return error
    start_payslip_worker()
    batch = next((item for item in load_json_list_store(PAYROLL_BATCHES_STORE_PATH) if item.get("id") == batch_id), None)
    if not batch:
        return jsonify({"error": "Payroll batch not found"}), 404
    records = [item for item in load_json_list_store(EMAIL_DELIVERY_STORE_PATH) if item.get("batchId") == batch_id]
    records.sort(key=lambda item: int(item.get("createdAt", 0)), reverse=True)
    configured = True
    try:
        cfg = mail_config()
        provider = f"SMTP · {cfg['MAIL_SERVER']}:{cfg['MAIL_PORT']} · {cfg['MAIL_SECURITY']}"
    except RuntimeError:
        configured, provider = False, "SMTP is not configured"
    settings = load_portal_settings_store()
    return jsonify({"deliveries": records, "template": payslip_email_template(batch), "recipientIssues": validate_payslip_recipients(batch), "mailConfigured": configured, "provider": provider, "requireTestEmail": settings.get("requireTestEmail", True), "testEmailSentAt": batch.get("testEmailSentAt")})


@app.route("/api/payroll-batches/<batch_id>/email-template", methods=["POST", "OPTIONS"])
def save_payslip_email_template(batch_id: str):
    preflight = handle_options()
    if preflight:
        return preflight
    _, auth_user, error = require_payroll_approver()
    if error:
        return error
    data, error = require_json()
    if error:
        return error
    subject, body = str(data.get("subject", "")).strip(), str(data.get("body", "")).strip()
    if not subject or len(subject) > 200:
        return jsonify({"error": "Email subject is required and must be 200 characters or fewer"}), 400
    if not body or len(body) > 10000:
        return jsonify({"error": "Email message is required and must be 10,000 characters or fewer"}), 400
    try:
        render_payslip_email({"subject": subject, "body": body}, {"fullName": "Test Staff"}, {"period": "2026-06"})
    except (KeyError, ValueError) as exc:
        return jsonify({"error": f"Unknown email template placeholder: {exc}"}), 400
    batches = load_json_list_store(PAYROLL_BATCHES_STORE_PATH)
    batch = next((item for item in batches if item.get("id") == batch_id), None)
    if not batch:
        return jsonify({"error": "Payroll batch not found"}), 404
    batch["emailTemplate"] = {"subject": subject, "body": body, "updatedAt": now_ms(), "updatedBy": auth_user.get("fullname")}
    batch["updatedAt"] = now_ms()
    save_json_list_store(PAYROLL_BATCHES_STORE_PATH, batches)
    record_audit_log(auth_user, "UPDATE_PAYSLIP_EMAIL_TEMPLATE", {"batchId": batch_id, "name": batch.get("name")})
    return jsonify({"ok": True, "template": batch["emailTemplate"]})


@app.route("/api/payroll-batches/<batch_id>/email-test", methods=["POST", "OPTIONS"])
def send_payslip_test_email(batch_id: str):
    preflight = handle_options()
    if preflight:
        return preflight
    _, auth_user, error = require_payroll_approver()
    if error:
        return error
    data, error = require_json()
    if error:
        return error
    batch, error = require_sendable_payroll(batch_id)
    if error:
        return error
    target = str(data.get("email") or auth_user.get("email") or "").strip().lower()
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", target):
        return jsonify({"error": "Enter a valid test email address"}), 400
    entry = next(iter(batch.get("entries", [])), None)
    if not entry:
        return jsonify({"error": "Payroll has no staff entries"}), 400
    template = {"subject": str(data.get("subject") or payslip_email_template(batch)["subject"]), "body": str(data.get("body") or payslip_email_template(batch)["body"])}
    try:
        subject, text_body, html_body = render_payslip_email(template, entry, batch)
        settings, logo_path = payslip_pdf_settings_for_batch(batch)
        pdf_password = payslip_password_for(entry, settings.get("pdfPasswordRule", "staff_id"), "")
        pdf_bytes = protect_pdf(generate_payslip_pdf(batch, entry, str(settings.get("bankName") or "Bawjiase Community Bank PLC"), logo_path, settings), pdf_password)
        send_mail(target, f"[TEST] {subject}", text_body, html_body, ("test-payslip.pdf", pdf_bytes, "application/pdf"))
    except Exception as exc:
        return jsonify({"error": f"Test email failed: {exc}"}), 503
    batches = load_json_list_store(PAYROLL_BATCHES_STORE_PATH)
    stored_batch = next((item for item in batches if item.get("id") == batch_id), None)
    if stored_batch:
        stored_batch["testEmailSentAt"] = now_ms()
        stored_batch["testEmailSentBy"] = auth_user.get("fullname")
        save_json_list_store(PAYROLL_BATCHES_STORE_PATH, batches)
    record_audit_log(auth_user, "SEND_PAYSLIP_TEST_EMAIL", {"batchId": batch_id, "recipientEmail": target})
    return jsonify({"ok": True, "message": f"Test email sent privately to {target}"})


@app.route("/api/payroll-batches/<batch_id>/send-payslips", methods=["POST", "OPTIONS"])
def queue_all_payslip_emails(batch_id: str):
    preflight = handle_options()
    if preflight:
        return preflight
    _, auth_user, error = require_payroll_approver()
    if error:
        return error
    batch, error = require_sendable_payroll(batch_id)
    if error:
        return error
    if load_portal_settings_store().get("requireTestEmail", True) and not batch.get("testEmailSentAt"):
        return jsonify({"error": "Send a successful test email before bulk delivery"}), 409
    try:
        mail_config()
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 503
    problems = validate_payslip_recipients(batch)
    if problems:
        return jsonify({"error": "Resolve all recipient issues before sending", "recipientIssues": problems}), 400
    template = payslip_email_template(batch)
    now = now_ms()
    start_payslip_worker()
    def create_once(records):
        if any(item.get("batchId") == batch_id and not item.get("isTest") for item in records):
            return records, None
        created_records = []
        for entry in batch.get("entries", []):
            fingerprint = hashlib.sha256(f"{batch_id}:{entry.get('staffRecordId')}".encode("utf-8")).hexdigest()[:24]
            record = {
                "id": f"delivery-{fingerprint}", "batchId": batch_id, "batchName": batch.get("name"), "period": batch.get("period"),
                "staffRecordId": entry.get("staffRecordId"), "staffId": entry.get("staffId"), "staffName": entry.get("fullName"),
                "recipientEmail": entry.get("email"), "status": "Pending", "errorMessage": "", "attempts": 1,
                "sentBy": auth_user.get("fullname"), "sentById": auth_user.get("id"), "sentByRole": auth_user.get("role"),
                "template": template, "createdAt": now, "updatedAt": now, "sentAt": None,
                "statusHistory": [delivery_status_event("Pending", "Queued for private delivery")],
            }
            records.append(record); created_records.append(record)
        return records, created_records
    created = mutate_json_list_store(EMAIL_DELIVERY_STORE_PATH, create_once)
    if created is None:
        return jsonify({"error": "This payroll already has delivery records. Use Resend Failed Emails for failures."}), 409
    for record in created:
        PAYSLIP_DELIVERY_QUEUE.put(record["id"])
    record_audit_log(auth_user, "QUEUE_BULK_PAYSLIP_EMAILS", {"batchId": batch_id, "staffCount": len(created), "name": batch.get("name")})
    return jsonify({"ok": True, "queued": len(created), "deliveries": created}), 202


@app.route("/api/payroll-batches/<batch_id>/resend-failed", methods=["POST", "OPTIONS"])
def resend_failed_payslip_emails(batch_id: str):
    preflight = handle_options()
    if preflight:
        return preflight
    _, auth_user, error = require_payroll_approver()
    if error:
        return error
    batch, error = require_sendable_payroll(batch_id)
    if error:
        return error
    problems = validate_payslip_recipients(batch)
    if problems:
        return jsonify({"error": "Resolve all recipient issues before retrying", "recipientIssues": problems}), 400
    records = load_json_list_store(EMAIL_DELIVERY_STORE_PATH)
    failed = [item for item in records if item.get("batchId") == batch_id and item.get("status") in {"Failed", "Bounced"}]
    if not failed:
        return jsonify({"error": "There are no failed payslip emails to resend"}), 409
    start_payslip_worker()
    for item in failed:
        item["status"] = "Retried"; item["errorMessage"] = ""; item["updatedAt"] = now_ms(); item["attempts"] = int(item.get("attempts", 1)) + 1
        item["sentBy"] = auth_user.get("fullname"); item["sentById"] = auth_user.get("id"); item["sentByRole"] = auth_user.get("role")
        item.setdefault("statusHistory", []).append(delivery_status_event("Retried", "Manually queued for retry"))
    save_json_list_store(EMAIL_DELIVERY_STORE_PATH, records)
    for item in failed:
        PAYSLIP_DELIVERY_QUEUE.put(item["id"])
    record_audit_log(auth_user, "RETRY_FAILED_PAYSLIP_EMAILS", {"batchId": batch_id, "count": len(failed)})
    return jsonify({"ok": True, "queued": len(failed)}), 202


@app.route("/api/email-delivery/webhook", methods=["POST", "OPTIONS"])
def payslip_delivery_webhook():
    preflight = handle_options()
    if preflight:
        return preflight
    secret = env_secret("DELIVERY_WEBHOOK_SECRET")
    if not secret or not secrets.compare_digest(str(request.headers.get("X-Delivery-Webhook-Secret", "")), secret):
        return jsonify({"error": "Invalid webhook signature"}), 401
    data, error = require_json()
    if error:
        return error
    events = data.get("events") if isinstance(data.get("events"), list) else [data]
    records = load_json_list_store(EMAIL_DELIVERY_STORE_PATH)
    updated = []
    for event in events[:1000]:
        if not isinstance(event, dict):
            continue
        raw_status = str(event.get("status") or event.get("event") or event.get("notificationType") or "").strip().lower()
        status = "Delivered" if raw_status in {"delivered", "delivery"} else "Bounced" if raw_status in {"bounced", "bounce", "dropped", "blocked"} else ""
        if not status:
            continue
        custom_args = event.get("customArgs") if isinstance(event.get("customArgs"), dict) else {}
        delivery_id = str(event.get("deliveryId") or custom_args.get("deliveryId") or "").strip()
        message_id = str(event.get("messageId") or event.get("smtp-id") or event.get("sg_message_id") or "").strip()
        if not delivery_id and message_id:
            match = next((item for item in records if str(item.get("providerMessageId") or "").strip() == message_id), None)
            delivery_id = str((match or {}).get("id") or "")
        record = save_delivery_status(delivery_id, status, str(event.get("errorMessage") or event.get("reason") or ""), deliveredAt=now_ms() if status == "Delivered" else None)
        if record:
            updated.append(record["id"])
            update_batch_delivery_status(record.get("batchId"))
    if not updated:
        return jsonify({"error": "No matching Delivered or Bounced delivery event was found"}), 404
    return jsonify({"ok": True, "updated": len(updated)})


def normalize_staff_record(data: dict, existing: dict | None = None) -> dict:
    current = dict(existing or {})
    email = validate_email(str(data.get("email", current.get("email", ""))))
    status = str(data.get("employmentStatus", current.get("employmentStatus", "active"))).strip().lower()
    if status not in {"active", "inactive"}:
        raise ValueError("Employment status must be active or inactive")
    now = now_ms()
    return {
        "id": str(current.get("id") or f"staff-{now}-{secrets.randbelow(10000):04d}"),
        "staffId": normalize_required_text(data.get("staffId", current.get("staffId")), "Staff ID"),
        "fullName": normalize_required_text(data.get("fullName", current.get("fullName")), "Staff name"),
        "department": str(data.get("department", current.get("department", ""))).strip(),
        "position": str(data.get("position", current.get("position", ""))).strip(),
        "branch": str(data.get("branch", current.get("branch", ""))).strip(),
        "phone": normalize_phone(data.get("phone", current.get("phone", ""))),
        "email": email,
        "employmentStatus": status,
        "createdAt": int(current.get("createdAt", now) or now),
        "updatedAt": now,
    }


def staff_record_conflict(records: list[dict], candidate: dict, exclude_id: str = "") -> str | None:
    staff_id = str(candidate.get("staffId", "")).strip().lower()
    email = str(candidate.get("email", "")).strip().lower()
    for record in records:
        if str(record.get("id", "")) == exclude_id:
            continue
        if str(record.get("staffId", "")).strip().lower() == staff_id:
            return "Staff ID already exists"
        if str(record.get("email", "")).strip().lower() == email:
            return "Email address already exists"
    return None


@app.route("/api/staff-records", methods=["GET"])
def list_staff_records():
    _, auth_user, error = require_authenticated_user()
    if error:
        return error
    if auth_user.get("role") not in {"SuperAdmin", "Admin", "FinanceOfficer", "FinanceApprover"}:
        return jsonify({"error": "Staff Directory access required"}), 403
    records = load_json_list_store(STAFF_RECORDS_STORE_PATH)
    status = str(request.args.get("status", "all")).strip().lower()
    if status in {"active", "inactive"}:
        records = [item for item in records if str(item.get("employmentStatus", "active")).lower() == status]
    records.sort(key=lambda item: str(item.get("fullName", "")).lower())
    return jsonify({"records": records})


@app.route("/api/staff-records", methods=["POST", "OPTIONS"])
def create_staff_record():
    preflight = handle_options()
    if preflight:
        return preflight
    _, auth_user, error = require_staff_records_manager()
    if error:
        return error
    data, error = require_json()
    if error:
        return error
    try:
        records = load_json_list_store(STAFF_RECORDS_STORE_PATH)
        record = normalize_staff_record(data)
        conflict = staff_record_conflict(records, record)
        if conflict:
            return jsonify({"error": conflict}), 400
        records.append(record)
        save_json_list_store(STAFF_RECORDS_STORE_PATH, records)
        record_audit_log(auth_user, "ADD_STAFF_RECORD", {**record, "reason": str(data.get("reason", "New staff onboarding")).strip()})
        return jsonify({"ok": True, "record": record}), 201
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400


@app.route("/api/staff-records/import", methods=["POST", "OPTIONS"])
def import_staff_records():
    preflight = handle_options()
    if preflight:
        return preflight
    _, auth_user, error = require_staff_records_manager()
    if error:
        return error
    data, error = require_json()
    if error:
        return error
    incoming = data.get("records")
    if not isinstance(incoming, list) or not incoming:
        return jsonify({"error": "At least one staff record is required"}), 400
    records = load_json_list_store(STAFF_RECORDS_STORE_PATH)
    prepared = []
    try:
        for item in incoming:
            record = normalize_staff_record(item if isinstance(item, dict) else {})
            conflict = staff_record_conflict(records + prepared, record)
            if conflict:
                raise ValueError(f"{record['staffId']}: {conflict}")
            prepared.append(record)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    records.extend(prepared)
    save_json_list_store(STAFF_RECORDS_STORE_PATH, records)
    record_audit_log(auth_user, "STAFF_EMAIL_BULK_UPLOAD", {
        "fileName": str(data.get("fileName", "Staff import")).strip(),
        "recordCount": len(prepared),
        "reason": str(data.get("reason", "Bulk staff email import")).strip(),
    })
    return jsonify({"ok": True, "records": prepared}), 201


@app.route("/api/staff-records/<record_id>", methods=["POST", "OPTIONS"])
def update_staff_record(record_id: str):
    preflight = handle_options()
    if preflight:
        return preflight
    _, auth_user, error = require_staff_records_manager()
    if error:
        return error
    data, error = require_json()
    if error:
        return error
    records = load_json_list_store(STAFF_RECORDS_STORE_PATH)
    current = next((item for item in records if str(item.get("id")) == record_id), None)
    if not current:
        return jsonify({"error": "Staff record not found"}), 404
    try:
        updated = normalize_staff_record(data, current)
        conflict = staff_record_conflict(records, updated, record_id)
        if conflict:
            return jsonify({"error": conflict}), 400
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    try:
        reason = normalize_required_text(data.get("reason"), "Reason for change")
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    previous_email = current.get("email")
    current.update(updated)
    save_json_list_store(STAFF_RECORDS_STORE_PATH, records)
    action = "EDIT_STAFF_EMAIL" if previous_email != updated["email"] else "UPDATE_STAFF_RECORD"
    record_audit_log(auth_user, action, {"staffId": updated["staffId"], "staffName": updated["fullName"], "beforeEmail": previous_email, "email": updated["email"], "reason": reason})
    return jsonify({"ok": True, "record": updated})


@app.route("/api/staff-records/<record_id>/status", methods=["POST", "OPTIONS"])
def change_staff_record_status(record_id: str):
    preflight = handle_options()
    if preflight:
        return preflight
    _, auth_user, error = require_staff_records_manager()
    if error:
        return error
    data, error = require_json()
    if error:
        return error
    status = str(data.get("employmentStatus", "")).strip().lower()
    if status not in {"active", "inactive"}:
        return jsonify({"error": "Employment status must be active or inactive"}), 400
    try:
        reason = normalize_required_text(data.get("reason"), "Reason for change")
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    records = load_json_list_store(STAFF_RECORDS_STORE_PATH)
    record = next((item for item in records if str(item.get("id")) == record_id), None)
    if not record:
        return jsonify({"error": "Staff record not found"}), 404
    record["employmentStatus"] = status
    record["updatedAt"] = now_ms()
    save_json_list_store(STAFF_RECORDS_STORE_PATH, records)
    if status == "inactive":
        users = load_user_store()
        linked_user = next((item for item in users if item.get("staffRecordId") == record_id), None)
        if linked_user:
            linked_user["accountStatus"] = "suspended"
            linked_user["isActive"] = False
            save_user_store(users)
            revoke_user_sessions(linked_user["id"])
            record_audit_log(auth_user, "AUTO_SUSPEND_LINKED_USER", staff_audit_target(linked_user, {"staffRecordId": record_id, "reason": reason}))
    action = "REACTIVATE_STAFF_RECORD" if status == "active" else "DEACTIVATE_STAFF_RECORD"
    record_audit_log(auth_user, action, {"staffId": record.get("staffId"), "staffName": record.get("fullName"), "email": record.get("email"), "reason": reason})
    return jsonify({"ok": True, "record": record})


@app.route("/api/staff-records/audit", methods=["GET"])
def get_staff_record_audit_logs():
    _, _, error = require_staff_records_manager()
    if error:
        return error
    actions = {"ADD_STAFF_RECORD", "STAFF_EMAIL_BULK_UPLOAD", "EDIT_STAFF_EMAIL", "UPDATE_STAFF_RECORD", "DEACTIVATE_STAFF_RECORD", "REACTIVATE_STAFF_RECORD"}
    logs = [item for item in load_audit_logs_store() if item.get("action") in actions]
    logs.sort(key=lambda item: int(item.get("timestamp", 0)), reverse=True)
    return jsonify({"logs": logs[:100]})


@app.route("/api/staff/archived", methods=["GET"])
def get_archived_staff():
    _, auth_user, error = require_staff_manager()
    if error:
        return error
    users = load_user_store()
    return jsonify({"users": [user for user in users if user.get("role") != "BossAdmin" and user["isArchived"] and can_view_staff_record(auth_user, user)]})


@app.route("/api/staff/stats", methods=["GET"])
def get_staff_stats():
    _, _, error = require_staff_manager()
    if error:
        return error
    users = [user for user in load_user_store() if user.get("role") != "BossAdmin"]
    active = [user for user in users if user["isActive"] and not user["isArchived"]]
    by_department = {}
    by_branch = {}
    by_role = {}
    for user in active:
        by_department[user["department"]] = by_department.get(user["department"], 0) + 1
        by_branch[user["branch"]] = by_branch.get(user["branch"], 0) + 1
        by_role[user["role"]] = by_role.get(user["role"], 0) + 1
    return jsonify({
        "total": len(users),
        "active": len(active),
        "archived": len([user for user in users if user["isArchived"]]),
        "byDepartment": by_department,
        "byBranch": by_branch,
        "byRole": by_role,
    })


@app.route("/api/staff/<user_id>", methods=["GET"])
def get_staff_member(user_id: str):
    _, auth_user, error = require_authenticated_user()
    if error:
        return error
    if auth_user.get("role") == "BossAdmin":
        return jsonify({"error": "Bank staff records are not available to the platform controller"}), 403
    users = load_user_store()
    user = find_user_by_id(users, user_id)
    if not user:
        return jsonify({"error": "Staff member not found"}), 404
    if user.get("role") == "BossAdmin":
        return jsonify({"error": "Staff member not found"}), 404
    return jsonify({"user": user})


@app.route("/api/staff/<user_id>/update", methods=["POST", "OPTIONS"])
def update_staff(user_id: str):
    preflight = handle_options()
    if preflight:
        return preflight
    _, auth_user, error = require_authenticated_user()
    if error:
        return error
    if auth_user["role"] not in {"SuperAdmin", "Admin"} and not user_has_permission(auth_user, "userManagement"):
        return jsonify({"error": "Admin access required"}), 403
    data, error = require_json()
    if error:
        return error
    users = load_user_store()
    user = find_user_by_id(users, user_id)
    if not user:
        return jsonify({"error": "Staff member not found"}), 404
    if user.get("role") == "BossAdmin":
        return jsonify({"error": "The platform controller account is isolated from bank user administration"}), 403
    if not can_view_staff_record(auth_user, user):
        return scoped_access_denial(auth_user)
    previous_active = bool(user.get("isActive", False))
    previous_supervisor_access = {
        "role": str(user.get("role", "")),
        "managedBranches": normalize_scope_list(user.get("managedBranches"), empty_default=[]),
        "managedDepartmentsByBranch": normalize_managed_departments_by_branch(
            user.get("managedDepartmentsByBranch")
        ),
        "permissions": normalize_user_permissions(user.get("permissions"), str(user.get("role", ""))),
    }

    try:
        requested_department = normalize_portal_department_name(data.get("department", user["department"]))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    if requested_department == "IT" and user["department"] != "IT":
        it_access_code = str(load_portal_settings_store().get("itAccessCode") or IT_ACCESS_CODE)
        if not it_access_code:
            return jsonify({"error": "IT security code is not configured on the server."}), 500
        if str(data.get("accessCode", "")).strip() != it_access_code:
            return jsonify({"error": "Access denied: invalid IT security code."}), 400

    before_staff = dict(user)
    if "fullname" in data:
        try:
            user["fullname"] = normalize_required_text(data.get("fullname"), "Full name")
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
    if "phone" in data:
        try:
            user["phone"] = normalize_phone(data.get("phone")) or user["phone"]
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
    if "position" in data:
        user["position"] = str(data.get("position", "")).strip() or user["position"]
    if "department" in data and requested_department:
        user["department"] = requested_department
        if user.get("role") != "Supervisor":
            user["role"] = role_from_department(requested_department)
    if "branch" in data:
        try:
            user["branch"] = normalize_portal_branch_name(data.get("branch"))
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
    if "role" in data:
        requested_role = str(data.get("role", "")).strip()
        if requested_role == "BossAdmin":
            return jsonify({"error": "Boss Admin accounts can only be provisioned from the secure server environment"}), 403
        if requested_role in ALLOWED_ROLES:
            if requested_role == "SuperAdmin" and auth_user["role"] != "SuperAdmin":
                return jsonify({"error": "Only a Super Admin can assign the Super Admin role"}), 403
            user["role"] = requested_role
    if "managedBranches" in data:
        user["managedBranches"] = normalize_scope_list(
            data.get("managedBranches"),
            empty_default=["ALL"] if user["role"] in {"SuperAdmin", "Admin"} else [],
        )
    if "managedDepartmentsByBranch" in data:
        user["managedDepartmentsByBranch"] = normalize_managed_departments_by_branch(
            data.get("managedDepartmentsByBranch")
        )
    if user["role"] != "Supervisor":
        user["managedBranches"] = normalize_scope_list(
            user.get("managedBranches"),
            empty_default=["ALL"] if user["role"] in {"SuperAdmin", "Admin"} else [],
        )
        user["managedDepartmentsByBranch"] = {}
    if "permissions" in data:
        user["permissions"] = normalize_user_permissions(data.get("permissions"), user["role"])
    else:
        user["permissions"] = normalize_user_permissions(user.get("permissions"), user["role"])
    try:
        validate_supervisor_configuration(user)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    if "imageFile" in data:
        previous_image = str(user.get("imageFile") or "").strip()
        image_file = data.get("imageFile")
        user["imageFile"] = str(image_file) if image_file else None
        if previous_image.startswith("LOCAL:") and previous_image != user["imageFile"]:
            remove_uploaded_file_if_unused(previous_image.replace("LOCAL:", "", 1).strip())
    if "isActive" in data:
        user["isActive"] = bool(data.get("isActive"))
        user["accountStatus"] = "active" if user["isActive"] else "suspended"
    if "accountStatus" in data:
        account_status = str(data.get("accountStatus") or "").strip().lower()
        if account_status not in ACCOUNT_STATUSES:
            return jsonify({"error": "Account status must be active, suspended, or disabled"}), 400
        if user["id"] == auth_user["id"] and account_status != "active":
            return jsonify({"error": "You cannot suspend or disable your own account"}), 400
        if user["role"] == "SuperAdmin" and auth_user["role"] != "SuperAdmin":
            return jsonify({"error": "Only a Super Admin can change another Super Admin account"}), 403
        user["accountStatus"] = account_status
        user["isActive"] = account_status == "active"
        should_revoke_sessions = account_status != "active"
    else:
        should_revoke_sessions = False
    was_active_super_admin = before_staff.get("role") == "SuperAdmin" and before_staff.get("accountStatus", "active") == "active"
    remains_active_super_admin = user.get("role") == "SuperAdmin" and user.get("accountStatus", "active") == "active"
    if was_active_super_admin and not remains_active_super_admin:
        other_active_super_admins = [item for item in users if item.get("id") != user_id and item.get("role") == "SuperAdmin" and item.get("accountStatus", "active") == "active"]
        if not other_active_super_admins:
            return jsonify({"error": "The final active Super Admin cannot be disabled, suspended, or assigned another role"}), 409
    if should_revoke_sessions:
        revoke_user_sessions(user_id)
    save_user_store(users)
    if dict(user) != before_staff:
        record_audit_log(
            auth_user,
            "UPDATE_STAFF",
            staff_audit_target(
                user,
                {
                    "before": {
                        key: before_staff.get(key)
                        for key in ["fullname", "phone", "position", "department", "branch", "role", "isActive"]
                    },
                    "after": {
                        key: user.get(key)
                        for key in ["fullname", "phone", "position", "department", "branch", "role", "isActive"]
                    },
                },
            ),
        )
    if "isActive" in data and bool(user.get("isActive", False)) != previous_active:
        record_audit_log(
            auth_user,
            "ACTIVATE_STAFF" if bool(user.get("isActive", False)) else "DEACTIVATE_STAFF",
            staff_audit_target(
                user,
                {
                    "before": {"isActive": previous_active},
                    "after": {"isActive": bool(user.get("isActive", False))},
                },
            ),
        )
    current_supervisor_access = {
        "role": str(user.get("role", "")),
        "managedBranches": normalize_scope_list(user.get("managedBranches"), empty_default=[]),
        "managedDepartmentsByBranch": normalize_managed_departments_by_branch(
            user.get("managedDepartmentsByBranch")
        ),
        "permissions": normalize_user_permissions(user.get("permissions"), str(user.get("role", ""))),
    }
    if current_supervisor_access != previous_supervisor_access:
        record_audit_log(
            auth_user,
            "SUPERVISOR_ACCESS_UPDATE",
            {
                "staffId": user["id"],
                "staffName": user["fullname"],
                "before": previous_supervisor_access,
                "after": current_supervisor_access,
            },
        )
    return jsonify({"ok": True, "user": user})


@app.route("/api/staff/<user_id>/archive", methods=["POST", "OPTIONS"])
def archive_staff(user_id: str):
    preflight = handle_options()
    if preflight:
        return preflight
    _, auth_user, error = require_authenticated_user()
    if error:
        return error
    if auth_user["role"] not in {"SuperAdmin", "Admin"} and not user_has_permission(auth_user, "userManagement"):
        return jsonify({"error": "Admin access required"}), 403
    if user_id == auth_user["id"]:
        return jsonify({"error": "You cannot remove your own account"}), 400
    users = load_user_store()
    user = find_user_by_id(users, user_id)
    if not user:
        return jsonify({"error": "Staff member not found"}), 404
    if user.get("role") == "BossAdmin":
        return jsonify({"error": "The platform controller account is isolated from bank user administration"}), 403
    if not can_view_staff_record(auth_user, user):
        return scoped_access_denial(auth_user)
    if user["role"] == "SuperAdmin":
        return jsonify({"error": "Cannot archive Super Admin."}), 400
    user["isArchived"] = True
    user["isActive"] = False
    save_user_store(users)
    revoke_user_sessions(user_id)
    record_audit_log(auth_user, "ARCHIVE_STAFF", staff_audit_target(user))
    notify_active_managers(
        kind="staff",
        title="Staff archived",
        message=f"{auth_user['fullname']} archived {user['fullname']}.",
        link_to="/past-staff",
    )
    return jsonify({"ok": True})


@app.route("/api/staff/<user_id>/restore", methods=["POST", "OPTIONS"])
def restore_staff(user_id: str):
    preflight = handle_options()
    if preflight:
        return preflight
    _, auth_user, error = require_staff_manager()
    if error:
        return error
    users = load_user_store()
    user = find_user_by_id(users, user_id)
    if not user:
        return jsonify({"error": "Staff member not found"}), 404
    if user.get("role") == "BossAdmin":
        return jsonify({"error": "The platform controller account is isolated from bank user administration"}), 403
    if not can_view_staff_record(auth_user, user):
        return scoped_access_denial(auth_user)
    user["isArchived"] = False
    user["isActive"] = True
    save_user_store(users)
    record_audit_log(auth_user, "RESTORE_STAFF", staff_audit_target(user))
    notify_active_managers(
        kind="staff",
        title="Staff restored",
        message=f"{auth_user['fullname']} restored {user['fullname']} to the active directory.",
        link_to="/directory",
    )
    return jsonify({"ok": True})


@app.route("/api/auth/register", methods=["POST", "OPTIONS"])
def auth_register():
    preflight = handle_options()
    if preflight:
        return preflight
    if not self_registration_enabled():
        return jsonify({"error": "Self-registration is disabled. Ask an administrator to create your account."}), 403
    data, error = require_json()
    if error:
        return error
    try:
        email = validate_email(str(data.get("email", "")))
        password = str(data.get("password", ""))
        validate_password_strength(password)
        if password != str(data.get("confirmPassword", "")):
            return jsonify({"error": "Passwords do not match"}), 400

        users = load_user_store()
        if find_user_by_email(users, email):
            return jsonify({"error": "An account already exists for this email. Use Forgot Password or contact an administrator."}), 409
        staff_record = next(
            (
                item for item in load_json_list_store(STAFF_RECORDS_STORE_PATH)
                if str(item.get("email", "")).strip().lower() == email
                and str(item.get("employmentStatus", "")).strip().lower() == "active"
            ),
            None,
        )
        if not staff_record:
            return jsonify({"error": "Your official email could not be matched to an active staff record. Contact Finance or an administrator."}), 400
        selected_branch = normalize_portal_branch_name(data.get("branch"))
        selected_department = normalize_portal_department_name(data.get("department"))
        if str(staff_record.get("branch", "")).strip().upper() != selected_branch:
            return jsonify({"error": "The selected branch does not match your Staff Directory record."}), 400
        if str(staff_record.get("department", "")).strip().upper() != selected_department:
            return jsonify({"error": "The selected department does not match your Staff Directory record."}), 400
        if any(item.get("staffRecordId") == staff_record.get("id") for item in users):
            return jsonify({"error": "An account is already linked to this staff record. Contact an administrator."}), 409

        user = normalize_user({
            "id": f"user-{int(time.time() * 1000)}-{secrets.token_hex(3)}",
            "fullname": str(staff_record.get("fullName") or data.get("fullname") or "").strip(),
            "phone": str(data.get("phone") or staff_record.get("phone") or "").strip(),
            "email": email,
            "role": "Management",
            "position": str(staff_record.get("position") or "Staff").strip(),
            "department": str(staff_record.get("department") or "").strip(),
            "branch": str(staff_record.get("branch") or "").strip(),
            "staffRecordId": staff_record.get("id"),
            "accountStatus": "suspended",
            "isVerified": True,
            "registrationTime": now_ms(),
            "lastSeen": 0,
            "isArchived": False,
            "mustChangePassword": False,
        })
        users.append(user)
        save_user_store(users)
        passwords = load_password_store()
        passwords[email] = hash_password_for_storage(password)
        save_password_store(passwords)
        record_audit_log(None, "SELF_REGISTRATION_REQUEST", staff_audit_target(user, {"accountStatus": "suspended"}))
        notify_active_managers(
            kind="user",
            title="New account approval required",
            message=f"{user['fullname']} requested access to the payslip platform.",
            link_to="/users",
        )
        return jsonify({"ok": True, "message": "Registration received. An administrator must approve your account before you can sign in."}), 201
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400


@app.route("/api/auth/login", methods=["POST", "OPTIONS"])
def auth_login():
    preflight = handle_options()
    if preflight:
        return preflight
    data, error = require_json()
    if error:
        return error
    try:
        email = validate_email(str(data.get("email", "")), enforce_current_domain=False)
        password = str(data.get("passwordHash", ""))
        if not password:
            return jsonify({"error": "Password is required"}), 400
        locked_for = login_lock_seconds(email)
        if locked_for:
            record_audit_log(None, "LOGIN_BLOCKED_LOCKOUT", {"emailHash": login_attempt_key(email), "retryAfterSeconds": locked_for})
            return jsonify({"error": "Account temporarily locked after repeated failed sign-in attempts. Try again later.", "retryAfterSeconds": locked_for}), 423

        passwords = load_password_store()
        stored_password = passwords.get(email)
        if not stored_password or not verify_password(stored_password, password):
            locked_for = record_failed_login_attempt(email)
            record_audit_log(
                None,
                "LOGIN_FAILED",
                {"emailHash": login_attempt_key(email), "reason": "invalid_credentials", "lockoutStarted": bool(locked_for)},
            )
            if locked_for:
                return jsonify({"error": "Account temporarily locked after repeated failed sign-in attempts. Try again later.", "retryAfterSeconds": locked_for}), 423
            return jsonify({"error": "Invalid email or password"}), 401

        users = load_user_store()
        user = find_user_by_email(users, email)
        if not user or user["isArchived"]:
            record_audit_log(
                None,
                "LOGIN_FAILED",
                {"emailHash": login_attempt_key(email), "reason": "inactive_or_missing_account"},
            )
            return jsonify({"error": "Invalid email or password"}), 401
        if user.get("accountStatus") != "active" or not user["isActive"]:
            status = str(user.get("accountStatus") or "suspended")
            record_audit_log(None, "LOGIN_FAILED", {"emailHash": login_attempt_key(email), "reason": f"account_{status}"})
            return jsonify({"error": f"This account is {status}. Contact an administrator."}), 403
        if not user["isVerified"]:
            record_audit_log(
                None,
                "LOGIN_FAILED",
                {"emailHash": login_attempt_key(email), "reason": "email_not_verified"},
            )
            return jsonify({"error": "Email not verified"}), 403

        if user_mfa_enabled(user["id"]):
            mfa_code = data.get("mfaCode")
            if not mfa_code:
                return jsonify({"error": "Authenticator code required", "mfaRequired": True}), 428
            if not verify_user_mfa(user["id"], mfa_code):
                record_audit_log(None, "LOGIN_FAILED", {"emailHash": login_attempt_key(email), "reason": "invalid_mfa"})
                return jsonify({"error": "Invalid authenticator code", "mfaRequired": True}), 401

        if not is_secure_password_hash(stored_password):
            passwords[email] = hash_password_for_storage(password)
            save_password_store(passwords)

        clear_failed_login_attempts(email)
        user["lastSeen"] = now_ms()
        user["lastLogin"] = user["lastSeen"]
        save_user_store(users)
        session_token, csrf_token = issue_session(user["id"])
        record_audit_log(user, "LOGIN", staff_audit_target(user))
        response = jsonify({"ok": True, "user": serialize_user_with_presence(user), "csrfToken": csrf_token})
        return attach_session_cookies(response, session_token, csrf_token)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400


@app.route("/api/auth/change-password", methods=["POST", "OPTIONS"])
def auth_change_password():
    preflight = handle_options()
    if preflight:
        return preflight
    token, auth_user, error = require_authenticated_user()
    if error:
        return error
    data, error = require_json()
    if error:
        return error
    current_password = str(data.get("currentPassword", ""))
    new_password = str(data.get("newPassword", ""))
    passwords = load_password_store()
    if not verify_password(passwords.get(auth_user["email"], ""), current_password):
        return jsonify({"error": "Current password is incorrect"}), 401
    try:
        validate_password_strength(new_password)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    if current_password == new_password:
        return jsonify({"error": "Choose a password different from the temporary password"}), 400
    passwords[auth_user["email"]] = hash_password_for_storage(new_password)
    save_password_store(passwords)
    users = load_user_store()
    user = find_user_by_id(users, auth_user["id"])
    user["mustChangePassword"] = False
    save_user_store(users)
    revoke_user_sessions(user["id"])
    new_token, csrf_token = issue_session(user["id"])
    record_audit_log(user, "CHANGE_PASSWORD", staff_audit_target(user))
    response = jsonify({"ok": True, "user": serialize_user_with_presence(user), "csrfToken": csrf_token})
    return attach_session_cookies(response, new_token, csrf_token)


@app.route("/api/auth/mfa/status", methods=["GET"])
def auth_mfa_status():
    _, auth_user, error = require_authenticated_user()
    if error:
        return error
    return jsonify({"enabled": user_mfa_enabled(auth_user["id"]), "encryptionConfigured": bool(mfa_fernet())})


@app.route("/api/auth/mfa/enroll", methods=["POST", "OPTIONS"])
def auth_mfa_enroll():
    preflight = handle_options()
    if preflight:
        return preflight
    _, auth_user, error = require_authenticated_user()
    if error:
        return error
    try:
        secret = pyotp.random_base32()
        store = load_mfa_store()
        store[auth_user["id"]] = {"secret": encrypt_mfa_secret(secret), "enabled": False, "createdAt": now_ms()}
        save_mfa_store(store)
        issuer = str(load_portal_settings_store().get("shortBankName") or "BCB")
        uri = pyotp.TOTP(secret).provisioning_uri(name=auth_user["email"], issuer_name=f"{issuer} Payslip")
        record_audit_log(auth_user, "MFA_ENROLLMENT_STARTED", staff_audit_target(auth_user))
        return jsonify({"secret": secret, "provisioningUri": uri})
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 503


@app.route("/api/auth/mfa/confirm", methods=["POST", "OPTIONS"])
def auth_mfa_confirm():
    preflight = handle_options()
    if preflight:
        return preflight
    _, auth_user, error = require_authenticated_user()
    if error:
        return error
    data, error = require_json()
    if error:
        return error
    store = load_mfa_store()
    entry = store.get(auth_user["id"], {})
    if not isinstance(entry, dict) or not entry.get("secret"):
        return jsonify({"error": "Start MFA enrollment first"}), 409
    try:
        code = "".join(ch for ch in str(data.get("code", "")) if ch.isdigit())
        valid = len(code) == 6 and pyotp.TOTP(decrypt_mfa_secret(entry["secret"])).verify(code, valid_window=1)
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 503
    if not valid:
        return jsonify({"error": "Invalid authenticator code"}), 400
    entry["enabled"] = True
    entry["enabledAt"] = now_ms()
    recovery_codes = [f"{secrets.token_hex(2).upper()}-{secrets.token_hex(2).upper()}" for _ in range(8)]
    entry["recoveryHashes"] = [hashlib.sha256(code.replace("-", "").encode("utf-8")).hexdigest() for code in recovery_codes]
    store[auth_user["id"]] = entry
    save_mfa_store(store)
    record_audit_log(auth_user, "MFA_ENABLED", staff_audit_target(auth_user))
    return jsonify({"ok": True, "enabled": True, "recoveryCodes": recovery_codes})


@app.route("/api/auth/mfa/disable", methods=["POST", "OPTIONS"])
def auth_mfa_disable():
    preflight = handle_options()
    if preflight:
        return preflight
    _, auth_user, error = require_authenticated_user()
    if error:
        return error
    data, error = require_json()
    if error:
        return error
    passwords = load_password_store()
    if not verify_password(passwords.get(auth_user["email"], ""), str(data.get("password", ""))):
        return jsonify({"error": "Current password is incorrect"}), 401
    if user_mfa_enabled(auth_user["id"]) and not verify_user_mfa(auth_user["id"], data.get("code")):
        return jsonify({"error": "Invalid authenticator code"}), 400
    store = load_mfa_store()
    store.pop(auth_user["id"], None)
    save_mfa_store(store)
    revoke_user_sessions(auth_user["id"])
    record_audit_log(auth_user, "MFA_DISABLED", staff_audit_target(auth_user))
    return clear_session_cookies(jsonify({"ok": True}))


@app.route("/api/auth/logout", methods=["POST", "OPTIONS"])
def auth_logout():
    preflight = handle_options()
    if preflight:
        return preflight
    token, auth_user, error = require_authenticated_user()
    if error:
        return error
    set_user_last_seen(auth_user["id"], now_ms())
    store = prune_presence(load_presence_store())
    store.pop(auth_user["id"], None)
    save_presence_store(store)
    revoke_session(token)
    record_audit_log(auth_user, "LOGOUT", staff_audit_target(auth_user))
    return clear_session_cookies(jsonify({"ok": True}))


@app.route("/api/auth/activity", methods=["GET"])
def get_login_activity():
    _, auth_user, error = require_authenticated_user()
    if error:
        return error
    allowed_actions = {"LOGIN", "LOGOUT", "COMPLETE_PASSWORD_RESET", "ADMIN_PASSWORD_RESET"}
    activity = [
        item for item in load_audit_logs_store()
        if str(item.get("actorId")) == str(auth_user["id"])
        and str(item.get("action", "")).upper() in allowed_actions
    ][:20]
    return jsonify({"activity": activity})


@app.route("/api/auth/request-password-reset", methods=["POST", "OPTIONS"])
def auth_request_password_reset():
    preflight = handle_options()
    if preflight:
        return preflight
    data, error = require_json()
    if error:
        return error
    try:
        email = validate_email(str(data.get("email", "")), enforce_current_domain=False)
        reset_page_url = str(data.get("resetPageUrl", "")).strip()

        users = load_user_store()
        user = find_user_by_email(users, email)
        if not user:
            record_audit_log(None, "REQUEST_PASSWORD_RESET_UNKNOWN", {"emailHash": login_attempt_key(email)})
            return jsonify({"ok": True, "message": "If the account exists, a reset link will be sent."})

        token = secrets.token_urlsafe(32)
        reset_url = build_reset_url(reset_page_url, token)
        tokens = load_reset_tokens()
        tokens[token_storage_key(token)] = {
            "email": email,
            "expiresAt": int(time.time()) + int(load_portal_settings_store()["passwordResetMinutes"]) * 60,
        }
        save_reset_tokens(tokens)
        send_password_reset_link_email(email, reset_url)
        record_audit_log(None, "REQUEST_PASSWORD_RESET", staff_audit_target(user))
        return jsonify({"ok": True, "message": "If the account exists, a reset link will be sent."})
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        app.logger.exception("Password reset email failed")
        record_audit_log(None, "PASSWORD_RESET_EMAIL_FAILED", {"reason": type(exc).__name__})
        return jsonify({"ok": True, "message": "If the account exists, a reset link will be sent."})


@app.route("/api/auth/password-reset", methods=["POST", "OPTIONS"])
def auth_password_reset():
    preflight = handle_options()
    if preflight:
        return preflight
    data, error = require_json()
    if error:
        return error
    token = str(data.get("token", "")).strip()
    new_password = str(data.get("newPasswordHash", ""))
    if not token:
        return jsonify({"error": "token is required"}), 400
    if not new_password:
        return jsonify({"error": "Password is required"}), 400
    try:
        validate_password_strength(new_password)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    tokens = load_reset_tokens()
    stored_token_key = token_storage_key(token) if token_storage_key(token) in tokens else token
    entry = tokens.get(stored_token_key)
    if not entry:
        return jsonify({"error": "Invalid or expired reset token"}), 400

    email = entry["email"]
    users = load_user_store()
    if not find_user_by_email(users, email):
        return jsonify({"error": "Invalid or expired reset token"}), 400

    passwords = load_password_store()
    passwords[email] = hash_password_for_storage(new_password)
    tokens.pop(stored_token_key, None)
    save_password_store(passwords)
    save_reset_tokens(tokens)
    clear_failed_login_attempts(email)
    user = find_user_by_email(users, email)
    if user:
        user["mustChangePassword"] = False
        save_user_store(users)
        revoke_user_sessions(user["id"])
        record_audit_log(None, "COMPLETE_PASSWORD_RESET", staff_audit_target(user))
    return jsonify({"ok": True})


@app.route("/", defaults={"path": ""}, methods=["GET"])
@app.route("/<path:path>", methods=["GET"])
def serve_frontend(path: str):
    requested = str(path or "").strip().lstrip("/")
    if not os.path.isdir(FRONTEND_PUBLIC_DIR):
        return jsonify({"error": "Frontend build is not installed on this server."}), 404

    if requested:
        candidate = os.path.join(FRONTEND_PUBLIC_DIR, requested)
        if os.path.isfile(candidate):
            return send_from_directory(FRONTEND_PUBLIC_DIR, requested, conditional=True)

    index_path = os.path.join(FRONTEND_PUBLIC_DIR, "index.html")
    if os.path.isfile(index_path):
        return send_from_directory(FRONTEND_PUBLIC_DIR, "index.html", conditional=True)

    return jsonify({"error": "Frontend entry point not found."}), 404


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "4185")))
