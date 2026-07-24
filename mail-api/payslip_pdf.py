from __future__ import annotations

from io import BytesIO
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from PIL import Image
from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas


GREEN = HexColor("#065F46")
GREEN_DARK = HexColor("#064E3B")
GREEN_LIGHT = HexColor("#ECFDF5")
GOLD = HexColor("#D4A72C")
GOLD_LIGHT = HexColor("#FEF3C7")
INK = HexColor("#1F2937")
MUTED = HexColor("#6B7280")
LINE = HexColor("#D1D5DB")
PALE = HexColor("#F8FAFC")
RED_PALE = HexColor("#FEF2F2")


INCOME_ROWS = [
    ("Basic Salary", "basicSalary"),
    ("Supervision Allowance", "supervisionAllowance"),
    ("Risk Allowance", "riskAllowance"),
    ("Responsibility Allowance", "responsibilityAllowance"),
    ("Entertainment Allowance", "entertainmentAllowance"),
    ("Fuel / Transport Allowance", "fuelTransportAllowance"),
    ("Rent / Utility Allowance", "rentUtilityAllowance"),
]

DEDUCTION_ROWS = [
    ("5.5% SSF", "ssf"),
    ("4.5% ESP", "esp"),
    ("4.5% PF", "pf"),
    ("P.A.Y.E Income Tax", "payeIncomeTax"),
    ("Staff Welfare", "staffWelfare"),
    ("ICU Dues", "icuDues"),
]


def money(value: object) -> str:
    try:
        return f"GHS {float(value or 0):,.2f}"
    except (TypeError, ValueError):
        return "GHS 0.00"


def period_label(period: str) -> str:
    try:
        year, month = str(period).split("-", 1)
        names = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
        return f"{names[int(month) - 1]} {year}"
    except (ValueError, IndexError):
        return str(period or "Payroll Period")


def draw_rounded_box(pdf: canvas.Canvas, x: float, y: float, width: float, height: float, fill, stroke=LINE, radius: float = 8) -> None:
    pdf.setFillColor(fill)
    pdf.setStrokeColor(stroke)
    pdf.roundRect(x, y, width, height, radius, stroke=1, fill=1)


def fit_text(pdf: canvas.Canvas, text: str, x: float, y: float, max_width: float, font: str = "Helvetica-Bold", size: float = 12) -> None:
    current = size
    while current > 7 and stringWidth(text, font, current) > max_width:
        current -= 0.5
    pdf.setFont(font, current)
    pdf.drawString(x, y, text)


def draw_section(pdf: canvas.Canvas, x: float, top: float, width: float, title: str, rows: list[tuple[str, str]], entry: dict, total_label: str, total_key: str, tint) -> float:
    row_height = 20
    header_height = 28
    total_height = 27
    height = header_height + len(rows) * row_height + total_height
    bottom = top - height
    draw_rounded_box(pdf, x, bottom, width, height, white, LINE, 8)
    pdf.setFillColor(tint)
    pdf.roundRect(x, top - header_height, width, header_height, 8, stroke=0, fill=1)
    pdf.rect(x, top - header_height, width, 8, stroke=0, fill=1)
    pdf.setFillColor(GREEN_DARK)
    pdf.setFont("Helvetica-Bold", 10)
    pdf.drawString(x + 12, top - 18, title.upper())
    pdf.setFillColor(MUTED)
    pdf.setFont("Helvetica-Bold", 7.5)
    pdf.drawRightString(x + width - 12, top - 18, "AMOUNT (GHS)")
    y = top - header_height
    for index, (label, key) in enumerate(rows):
        y -= row_height
        if index % 2:
            pdf.setFillColor(PALE)
            pdf.rect(x + 1, y, width - 2, row_height, stroke=0, fill=1)
        pdf.setStrokeColor(HexColor("#E5E7EB"))
        pdf.line(x + 10, y, x + width - 10, y)
        pdf.setFillColor(INK)
        pdf.setFont("Helvetica", 8.5)
        pdf.drawString(x + 12, y + 6.5, label)
        pdf.setFont("Helvetica-Bold", 8.5)
        pdf.drawRightString(x + width - 12, y + 6.5, money(entry.get(key)).replace("GHS ", ""))
    pdf.setFillColor(GREEN_DARK)
    pdf.rect(x, bottom, width, total_height, stroke=0, fill=1)
    pdf.setFillColor(white)
    pdf.setFont("Helvetica-Bold", 9)
    pdf.drawString(x + 12, bottom + 9, total_label.upper())
    pdf.drawRightString(x + width - 12, bottom + 9, money(entry.get(total_key)))
    return bottom


