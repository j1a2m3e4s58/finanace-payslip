import readXlsxFile from 'read-excel-file/browser';

export const DEFAULT_STAFF_IMPORT_COLUMNS = [
  { key: 'fullName', label: 'Staff Name', aliases: ['Full Name', 'Name'], type: 'text', required: true, enabled: true, order: 0 },
  { key: 'staffId', label: 'Staff ID', aliases: ['Employee ID'], type: 'text', required: true, enabled: true, order: 1 },
  { key: 'department', label: 'Department', aliases: [], type: 'text', required: false, enabled: true, order: 2 },
  { key: 'position', label: 'Position', aliases: ['Job Title'], type: 'text', required: false, enabled: true, order: 3 },
  { key: 'branch', label: 'Branch', aliases: [], type: 'text', required: false, enabled: true, order: 4 },
  { key: 'phone', label: 'Phone Number', aliases: ['Phone'], type: 'phone', required: false, enabled: true, order: 5 },
  { key: 'email', label: 'Email Address', aliases: ['Email', 'Official Email'], type: 'email', required: true, enabled: true, order: 6 },
  { key: 'employmentStatus', label: 'Employment Status', aliases: ['Status'], type: 'enum', options: ['Active', 'Inactive'], required: true, enabled: true, order: 7 },
];

const protectedKeys = new Set(['fullName', 'staffId', 'email', 'employmentStatus']);
const coreKeys = new Set(DEFAULT_STAFF_IMPORT_COLUMNS.map((column) => column.key));
const clean = (value) => String(value ?? '').trim();
const normalizedHeader = (value) => clean(value).toLowerCase().replace(/[\s_-]+/g, ' ');
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeStaffImportSchema(value) {
  const schemaValue = value?.staffImportSchema || value;
  const incoming = Array.isArray(schemaValue) ? schemaValue : schemaValue?.columns;
  const version = Number(Array.isArray(schemaValue) ? 1 : schemaValue?.version) || 1;
  const maxFileSizeMb = Math.max(1, Number(schemaValue?.maxFileSizeMb) || 5);
  const maxRows = Math.max(1, Math.floor(Number(schemaValue?.maxRows) || 1000));
  const defaults = new Map(DEFAULT_STAFF_IMPORT_COLUMNS.map((column) => [column.key, column]));
  const columns = (Array.isArray(incoming) ? incoming : DEFAULT_STAFF_IMPORT_COLUMNS).map((item, index) => {
    const rawKey = clean(item?.key || item?.canonicalKey);
    const fallback = defaults.get(rawKey);
    const key = rawKey || `custom_${index + 1}`;
    return {
      key,
      label: clean(item?.label || fallback?.label || key) || key,
      aliases: Array.from(new Set(
        Array.isArray(item?.aliases) ? item.aliases.map(clean).filter(Boolean) : (fallback?.aliases || []),
      )),
      type: clean(item?.type || fallback?.type || 'text').toLowerCase(),
      options: Array.isArray(item?.options) ? item.options.map(clean).filter(Boolean) : (fallback?.options || []),
      required: Boolean(item?.required ?? fallback?.required),
      enabled: item?.enabled !== false,
      order: Number.isFinite(Number(item?.order)) ? Number(item.order) : index,
      custom: Boolean(item?.custom) || !coreKeys.has(key),
    };
  });

  // Older saved settings may omit a protected column. Put it back without
  // changing the saved labels of columns that are present.
  for (const fallback of DEFAULT_STAFF_IMPORT_COLUMNS.filter((column) => protectedKeys.has(column.key))) {
    if (!columns.some((column) => column.key === fallback.key)) columns.push({ ...fallback, custom: false });
  }
  return {
    version,
    maxFileSizeMb,
    maxRows,
    columns: columns
      .filter((column, index, all) => column.enabled && all.findIndex((item) => item.key === column.key) === index)
      .sort((left, right) => left.order - right.order),
  };
}

export async function parseStaffFile(file, schemaValue) {
  const schema = normalizeStaffImportSchema(schemaValue);
  const isCsv = file.name.toLowerCase().endsWith('.csv');
  const rawMatrix = isCsv ? parseCsv(await file.text()) : await readXlsxFile(file);
  const matrix = /** @type {Array<Array<unknown>>} */ (/** @type {unknown} */ (rawMatrix));
  const lookup = buildHeaderLookup(schema.columns);
  const headerIndex = findHeaderRow(matrix, lookup);
  if (headerIndex < 0) throw new Error('No configured staff column headings were found in the first 10 rows.');
  const headers = (matrix[headerIndex] || []).map((header) => clean(header));
  const mappings = headers.map((header) => lookup.get(normalizedHeader(header)));

  return matrix.slice(headerIndex + 1)
    .filter((values) => values.some((value) => clean(value)))
    .map((values, index) => {
      const result = { rowNumber: headerIndex + index + 2, customFields: {} };
      mappings.forEach((column, columnIndex) => {
        if (!column) return;
        const value = clean(values[columnIndex]);
        if (column.custom) result.customFields[column.key] = value;
        else result[column.key] = value;
      });
      result.employmentStatus = clean(result.employmentStatus || 'Active').toLowerCase();
      return result;
    });
}

