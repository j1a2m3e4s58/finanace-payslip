from __future__ import annotations

import html
import zipfile
from datetime import datetime, timezone
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


GREEN = colors.HexColor("#075B3B")
GOLD = colors.HexColor("#C99A2E")
LIGHT_GREEN = colors.HexColor("#EAF4EF")
LIGHT_GRAY = colors.HexColor("#F4F6F5")
TEXT = colors.HexColor("#26332E")


def _display(value) -> str:
    if value is None:
        return "-"
    if isinstance(value, float):
        return f"{value:,.2f}"
    if isinstance(value, (dict, list)):
        import json
        return json.dumps(value, ensure_ascii=True, sort_keys=True)
    return str(value)


def generate_report_pdf(title: str, columns: list[dict], rows: list[dict], filters: dict, bank_name: str) -> bytes:
    output = BytesIO()
    doc = SimpleDocTemplate(output, pagesize=landscape(A4), rightMargin=12 * mm, leftMargin=12 * mm, topMargin=12 * mm, bottomMargin=12 * mm, title=title, author=bank_name)
    styles = getSampleStyleSheet()
    heading = ParagraphStyle("ReportTitle", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=18, leading=22, textColor=GREEN, alignment=TA_CENTER, spaceAfter=4)
    subtitle = ParagraphStyle("ReportSubtitle", parent=styles["Normal"], fontSize=8.5, leading=11, textColor=colors.HexColor("#617069"), alignment=TA_CENTER)
    cell = ParagraphStyle("ReportCell", parent=styles["Normal"], fontSize=6.8, leading=8.5, textColor=TEXT)
    header = ParagraphStyle("ReportHeader", parent=cell, fontName="Helvetica-Bold", textColor=colors.white, alignment=TA_CENTER)
    story = [Paragraph(html.escape(bank_name), subtitle), Paragraph(html.escape(title), heading)]
    active_filters = ", ".join(f"{key.title()}: {_display(value)}" for key, value in filters.items() if value)
    story.extend([Paragraph(f"Generated {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')} | {len(rows)} record(s){' | ' + html.escape(active_filters) if active_filters else ''}", subtitle), Spacer(1, 7 * mm)])
    if not rows:
        story.append(Paragraph("No records matched the selected filters.", styles["Normal"]))
    else:
        max_columns = 9
        chunks = [columns[index:index + max_columns] for index in range(0, len(columns), max_columns)]
        for chunk_index, chunk in enumerate(chunks):
            data = [[Paragraph(html.escape(str(column["label"])), header) for column in chunk]]
            for row in rows:
                data.append([Paragraph(html.escape(_display(row.get(column["key"]))).replace("\n", "<br/>"), cell) for column in chunk])
            available_width = landscape(A4)[0] - 24 * mm
            widths = [available_width / len(chunk)] * len(chunk)
            # Audit evidence can contain large before/after JSON values.  A normal
            # Platypus table only splits between rows, so one large audit event can
            # be taller than a page and raise LayoutError.  Allow ReportLab to
            # split inside an oversized row while still repeating the header.
            table = Table(
                data,
                colWidths=widths,
                repeatRows=1,
                hAlign="LEFT",
                splitByRow=1,
                splitInRow=1,
            )
            table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), GREEN), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("LINEBELOW", (0, 0), (-1, 0), 1.5, GOLD), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT_GRAY]),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#CED8D3")),
            ]))
            story.append(table)
            if chunk_index < len(chunks) - 1:
                story.append(PageBreak())
    doc.build(story, onFirstPage=_pdf_footer, onLaterPages=_pdf_footer)
    return output.getvalue()


def _pdf_footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(GOLD)
    canvas.line(12 * mm, 9 * mm, landscape(A4)[0] - 12 * mm, 9 * mm)
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(colors.HexColor("#617069"))
    canvas.drawString(12 * mm, 5.5 * mm, "Confidential finance report")
    canvas.drawRightString(landscape(A4)[0] - 12 * mm, 5.5 * mm, f"Page {doc.page}")
    canvas.restoreState()


