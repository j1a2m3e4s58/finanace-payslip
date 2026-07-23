import time
from io import BytesIO

import pytest
from cryptography.fernet import Fernet
from werkzeug.datastructures import FileStorage

import app as portal


def test_password_policy_rejects_weak_password():
    with pytest.raises(ValueError):
        portal.validate_password_strength("password")


def test_password_hash_is_not_plaintext():
    password = "VeryStrong!Pass42"
    stored = portal.hash_password_for_storage(password)
    assert stored != password
    assert portal.verify_password(stored, password)


def test_payroll_calculations_are_server_side():
    payload = {field: 0 for field in portal.PAYROLL_MANUAL_FIELDS}
    payload.update({"basicSalary": 1000, "staffId": "BCB-001", "fullName": "Test Staff"})
    result = portal.calculate_payroll_entry(payload)
    assert result["ssf"] == 55
    assert result["esp"] == 45
    assert result["pf"] == 45
    assert result["employerSsf"] == 130
    assert result["netSalary"] == 855


def test_payroll_calculations_use_configured_rate_snapshot():
    payload = {field: 0 for field in portal.PAYROLL_MANUAL_FIELDS}
    payload.update({"basicSalary": 2000, "staffId": "BCB-002", "fullName": "Rate Test"})
    rates = {"employeeSsf": 6, "employeeEsp": 3, "employeePf": 2, "employerSsf": 14, "employerPf": 7}
    result = portal.calculate_payroll_entry(payload, contribution_rates=rates)
    assert result["ssf"] == 120
    assert result["esp"] == 60
    assert result["pf"] == 40
    assert result["employerSsf"] == 280
    assert result["employerPf"] == 140
    assert result["netSalary"] == 1780


def test_rate_history_selects_profile_by_payroll_month():
    settings = {
        "contributionRates": {"employeeSsf": 7, "employeeEsp": 4.5, "employeePf": 4.5, "employerSsf": 13, "employerPf": 5},
        "contributionRateEffectiveMonth": "2027-01",
        "contributionRateHistory": [{
            "effectiveMonth": "2000-01",
            "rates": {"employeeSsf": 5.5, "employeeEsp": 4.5, "employeePf": 4.5, "employerSsf": 13, "employerPf": 5},
        }],
    }
    assert portal.contribution_rate_profile_for_period("2026-12", settings)["rates"]["employeeSsf"] == 5.5
    assert portal.contribution_rate_profile_for_period("2027-01", settings)["rates"]["employeeSsf"] == 7


def test_staff_import_schema_protects_identity_columns_and_accepts_custom_columns():
    schema = portal.normalize_staff_import_schema({
        "version": 4,
        "maxFileSizeMb": 8,
        "maxRows": 2500,
        "columns": [
            {"key": "fullName", "label": "Employee Name", "aliases": ["Staff Name"], "enabled": False, "required": False},
            {"key": "custom_cost_centre", "label": "Cost Centre", "aliases": ["Cost Center"], "enabled": True, "required": True, "custom": True},
        ],
    }, strict=True)
    columns = {column["key"]: column for column in schema["columns"]}
    assert columns["fullName"]["enabled"] is True
    assert columns["fullName"]["required"] is True
    assert columns["custom_cost_centre"]["required"] is True
    assert {"staffId", "email", "employmentStatus"}.issubset(columns)
    assert schema["maxFileSizeMb"] == 8
    assert schema["maxRows"] == 2500


def test_staff_import_schema_rejects_duplicate_titles():
    with pytest.raises(ValueError, match="Duplicate staff import title"):
        portal.normalize_staff_import_schema({
            "columns": [
                {"key": "fullName", "label": "Staff"},
                {"key": "custom_team", "label": "Staff", "custom": True},
            ],
        }, strict=True)