def generate_payslip_pdf(batch: dict, entry: dict, bank_name: str, logo_path: str | Path | None = None, settings: dict | None = None) -> bytes:
    settings = settings or {}
    allowance_labels = settings.get("allowanceLabels") if isinstance(settings.get("allowanceLabels"), dict) else {}
    deduction_labels = settings.get("deductionLabels") if isinstance(settings.get("deductionLabels"), dict) else {}
    employer_labels = settings.get("employerContributionLabels") if isinstance(settings.get("employerContributionLabels"), dict) else {}
    income_rows = [(label if key == "basicSalary" else allowance_labels.get(key, label), key) for label, key in INCOME_ROWS]
    deduction_rows = [(deduction_labels.get(key, label), key) for label, key in DEDUCTION_ROWS]
    payslip_title = str(settings.get("payslipTitle") or "Staff Payslip")
    buffer = BytesIO()
    width, height = A4
    pdf = canvas.Canvas(buffer, pagesize=A4, pageCompression=1)
    pdf.setTitle(f"{entry.get('fullName', 'Staff')} - {period_label(batch.get('period', ''))} Payslip")
    pdf.setAuthor(bank_name)
    pdf.setSubject(str(settings.get("confidentialityNote") or "Confidential staff payslip"))
    margin = 34
    content_width = width - margin * 2

    pdf.setFillColor(GREEN_DARK)
    pdf.rect(0, height - 122, width, 122, stroke=0, fill=1)
    pdf.setFillColor(GOLD)
    pdf.rect(0, height - 126, width, 4, stroke=0, fill=1)

    logo_size = 68
    logo_x = margin
    logo_y = height - 104
    if logo_path and Path(logo_path).is_file():
        pdf.setFillColor(white)
        pdf.circle(logo_x + logo_size / 2, logo_y + logo_size / 2, logo_size / 2 + 3, stroke=0, fill=1)
        logo_buffer = BytesIO()
        with Image.open(logo_path) as logo_image:
            logo_image.thumbnail((256, 256), Image.Resampling.LANCZOS)
            logo_image.save(logo_buffer, format="PNG", optimize=True)
        logo_buffer.seek(0)
        pdf.drawImage(ImageReader(logo_buffer), logo_x, logo_y, logo_size, logo_size, preserveAspectRatio=True, mask="auto")

    text_x = margin + 84
    pdf.setFillColor(white)
    fit_text(pdf, bank_name.upper(), text_x, height - 59, 310, "Helvetica-Bold", 15)
    pdf.setFont("Helvetica", 8.5)
    pdf.setFillColor(HexColor("#D1FAE5"))
    pdf.drawString(text_x, height - 76, str(settings.get("bankAddress") or "FINANCE AND PAYROLL SERVICES")[:70])
    pdf.setFont("Helvetica-Bold", 12)
    pdf.setFillColor(GOLD_LIGHT)
    pdf.drawString(text_x, height - 96, payslip_title.upper())

    badge_width = 100
    badge_x = width - margin - badge_width
    draw_rounded_box(pdf, badge_x, height - 101, badge_width, 55, HexColor("#FFFFFF"), HexColor("#FFFFFF"), 7)
    pdf.setFillColor(MUTED)
    pdf.setFont("Helvetica-Bold", 7)
    pdf.drawCentredString(badge_x + badge_width / 2, height - 62, "PAY PERIOD")
    pdf.setFillColor(GREEN_DARK)
    pdf.setFont("Helvetica-Bold", 10)
    pdf.drawCentredString(badge_x + badge_width / 2, height - 80, period_label(batch.get("period", "")))
    pdf.setFillColor(GOLD)
    pdf.setFont("Helvetica-Bold", 7)
    pdf.drawCentredString(badge_x + badge_width / 2, height - 94, f"VERSION {int(batch.get('version', 1) or 1)}")

    info_top = height - 150
    info_height = 82
    draw_rounded_box(pdf, margin, info_top - info_height, content_width, info_height, PALE, LINE, 9)
    info = [
        ("STAFF NAME", str(entry.get("fullName", ""))),
        ("STAFF ID", str(entry.get("staffId", ""))),
        ("DEPARTMENT", str(entry.get("department", ""))),
        ("BRANCH", str(entry.get("branch", ""))),
    ]
    col_width = content_width / 2
    for index, (label, value) in enumerate(info):
        col = index % 2
        row = index // 2
        x = margin + 16 + col * col_width
        y = info_top - 22 - row * 36
        pdf.setFillColor(MUTED)
        pdf.setFont("Helvetica-Bold", 7)
        pdf.drawString(x, y, label)
        pdf.setFillColor(INK)
        fit_text(pdf, value or "-", x, y - 13, col_width - 32, "Helvetica-Bold", 10)

    section_top = info_top - info_height - 18
    gap = 12
    section_width = (content_width - gap) / 2
    income_bottom = draw_section(pdf, margin, section_top, section_width, "Income", income_rows, entry, "Total Income", "totalIncome", GREEN_LIGHT)
    deduction_bottom = draw_section(pdf, margin + section_width + gap, section_top, section_width, "Deductions", deduction_rows, entry, "Total Deductions", "totalDeductions", RED_PALE)
    sections_bottom = min(income_bottom, deduction_bottom)

    net_y = sections_bottom - 56
    draw_rounded_box(pdf, margin, net_y, content_width, 43, GREEN_DARK, GREEN_DARK, 8)
    pdf.setFillColor(HexColor("#D1FAE5"))
    pdf.setFont("Helvetica-Bold", 9)
    pdf.drawString(margin + 16, net_y + 16, "NET SALARY")
    pdf.setFillColor(GOLD_LIGHT)
    pdf.setFont("Helvetica-Bold", 16)
    pdf.drawRightString(width - margin - 16, net_y + 13, money(entry.get("netSalary")))

    employer_y = net_y - 58
    box_width = (content_width - gap) / 2
    for index, (label, key) in enumerate(((employer_labels.get("employerSsf", "Employer SSF"), "employerSsf"), (employer_labels.get("employerPf", "Employer PF"), "employerPf"))):
        x = margin + index * (box_width + gap)
        draw_rounded_box(pdf, x, employer_y, box_width, 42, GOLD_LIGHT, HexColor("#F3D98B"), 7)
        pdf.setFillColor(MUTED)
        pdf.setFont("Helvetica-Bold", 7.5)
        pdf.drawString(x + 12, employer_y + 26, label.upper())
        pdf.setFillColor(INK)
        pdf.setFont("Helvetica-Bold", 10)
        pdf.drawRightString(x + box_width - 12, employer_y + 13, money(entry.get(key)))

    signature_y = employer_y - 63
    pdf.setStrokeColor(MUTED)
    pdf.setLineWidth(0.7)
    pdf.line(width - margin - 190, signature_y + 27, width - margin, signature_y + 27)
    signature_path = settings.get("_signaturePath")
    if signature_path and Path(signature_path).is_file():
        pdf.drawImage(str(signature_path), width - margin - 150, signature_y + 29, 110, 32, preserveAspectRatio=True, mask="auto")
    pdf.setFillColor(INK)
    pdf.setFont("Helvetica-Bold", 8)
    pdf.drawCentredString(width - margin - 95, signature_y + 14, "AUTHORIZED FINANCE SIGNATURE")
    pdf.setFillColor(MUTED)
    pdf.setFont("Helvetica", 7)
    pdf.drawCentredString(width - margin - 95, signature_y + 3, "Finance Approver")

    pdf.setStrokeColor(LINE)
    pdf.line(margin, 45, width - margin, 45)
    pdf.setFillColor(GREEN_DARK)
    pdf.setFont("Helvetica-Bold", 7)
    pdf.drawCentredString(width / 2, 31, str(settings.get("confidentialityNote") or "CONFIDENTIAL - FOR THE NAMED STAFF MEMBER ONLY")[:110])
    pdf.setFillColor(MUTED)
    pdf.setFont("Helvetica", 6.5)
    pdf.drawCentredString(width / 2, 20, str(settings.get("emailFooter") or "System-generated from the approved payroll database. No spreadsheet references are used.")[:120])
    pdf.save()
    return buffer.getvalue()


def protect_pdf(pdf_bytes: bytes, password: str | None) -> bytes:
    if not password:
        return pdf_bytes
    reader = PdfReader(BytesIO(pdf_bytes))
    writer = PdfWriter()
    for page in reader.pages:
        writer.add_page(page)
    writer.add_metadata(reader.metadata or {})
    writer.encrypt(user_password=password, owner_password=f"owner-{password}-bcb", algorithm="AES-256")
    output = BytesIO()
    writer.write(output)
    return output.getvalue()
