from io import BytesIO

from pypdf import PdfReader

from report_exports import generate_report_pdf


def test_pdf_export_splits_large_audit_event_across_pages():
    columns = [
        {"key": "dateTime", "label": "Date and Time"},
        {"key": "actorName", "label": "User"},
        {"key": "action", "label": "Action"},
        {"key": "oldValue", "label": "Old Value"},
        {"key": "newValue", "label": "New Value"},
        {"key": "target", "label": "Record / Details"},
        {"key": "ipAddress", "label": "IP Address"},
    ]
    large_details = {
        f"field_{index}": f"confidential audit value {index} " * 5
        for index in range(120)
    }
    rows = [{
        "dateTime": "2026-07-23 10:30:00",
        "actorName": "Boss Admin",
        "action": "UPDATE_SETTINGS",
        "oldValue": large_details,
        "newValue": large_details,
        "target": large_details,
        "ipAddress": "127.0.0.1",
    }]

    content = generate_report_pdf(
        "Audit Trail Report",
        columns,
        rows,
        {},
        "Bawjiase Community Bank PLC",
    )

    assert content.startswith(b"%PDF")
    assert len(PdfReader(BytesIO(content)).pages) > 1