def test_staff_record_preserves_allowlisted_custom_import_values(monkeypatch):
    schema = portal.normalize_staff_import_schema({
        "columns": [
            *portal.DEFAULT_STAFF_IMPORT_COLUMNS,
            {"key": "custom_cost_centre", "label": "Cost Centre", "enabled": True, "custom": True},
        ],
    })
    monkeypatch.setattr(portal, "load_portal_settings_store", lambda: {
        "emailDomain": "@bawjiasecommunitybank.com",
        "staffImportSchema": schema,
    })
    record = portal.normalize_staff_record({
        "staffId": "BCB-100",
        "fullName": "Import Test",
        "email": "import.test@bawjiasecommunitybank.com",
        "customFields": {"custom_cost_centre": "CC-45", "custom_unknown": "discard me"},
    })
    assert record["customFields"] == {"custom_cost_centre": "CC-45"}


def test_negative_payroll_amount_is_rejected():
    payload = {field: 0 for field in portal.PAYROLL_MANUAL_FIELDS}
    payload["basicSalary"] = -1
    with pytest.raises(ValueError):
        portal.calculate_payroll_entry(payload)


def test_backup_schedule_due_logic():
    now = time.time()
    assert portal.scheduled_backup_due("daily", now - 90000)
    assert not portal.scheduled_backup_due("weekly", now - 90000)
    assert not portal.scheduled_backup_due("off", 0)


def test_destructive_and_bypass_routes_are_absent():
    rules = {rule.rule for rule in portal.app.url_map.iter_rules()}
    assert "/api/audit-logs/delete" not in rules
    assert "/api/audit-logs/<int:item_id>/delete" not in rules
    assert "/api/staff/<user_id>/delete" not in rules
    assert "/api/payroll-batches/<batch_id>/mark-sent" not in rules
    assert "/api/auth/register" in rules


def test_new_user_security_fields_are_preserved():
    user = portal.normalize_user({"id": "u1", "email": "finance@bawjiasecommunitybank.com", "department": "FINANCE", "branch": "HEAD OFFICE", "role": "FinanceOfficer", "mustChangePassword": True, "staffRecordId": "staff-1"})
    assert user["mustChangePassword"] is True
    assert user["staffRecordId"] == "staff-1"


def test_only_boss_admin_can_open_portal_control(monkeypatch):
    with portal.app.test_request_context("/"):
        monkeypatch.setattr(portal, "require_authenticated_user", lambda: ("token", {"role": "SuperAdmin"}, None))
        assert portal.require_portal_controller()[2][1] == 403
        monkeypatch.setattr(portal, "require_authenticated_user", lambda: ("token", {"role": "BossAdmin"}, None))
        assert portal.require_portal_controller()[2] is None


def test_boss_admin_cannot_view_confidential_payroll(monkeypatch):
    monkeypatch.setattr(portal, "require_authenticated_user", lambda: ("token", {"role": "BossAdmin"}, None))
    with portal.app.test_request_context("/"):
        _, _, error = portal.require_payroll_viewer()
    assert error[1] == 403


def test_token_storage_never_uses_bearer_value():
    token = "a-secret-bearer-token"
    stored = portal.token_storage_key(token)
    assert stored != token
    assert len(stored) == 64


def test_recovery_code_is_single_use(monkeypatch):
    code = "ABCD1234"
    entry = {"enabled": True, "secret": "encrypted", "recoveryHashes": [portal.hashlib.sha256(code.encode()).hexdigest()]}
    store = {"u1": entry}
    monkeypatch.setattr(portal, "load_mfa_store", lambda: store)
    monkeypatch.setattr(portal, "save_mfa_store", lambda updated: store.update(updated))
    assert portal.verify_user_mfa("u1", code) is True
    assert portal.verify_user_mfa("u1", code) is False


