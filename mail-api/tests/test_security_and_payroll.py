import time
from io import BytesIO

import pytest
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