function buildHeaderLookup(columns) {
  const lookup = new Map();
  columns.forEach((column) => {
    [column.label, column.key, ...(column.aliases || [])].forEach((header) => {
      const normalized = normalizedHeader(header);
      if (normalized && !lookup.has(normalized)) lookup.set(normalized, column);
    });
  });
  return lookup;
}

function findHeaderRow(matrix, lookup) {
  let bestIndex = -1;
  let bestScore = 0;
  matrix.slice(0, 10).forEach((row, index) => {
    const matchedKeys = new Set(row.map((value) => lookup.get(normalizedHeader(value))?.key).filter(Boolean));
    if (matchedKeys.size > bestScore) {
      bestScore = matchedKeys.size;
      bestIndex = index;
    }
  });
  return bestScore ? bestIndex : -1;
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

export function validateStaffRows(rows, existing = [], schemaValue, emailDomain = 'bawjiasecommunitybank.com') {
  const schema = normalizeStaffImportSchema(schemaValue);
  const existingEmails = new Set(existing.map((item) => clean(item.email).toLowerCase()));
  const existingIds = new Set(existing.map((item) => clean(item.staffId).toLowerCase()));
  const emailCounts = new Map();
  const idCounts = new Map();
  const domain = clean(emailDomain).toLowerCase().replace(/^@/, '');
  rows.forEach((row) => {
    const email = clean(row.email).toLowerCase();
    const id = clean(row.staffId).toLowerCase();
    if (email) emailCounts.set(email, (emailCounts.get(email) || 0) + 1);
    if (id) idCounts.set(id, (idCounts.get(id) || 0) + 1);
  });
  return rows.map((row) => {
    const issues = [];
    const issueFields = {};
    const addIssue = (key, message) => {
      issues.push(message);
      issueFields[key] = [...(issueFields[key] || []), message];
    };
    const email = clean(row.email).toLowerCase();
    const staffId = clean(row.staffId).toLowerCase();
    schema.columns.filter((column) => column.required).forEach((column) => {
      const value = column.custom ? row.customFields?.[column.key] : row[column.key];
      if (!clean(value)) addIssue(column.key, `Missing ${column.label.toLowerCase()}`);
    });
    if (email && (!emailPattern.test(email) || (domain && !email.endsWith(`@${domain}`)))) addIssue('email', `Invalid email${domain ? ` — use @${domain}` : ''}`);
    if (email && ((emailCounts.get(email) || 0) > 1 || existingEmails.has(email))) addIssue('email', 'Duplicate email');
    if (staffId && ((idCounts.get(staffId) || 0) > 1 || existingIds.has(staffId))) addIssue('staffId', 'Duplicate staff ID');
    if (row.employmentStatus && !['active', 'inactive'].includes(clean(row.employmentStatus).toLowerCase())) addIssue('employmentStatus', 'Invalid status');
    return {
      ...row,
      email,
      staffId: clean(row.staffId),
      fullName: clean(row.fullName),
      customFields: { ...(row.customFields || {}) },
      issues,
      issueFields,
      isValid: issues.length === 0,
    };
  });
}

export function buildStaffTemplateCsv(schemaValue, emailDomain = 'bawjiasecommunitybank.com') {
  const { columns } = normalizeStaffImportSchema(schemaValue);
  const domain = clean(emailDomain).replace(/^@/, '') || 'bawjiasecommunitybank.com';
  const escape = (value) => {
    const text = clean(value);
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const sample = columns.map((column) => {
    if (column.key === 'fullName') return 'Akosua Mensah';
    if (column.key === 'staffId') return 'BCB-0018';
    if (column.key === 'email') return `akosua.mensah@${domain}`;
    if (column.key === 'employmentStatus') return 'Active';
    if (column.key === 'phone') return '024 000 0000';
    if (column.key === 'department') return 'Finance';
    if (column.key === 'position') return 'Finance Officer';
    if (column.key === 'branch') return 'Head Office';
    return column.options?.[0] || '';
  });
  return `${columns.map((column) => escape(column.label)).join(',')}\r\n${sample.map(escape).join(',')}\r\n`;
}