def test_mfa_enrollment_encrypts_secret_and_issues_recovery_codes(monkeypatch):
    user = {"id": "u-mfa", "email": "mfa.user@bawjiasecommunitybank.com", "role": "FinanceOfficer"}
    store = {}
    monkeypatch.setenv("MFA_ENCRYPTION_KEY", Fernet.generate_key().decode("ascii"))
    monkeypatch.setattr(portal, "require_authenticated_user", lambda: ("token", user, None))
    monkeypatch.setattr(portal, "load_mfa_store", lambda: store)
    monkeypatch.setattr(portal, "save_mfa_store", lambda updated: store.update(updated))
    monkeypatch.setattr(portal, "record_audit_log", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(portal, "load_portal_settings_store", lambda: {"shortBankName": "BCB"})
    with portal.app.test_request_context("/api/auth/mfa/enroll", method="POST"):
        enrollment = portal.auth_mfa_enroll().get_json()
    assert enrollment["secret"] not in store[user["id"]]["secret"]
    code = portal.pyotp.TOTP(enrollment["secret"]).now()
    with portal.app.test_request_context("/api/auth/mfa/confirm", method="POST", json={"code": code}):
        confirmation = portal.auth_mfa_confirm().get_json()
    assert confirmation["enabled"] is True
    assert len(confirmation["recoveryCodes"]) == 8
    assert portal.user_mfa_enabled(user["id"]) is True


def test_admin_mfa_reset_revokes_sessions_and_records_audit(monkeypatch):
    admin = {"id": "admin-1", "role": "SuperAdmin", "fullname": "Security Admin"}
    target = {"id": "user-1", "email": "user@bawjiasecommunitybank.com", "role": "FinanceOfficer", "fullname": "Finance User"}
    store = {target["id"]: {"enabled": True, "secret": "encrypted"}}
    revoked = []
    audited = []
    monkeypatch.setattr(portal, "require_staff_manager", lambda: ("token", admin, None))
    monkeypatch.setattr(portal, "load_user_store", lambda: [target])
    monkeypatch.setattr(portal, "load_mfa_store", lambda: store)
    monkeypatch.setattr(portal, "save_mfa_store", lambda updated: store.update(updated))
    monkeypatch.setattr(portal, "revoke_user_sessions", lambda user_id: revoked.append(user_id))
    monkeypatch.setattr(portal, "record_audit_log", lambda actor, action, payload: audited.append((actor, action, payload)))
    with portal.app.test_request_context(f"/api/users/{target['id']}/reset-mfa", method="POST"):
        response = portal.admin_reset_user_mfa(target["id"])
    assert response.get_json()["ok"] is True
    assert target["id"] not in store
    assert revoked == [target["id"]]
    assert audited[0][1] == "ADMIN_MFA_RESET"


def test_bank_admin_cannot_reset_isolated_boss_admin_mfa(monkeypatch):
    admin = {"id": "admin-1", "role": "SuperAdmin", "fullname": "Security Admin"}
    target = {"id": "boss-1", "email": "boss@bawjiasecommunitybank.com", "role": "BossAdmin", "fullname": "Platform Controller"}
    monkeypatch.setattr(portal, "require_staff_manager", lambda: ("token", admin, None))
    monkeypatch.setattr(portal, "load_user_store", lambda: [target])
    with portal.app.test_request_context(f"/api/users/{target['id']}/reset-mfa", method="POST"):
        response, status = portal.admin_reset_user_mfa(target["id"])
    assert status == 403
    assert "isolated" in response.get_json()["error"].lower()


@pytest.mark.parametrize("role", ["FinanceApprover", "Auditor", "Management"])
def test_non_editing_roles_cannot_manage_staff(monkeypatch, role):
    monkeypatch.setattr(portal, "require_authenticated_user", lambda: ("token", {"role": role}, None))
    with portal.app.test_request_context("/"):
        _, _, error = portal.require_staff_records_manager()
        assert error[1] == 403


@pytest.mark.parametrize("role", ["Admin", "FinanceOfficer", "Management", "Auditor"])
def test_only_approval_roles_can_approve_payroll(monkeypatch, role):
    monkeypatch.setattr(portal, "require_authenticated_user", lambda: ("token", {"role": role}, None))
    with portal.app.test_request_context("/"):
        _, _, error = portal.require_payroll_approver()
        assert error[1] == 403


def test_session_cookie_is_http_only_and_strict(monkeypatch):
    monkeypatch.setattr(portal, "load_portal_settings_store", lambda: {"sessionDays": 1})
    with portal.app.test_request_context("/", headers={"X-Forwarded-Proto": "https"}):
        response = portal.attach_session_cookies(portal.jsonify({"ok": True}), "session-secret", "csrf-secret")
        cookies = response.headers.getlist("Set-Cookie")
    session_cookie = next(value for value in cookies if value.startswith(f"{portal.SESSION_COOKIE_NAME}="))
    csrf_cookie = next(value for value in cookies if value.startswith(f"{portal.CSRF_COOKIE_NAME}="))
    assert "HttpOnly" in session_cookie and "SameSite=Strict" in session_cookie and "Secure" in session_cookie
    assert "HttpOnly" not in csrf_cookie and "SameSite=Strict" in csrf_cookie


def test_cookie_authenticated_mutation_requires_csrf(monkeypatch):
    session_token = "session-secret"
    monkeypatch.setattr(portal, "load_sessions", lambda: {portal.token_storage_key(session_token): {"userId": "u1", "csrfHash": portal.token_storage_key("csrf-secret")}})
    with portal.app.test_request_context("/api/users", method="POST", headers={"Cookie": f"{portal.SESSION_COOKIE_NAME}={session_token}"}):
        result = portal.enforce_transport_and_api_authentication()
    assert result[1] == 403


def test_session_token_is_never_accepted_in_url():
    with portal.app.test_request_context("/api/users?sessionToken=leaked-token"):
        assert portal.parse_session_token() == ""


def test_recipient_validation_blocks_duplicate_and_inactive_staff(monkeypatch):
    staff = [
        {"id": "s1", "employmentStatus": "active", "email": "one@bawjiasecommunitybank.com"},
        {"id": "s2", "employmentStatus": "active", "email": "one@bawjiasecommunitybank.com"},
        {"id": "s3", "employmentStatus": "inactive", "email": "three@bawjiasecommunitybank.com"},
    ]
    monkeypatch.setattr(portal, "load_json_list_store", lambda _path: staff)
    batch = {"entries": [
        {"staffRecordId": "s1", "staffId": "1", "fullName": "One", "email": staff[0]["email"]},
        {"staffRecordId": "s2", "staffId": "2", "fullName": "Two", "email": staff[1]["email"]},
        {"staffRecordId": "s3", "staffId": "3", "fullName": "Three", "email": staff[2]["email"]},
    ]}
    issues = portal.validate_payslip_recipients(batch)
    assert any("Duplicate email" in item["issue"] for item in issues)
    assert any("inactive" in item["issue"] for item in issues)


def test_delivery_claim_is_idempotent(monkeypatch):
    records = [{"id": "d1", "status": "Pending", "statusHistory": []}]
    def mutate(_path, callback):
        nonlocal records
        records, result = callback(records)
        return result
    monkeypatch.setattr(portal, "mutate_json_list_store", mutate)
    assert portal.claim_payslip_delivery("d1")["status"] == "Sending"
    assert portal.claim_payslip_delivery("d1") is None


def test_fake_image_upload_is_rejected(tmp_path, monkeypatch):
    monkeypatch.setattr(portal, "UPLOADS_DIR", str(tmp_path))
    uploaded = FileStorage(stream=BytesIO(b"not-an-image"), filename="logo.png", content_type="image/png")
    with pytest.raises(ValueError):
        portal.save_uploaded_media(uploaded, "branding")


@pytest.mark.parametrize("role", ["Admin", "Auditor", "Management"])
def test_non_payroll_roles_cannot_view_confidential_payroll(monkeypatch, role):
    monkeypatch.setattr(portal, "require_authenticated_user", lambda: ("token", {"role": role}, None))
    with portal.app.test_request_context("/"):
        _, _, error = portal.require_payroll_viewer()
    assert error[1] == 403


@pytest.mark.parametrize("role", ["Admin", "FinanceApprover", "Auditor", "Management"])
def test_only_finance_officer_can_prepare_payroll(monkeypatch, role):
    monkeypatch.setattr(portal, "require_authenticated_user", lambda: ("token", {"role": role}, None))
    with portal.app.test_request_context("/"):
        _, _, error = portal.require_payroll_preparer()
    assert error[1] == 403


def test_required_malware_scanner_fails_closed(tmp_path, monkeypatch):
    upload = tmp_path / "logo.png"
    upload.write_bytes(b"placeholder")
    monkeypatch.delenv("MALWARE_SCANNER_COMMAND", raising=False)
    monkeypatch.setenv("REQUIRE_MALWARE_SCANNER", "true")
    with pytest.raises(ValueError, match="required"):
        portal.scan_uploaded_file(str(upload))


def test_missing_mfa_key_does_not_create_navigation_trap(monkeypatch):
    monkeypatch.delenv("MFA_ENCRYPTION_KEY", raising=False)
    monkeypatch.delenv("DATA_ENCRYPTION_KEY", raising=False)
    assert portal.mfa_configuration_available() is False


def test_delivery_webhook_rejects_invalid_secret(monkeypatch):
    monkeypatch.setenv("DELIVERY_WEBHOOK_SECRET", "correct-secret")
    with portal.app.test_request_context(
        "/api/email-delivery/webhook",
        method="POST",
        headers={"X-Delivery-Webhook-Secret": "wrong-secret"},
        json={"deliveryId": "d1", "status": "Delivered"},
    ):
        response, status = portal.payslip_delivery_webhook()
    assert status == 401
    assert response.get_json()["error"] == "Invalid webhook signature"


def test_delivery_webhook_updates_provider_event(monkeypatch):
    monkeypatch.setenv("DELIVERY_WEBHOOK_SECRET", "correct-secret")
    monkeypatch.setattr(portal, "load_json_list_store", lambda _path: [{"id": "d1", "providerMessageId": "message-1"}])
    monkeypatch.setattr(portal, "save_delivery_status", lambda delivery_id, status, _error, **_updates: {"id": delivery_id, "status": status, "batchId": "b1"})
    monkeypatch.setattr(portal, "update_batch_delivery_status", lambda _batch_id: None)
    with portal.app.test_request_context(
        "/api/email-delivery/webhook",
        method="POST",
        headers={"X-Delivery-Webhook-Secret": "correct-secret"},
        json={"events": [{"messageId": "message-1", "event": "delivered"}]},
    ):
        response = portal.payslip_delivery_webhook()
    assert response.get_json() == {"ok": True, "updated": 1}


def test_bulk_recipient_validation_scales_to_five_hundred(monkeypatch):
    staff = [
        {"id": f"s{index}", "employmentStatus": "active", "email": f"staff{index}@bawjiasecommunitybank.com"}
        for index in range(500)
    ]
    batch = {"entries": [
        {
            "staffRecordId": item["id"],
            "staffId": f"BCB-{index:04d}",
            "fullName": f"Test Staff {index}",
            "email": item["email"],
        }
        for index, item in enumerate(staff)
    ]}
    monkeypatch.setattr(portal, "load_json_list_store", lambda _path: staff)
    assert portal.validate_payslip_recipients(batch) == []


def test_worker_heartbeat_reports_healthy(tmp_path, monkeypatch):
    heartbeat_path = tmp_path / "worker_status.json"
    monkeypatch.setattr(portal, "WORKER_STATUS_STORE_PATH", str(heartbeat_path))
    portal.record_payslip_worker_heartbeat()
    status = portal.payslip_worker_status()
    assert status["healthy"] is True
    assert status["lastHeartbeat"] > 0


@pytest.mark.parametrize(
    ("guard", "allowed_roles"),
    [
        ("require_portal_controller", {"BossAdmin"}),
        ("require_staff_manager", {"SuperAdmin", "Admin"}),
        ("require_staff_records_manager", {"SuperAdmin", "Admin", "FinanceOfficer"}),
        ("require_payroll_viewer", {"SuperAdmin", "FinanceOfficer", "FinanceApprover"}),
        ("require_payroll_preparer", {"SuperAdmin", "FinanceOfficer"}),
        ("require_payroll_approver", {"SuperAdmin", "FinanceApprover"}),
        ("require_report_viewer", {"SuperAdmin", "FinanceApprover", "Auditor", "Management"}),
    ],
)
def test_complete_role_guard_matrix(monkeypatch, guard, allowed_roles):
    roles = {"BossAdmin", "SuperAdmin", "Admin", "FinanceOfficer", "FinanceApprover", "Auditor", "Management"}
    with portal.app.test_request_context("/api/role-matrix-test"):
        for role in roles:
            monkeypatch.setattr(portal, "require_authenticated_user", lambda current_role=role: ("token", {"role": current_role}, None))
            _, _, error = getattr(portal, guard)()
            assert (error is None) is (role in allowed_roles), f"{guard} returned the wrong decision for {role}"
