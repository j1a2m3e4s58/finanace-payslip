const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

export function exportHtmlPdf({ title, subtitle, summary = [], columns, rows, filename = 'payroll-report' }) {
  const printWindow = window.open('', '_blank', 'width=1100,height=800');
  if (!printWindow) {
    window.alert('Please allow popups for this site so the PDF print window can open.');
    return;
  }

  const summaryHtml = summary.length
    ? `<section class="summary">${summary.map((item) => `
        <div>
          <span>${escapeHtml(item.label)}</span>
          <strong>${escapeHtml(item.value)}</strong>
        </div>
      `).join('')}</section>`
    : '';

  const html = `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(filename)}</title>
      <style>
        @page { margin: 18mm 14mm; }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          color: #172033;
          font-family: Arial, Helvetica, sans-serif;
          background: #ffffff;
        }
        .page {
          width: 100%;
        }
        .brand {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 24px;
          padding-bottom: 18px;
          border-bottom: 3px solid #1e40af;
        }
        .eyebrow {
          margin: 0 0 6px;
          color: #1e40af;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.16em;
          text-transform: uppercase;
        }
        h1 {
          margin: 0;
          font-size: 28px;
          line-height: 1.15;
        }
        .subtitle {
          margin: 8px 0 0;
          color: #526070;
          font-size: 13px;
          max-width: 680px;
        }
        .stamp {
          min-width: 180px;
          border: 1px solid #bfdbfe;
          background: #eff6ff;
          padding: 12px;
          text-align: right;
          font-size: 12px;
          color: #334155;
        }
        .stamp strong {
          display: block;
          color: #0f172a;
          font-size: 14px;
          margin-top: 4px;
        }
        .summary {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
          margin: 20px 0;
        }
        .summary div {
          border: 1px solid #dbeafe;
          background: #f8fbff;
          padding: 12px;
          min-height: 64px;
        }
        .summary span {
          display: block;
          color: #64748b;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .summary strong {
          display: block;
          margin-top: 7px;
          color: #0f172a;
          font-size: 18px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 11px;
        }
        thead {
          display: table-header-group;
        }
        th {
          background: #1e40af;
          color: white;
          padding: 9px 8px;
          text-align: left;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          font-size: 10px;
        }
        td {
          border-bottom: 1px solid #e2e8f0;
          padding: 8px;
          vertical-align: top;
        }
        tr:nth-child(even) td {
          background: #f8fafc;
        }
        .footer {
          margin-top: 28px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
          font-size: 12px;
          color: #475569;
        }
        .line {
          padding-top: 34px;
          border-bottom: 1px solid #94a3b8;
        }
        @media print {
          .page { break-inside: avoid; }
        }
      </style>
    </head>
    <body>
      <main class="page">
        <header class="brand">
          <div>
            <p class="eyebrow">BCB Finance Payslip Platform</p>
            <h1>${escapeHtml(title)}</h1>
            <p class="subtitle">${escapeHtml(subtitle)}</p>
          </div>
          <div class="stamp">
            Generated
            <strong>${escapeHtml(new Date().toLocaleString())}</strong>
          </div>
        </header>
        ${summaryHtml}
        <table>
          <thead>
            <tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
        <section class="footer">
          <div><div class="line"></div>Prepared By</div>
          <div><div class="line"></div>Reviewed / Approved By</div>
        </section>
      </main>
      <script>
        window.onload = () => {
          window.focus();
          window.print();
        };
      </script>
    </body>
  </html>`;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}