def generate_report_xlsx(title: str, columns: list[dict], rows: list[dict], filters: dict, bank_name: str) -> bytes:
    sheet_rows = [[bank_name], [title], [f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}"]]
    active_filters = ", ".join(f"{key.title()}: {_display(value)}" for key, value in filters.items() if value)
    sheet_rows.append([f"Filters: {active_filters or 'All records'}"])
    sheet_rows.append([])
    sheet_rows.append([column["label"] for column in columns])
    for row in rows:
        sheet_rows.append([row.get(column["key"]) for column in columns])
    output = BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", _content_types())
        archive.writestr("_rels/.rels", _root_rels())
        archive.writestr("docProps/app.xml", _app_props())
        archive.writestr("docProps/core.xml", _core_props(title))
        archive.writestr("xl/workbook.xml", _workbook())
        archive.writestr("xl/_rels/workbook.xml.rels", _workbook_rels())
        archive.writestr("xl/styles.xml", _styles())
        archive.writestr("xl/worksheets/sheet1.xml", _sheet_xml(sheet_rows, len(columns)))
    return output.getvalue()


def _xml(value) -> str:
    return html.escape(str(value), quote=True)


def _column_name(index: int) -> str:
    result = ""
    while index:
        index, remainder = divmod(index - 1, 26)
        result = chr(65 + remainder) + result
    return result


def _sheet_xml(rows: list[list], column_count: int) -> str:
    xml_rows = []
    for row_index, row in enumerate(rows, 1):
        cells = []
        for column_index, value in enumerate(row, 1):
            if value is None:
                continue
            ref = f"{_column_name(column_index)}{row_index}"
            is_currency = row_index > 6 and column_index <= len(rows[5]) and "GHS" in str(rows[5][column_index - 1])
            style = 1 if row_index == 6 else 2 if row_index <= 2 else 3 if is_currency and isinstance(value, (int, float)) else 0
            if isinstance(value, (int, float)) and not isinstance(value, bool):
                cells.append(f'<c r="{ref}" s="{style}"><v>{value}</v></c>')
            else:
                cells.append(f'<c r="{ref}" s="{style}" t="inlineStr"><is><t xml:space="preserve">{_xml(_display(value))}</t></is></c>')
        height = ' ht="24" customHeight="1"' if row_index in {1, 2, 6} else ""
        xml_rows.append(f'<row r="{row_index}"{height}>{"".join(cells)}</row>')
    widths = []
    for index in range(1, max(column_count, 1) + 1):
        values = [str(_display(row[index - 1])) for row in rows[5:] if len(row) >= index]
        width = min(30, max(11, max((len(value) for value in values), default=10) + 2))
        widths.append(f'<col min="{index}" max="{index}" width="{width}" customWidth="1"/>')
    last_col = _column_name(max(column_count, 1))
    return f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="6" topLeftCell="A7" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>{''.join(widths)}</cols><sheetData>{''.join(xml_rows)}</sheetData><mergeCells count="4"><mergeCell ref="A1:{last_col}1"/><mergeCell ref="A2:{last_col}2"/><mergeCell ref="A3:{last_col}3"/><mergeCell ref="A4:{last_col}4"/></mergeCells><autoFilter ref="A6:{last_col}{max(len(rows), 6)}"/><pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/></worksheet>'''


def _content_types():
    return '''<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>'''


def _root_rels():
    return '''<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>'''


def _workbook():
    return '''<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Report" sheetId="1" r:id="rId1"/></sheets></workbook>'''


def _workbook_rels():
    return '''<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'''


def _styles():
    return '''<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;GHS&quot; #,##0.00;[Red](&quot;GHS&quot; #,##0.00);-"/></numFmts><fonts count="3"><font><sz val="10"/><name val="Aptos"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="10"/><name val="Aptos"/></font><font><b/><color rgb="FF075B3B"/><sz val="16"/><name val="Aptos Display"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF075B3B"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border/><border><bottom style="thin"><color rgb="FFC99A2E"/></bottom></border></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="4"><xf fontId="0" fillId="0" borderId="0" xfId="0"/><xf fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1"/></xf><xf fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>'''


def _app_props():
    return '''<?xml version="1.0" encoding="UTF-8"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Bawjiase Finance Payslip Platform</Application></Properties>'''


def _core_props(title: str):
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return f'''<?xml version="1.0" encoding="UTF-8"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>{_xml(title)}</dc:title><dc:creator>Bawjiase Community Bank PLC</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">{now}</dcterms:created></cp:coreProperties>'''
