import readXlsxFile from 'read-excel-file/browser';

const aliases = {
  'staff name': 'fullName', 'full name': 'fullName', name: 'fullName',
  'staff id': 'staffId', 'employee id': 'staffId',
  department: 'department', position: 'position', 'job title': 'position',
  branch: 'branch', 'phone number': 'phone', phone: 'phone',
  'email address': 'email', email: 'email', 'official email': 'email',
  'employment status': 'employmentStatus', status: 'employmentStatus',
};

const clean = (value) => String(value ?? '').trim();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function parseStaffFile(file) {
  const isCsv = file.name.toLowerCase().endsWith('.csv');
  const rawMatrix = isCsv ? parseCsv(await file.text()) : await readXlsxFile(file);
  const matrix = /** @type {Array<Array<unknown>>} */ (/** @type {unknown} */ (rawMatrix));
  const headers = (matrix[0] || []).map((header) => clean(header));
  return matrix.slice(1).filter((values) => values.some((value) => clean(value))).map((values, index) => {
    const result = { rowNumber: index + 2 };
    headers.forEach((header, columnIndex) => {
      const value = values[columnIndex];
      const key = aliases[clean(header).toLowerCase()];
      if (key) result[key] = clean(value);
    });
    result.employmentStatus = clean(result.employmentStatus || 'Active').toLowerCase();
    return result;
  });
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"' && quoted && text[index + 1] === '"') { value += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(value); value = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(value); rows.push(row); row = []; value = '';
    } else value += char;
  }
  if (value || row.length) { row.push(value); rows.push(row); }
  return rows;
}

export function validateStaffRows(rows, existing = []) {
  const existingEmails = new Set(existing.map((item) => clean(item.email).toLowerCase()));
  const existingIds = new Set(existing.map((item) => clean(item.staffId).toLowerCase()));
  const emailCounts = new Map();
  const idCounts = new Map();
  rows.forEach((row) => {
    const email = clean(row.email).toLowerCase();
    const id = clean(row.staffId).toLowerCase();
    if (email) emailCounts.set(email, (emailCounts.get(email) || 0) + 1);
    if (id) idCounts.set(id, (idCounts.get(id) || 0) + 1);
  });
  return rows.map((row) => {
    const issues = [];
    const email = clean(row.email).toLowerCase();
    const staffId = clean(row.staffId).toLowerCase();
    if (!clean(row.fullName)) issues.push('Missing name');
    if (!email) issues.push('Missing email');
    else if (!emailPattern.test(email) || !email.endsWith('@bawjiasecommunitybank.com')) issues.push('Invalid email');
    if (!staffId) issues.push('Missing staff ID');
    if (email && ((emailCounts.get(email) || 0) > 1 || existingEmails.has(email))) issues.push('Duplicate email');
    if (staffId && ((idCounts.get(staffId) || 0) > 1 || existingIds.has(staffId))) issues.push('Duplicate staff ID');
    if (!['active', 'inactive'].includes(clean(row.employmentStatus).toLowerCase())) issues.push('Invalid status');
    return { ...row, email, staffId: clean(row.staffId), fullName: clean(row.fullName), issues, isValid: issues.length === 0 };
  });
}
