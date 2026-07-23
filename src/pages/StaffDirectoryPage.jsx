import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  BriefcaseBusiness,
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Edit3,
  Eye,
  History,
  MailWarning,
  RefreshCcw,
  Upload,
  UserPlus,
  UserX,
} from "lucide-react";
import {
  changeStaffRecordStatus,
  getPortalSettings,
  getStaffDirectory,
  getStaffRecordAuditLogs,
  updateStaffRecord,
} from "@/api/portalClient";
import {
  PageHeader,
  PrimaryButton,
  SearchBox,
  SecondaryButton,
  StatusBadge,
} from "@/components/payroll/PageElements";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "@/components/ui/use-toast";
import ConfirmActionDialog from "@/components/ui/confirm-action-dialog";
import ResponsiveSheet from "@/components/ui/responsive-sheet";

const Card = ({ children, className = "" }) => (
  <section
    className={`rounded-xl border border-border bg-card p-4 sm:p-5 ${className}`}
  >
    {children}
  </section>
);
const inputClass =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/25";
const pageSizes = [10, 25, 50];
const columnOptions = [
  ["staffId", "Staff ID"],
  ["email", "Email"],
  ["department", "Department / Position"],
  ["branch", "Branch"],
  ["phone", "Phone"],
  ["status", "Status"],
];
const emptyForm = {
  fullName: "",
  staffId: "",
  department: "",
  position: "",
  branch: "",
  phone: "",
  email: "",
  employmentStatus: "active",
  reason: "",
};

export default function StaffDirectoryPage() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const initialStatus = ["active", "inactive"].includes(params.get("status"))
    ? params.get("status")
    : "all";
  const [records, setRecords] = useState([]);
  const [logs, setLogs] = useState([]);
  const [query, setQuery] = useState(() => params.get("search") || "");
  const [status, setStatus] = useState(initialStatus);
  const [department, setDepartment] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [visibleColumns, setVisibleColumns] = useState(
    Object.fromEntries(columnOptions.map(([key]) => [key, true])),
  );
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [organization, setOrganization] = useState({
    branches: [],
    departments: [],
    staffImportColumns: [],
    emailDomain: "@bawjiasecommunitybank.com",
  });
  const [statusAction, setStatusAction] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [staffRows, auditRows, settings] = await Promise.all([
        getStaffDirectory(),
        can("staff.manage") ? getStaffRecordAuditLogs() : Promise.resolve([]),
        getPortalSettings(),
      ]);
      setRecords(staffRows);
      setLogs(auditRows);
      setOrganization({
        branches: settings.branches || [],
        departments: settings.departments || [],
        staffImportColumns: (settings.staffImportSchema?.columns || []).filter((column) => column.custom && column.enabled !== false),
        emailDomain: settings.emailDomain || "@bawjiasecommunitybank.com",
      });
      setSelected((current) =>
        current
          ? staffRows.find((item) => item.id === current.id) || null
          : null,
      );
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    setQuery(params.get("search") || "");
  }, [params]);

  const departments = [
    ...new Set(records.map((item) => item.department).filter(Boolean)),
  ].sort();
  const filteredRows = useMemo(
    () =>
      records.filter((item) => {
        const matchesSearch = Object.values(item)
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase());
        return (
          matchesSearch &&
          (status === "all" || item.employmentStatus === status) &&
          (department === "all" || item.department === department)
        );
      }),
    [records, query, status, department],
  );
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageStart = (safePage - 1) * pageSize;
  const rows = filteredRows.slice(pageStart, pageStart + pageSize);
  useEffect(() => {
    setPage(1);
  }, [query, status, department, pageSize]);
  useEffect(() => {
    setPage((current) => Math.min(current, pageCount));
  }, [pageCount]);

  const departmentCounts = useMemo(
    () => countBy(records, "department"),
    [records],
  );
  const branchCounts = useMemo(() => countBy(records, "branch"), [records]);
  const emailWarningCount = records.filter((person) =>
    getEmailIssue(person, organization.emailDomain),
  ).length;
  const changeStatusFilter = (value) => {
    setStatus(value);
    const next = new URLSearchParams(params);
    if (value === "all") next.delete("status");
    else next.set("status", value);
    setParams(next, { replace: true });
  };
  const openDetails = (record) => {
    setSelected(record);
    setEditing(false);
    setForm({ ...record, reason: "" });
    setError("");
  };
  const beginEdit = (record = selected) => {
    if (!record) return;
    setSelected(record);
    setEditing(true);
    setForm({ ...record, reason: "" });
    setError("");
  };
  const closeDrawer = () => {
    setSelected(null);
    setEditing(false);
  };
  const saveEdit = async (event) => {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    try {
      await updateStaffRecord(selected.id, form);
      toast.success(
        "The staff record was updated and added to the audit trail.",
        { title: "Staff record saved" },
      );
      setEditing(false);
      await load();
    } catch (err) {
      toast.error(err.message, { title: "Staff record was not saved" });
    } finally {
      setSaving(false);
    }
  };
  const toggleStatus = (record) =>
    setStatusAction({
      record,
      next: record.employmentStatus === "active" ? "inactive" : "active",
      reason: "",
    });
  const confirmStatusChange = async () => {
    if (!statusAction?.reason.trim()) return;
    const { record, next, reason } = statusAction;
    try {
      await changeStaffRecordStatus(record.id, next, reason);
      setStatusAction(null);
      toast.warning(`${record.fullName} is now ${next}.`, {
        title: "Employment status changed",
      });
      await load();
    } catch (err) {
      toast.error(err.message, { title: "Status change failed" });
    }
  };
  const actions = can("staff.manage") ? (
    <>
      <Link to="/staff/upload-emails">
        <SecondaryButton>
          <Upload className="h-4 w-4" /> Upload emails
        </SecondaryButton>
      </Link>
      <Link to="/staff/new">
        <PrimaryButton>
          <UserPlus className="h-4 w-4" /> Add staff
        </PrimaryButton>
      </Link>
    </>
  ) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff Directory"
        description="Search and maintain payroll email records across the bank. Former staff remain available as inactive history."
        actions={actions}
      />
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <CountSummary
          title="Staff by department"
          icon={BriefcaseBusiness}
          values={departmentCounts}
          empty="No departments recorded"
        />
        <CountSummary
          title="Staff by branch"
          icon={Building2}
          values={branchCounts}
          empty="No branches recorded"
        />
      </div>
      {emailWarningCount > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/35 bg-amber-500/[.06] p-4">
          <MailWarning className="mt-0.5 h-5 w-5 text-amber-600" />
          <div>
            <p className="font-semibold">
              {emailWarningCount} staff email record
              {emailWarningCount === 1 ? "" : "s"} need attention
            </p>
            <p className="text-xs text-muted-foreground">
              Missing or non-official addresses are marked in the directory and
              cannot receive payslips.
            </p>
          </div>
        </div>
      )}

      <Card>
        <div className="mb-4 grid gap-3 lg:grid-cols-[1fr,180px,220px,auto,auto]">
          <SearchBox
            value={query}
            onChange={setQuery}
            placeholder="Search name, ID, email or branch"
          />
          <select
            aria-label="Filter staff by employment status"
            className={inputClass}
            value={status}
            onChange={(event) => changeStatusFilter(event.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <select
            aria-label="Filter staff by department"
            className={inputClass}
            value={department}
            onChange={(event) => setDepartment(event.target.value)}
          >
            <option value="all">All departments</option>
            {departments.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <p className="self-center text-sm text-muted-foreground">
            {filteredRows.length} records
          </p>
          <ColumnChooser
            columns={visibleColumns}
            setColumns={setVisibleColumns}
          />
        </div>
        <div className="grid gap-3 md:hidden">
          {rows.map((person) => (
            <StaffCard
              key={person.id}
              person={person}
              emailDomain={organization.emailDomain}
              openDetails={openDetails}
            />
          ))}
          {!loading && !rows.length && <EmptyDirectory />}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted-foreground">
              <tr>
                <th className="pb-3">Staff member</th>
                {visibleColumns.staffId && <th className="pb-3">Staff ID</th>}
                {visibleColumns.email && <th className="pb-3">Email</th>}
                {visibleColumns.department && (
                  <th className="pb-3">Department / Position</th>
                )}
                {visibleColumns.branch && <th className="pb-3">Branch</th>}
                {visibleColumns.phone && <th className="pb-3">Phone</th>}
                {visibleColumns.status && <th className="pb-3">Status</th>}
                <th className="pb-3 text-right">Details</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((person) => {
                const emailIssue = getEmailIssue(person, organization.emailDomain);
                return (
                  <tr
                    key={person.id}
                    className="border-b border-border/60 last:border-0"
                  >
                    <td className="py-3">
                      <p className="font-semibold">{person.fullName}</p>
                      {emailIssue && (
                        <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400">
                          <MailWarning className="h-3 w-3" />
                          {emailIssue}
                        </span>
                      )}
                    </td>
                    {visibleColumns.staffId && (
                      <td className="font-mono text-xs">{person.staffId}</td>
                    )}
                    {visibleColumns.email && (
                      <td
                        className={
                          emailIssue
                            ? "text-amber-700 dark:text-amber-400"
                            : "text-xs text-muted-foreground"
                        }
                      >
                        {person.email || "No email"}
                      </td>
                    )}
                    {visibleColumns.department && (
                      <td>
                        <p>{person.department || "—"}</p>
                        <p className="text-xs text-muted-foreground">
                          {person.position || "—"}
                        </p>
                      </td>
                    )}
                    {visibleColumns.branch && <td>{person.branch || "—"}</td>}
                    {visibleColumns.phone && <td>{person.phone || "—"}</td>}
                    {visibleColumns.status && (
                      <td>
                        <StatusBadge
                          status={
                            person.employmentStatus === "active"
                              ? "Active"
                              : "Inactive"
                          }
                        />
                      </td>
                    )}
                    <td>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => openDetails(person)}
                          className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted"
                          aria-label={`View ${person.fullName}`}
                        >
                          <Eye className="h-4 w-4" /> View
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!loading && !rows.length && <EmptyDirectory />}
          {loading && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Loading staff records…
            </p>
          )}
        </div>
        <div className="mt-5 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              {filteredRows.length
                ? `Showing ${pageStart + 1}-${Math.min(pageStart + pageSize, filteredRows.length)} of ${filteredRows.length}`
                : "No matching records"}
            </span>
            <select
              aria-label="Staff per page"
              className="h-11 rounded-md border border-border bg-background px-3"
              value={pageSize}
              onChange={(event) => setPageSize(Number(event.target.value))}
            >
              {pageSizes.map((size) => (
                <option key={size} value={size}>
                  {size} per page
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <SecondaryButton
              disabled={safePage <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              <ChevronLeft className="h-4 w-4" /> Previous
            </SecondaryButton>
            <span className="min-w-20 text-center text-xs font-semibold">
              Page {safePage} of {pageCount}
            </span>
            <SecondaryButton
              disabled={safePage >= pageCount}
              onClick={() =>
                setPage((current) => Math.min(pageCount, current + 1))
              }
            >
              Next <ChevronRight className="h-4 w-4" />
            </SecondaryButton>
          </div>
        </div>
      </Card>

      {can("staff.manage") && (
        <Card>
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            <h2 className="font-heading text-lg font-bold">
              Recent staff email activity
            </h2>
          </div>
          <div className="mt-3 divide-y divide-border">
            {logs.slice(0, 6).map((log) => (
              <div
                key={log.id}
                className="flex flex-col gap-1 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <b>{log.action.replaceAll("_", " ")}</b>
                  <p className="text-xs text-muted-foreground">
                    {log.actorName} · {readAuditTarget(log.target)}
                  </p>
                </div>
                <time className="text-xs text-muted-foreground">
                  {new Date(log.timestamp).toLocaleString()}
                </time>
              </div>
            ))}
            {!logs.length && (
              <p className="py-4 text-sm text-muted-foreground">
                No staff changes recorded yet.
              </p>
            )}
          </div>
        </Card>
      )}

      {selected && (
        <StaffDrawer
          person={selected}
          editing={editing}
          form={form}
          setForm={setForm}
          organization={organization}
          canManage={can("staff.manage")}
          saving={saving}
          close={closeDrawer}
          beginEdit={() => beginEdit(selected)}
          cancelEdit={() => {
            setEditing(false);
            setForm({ ...selected, reason: "" });
          }}
          saveEdit={saveEdit}
          toggleStatus={() => toggleStatus(selected)}
        />
      )}
      <ConfirmActionDialog
        open={Boolean(statusAction)}
        title={`${statusAction?.next === "inactive" ? "Deactivate" : "Reactivate"} staff member?`}
        description={`${statusAction?.record?.fullName || "This staff member"} will ${statusAction?.next === "inactive" ? "be removed from new payroll and payslip sending lists, while historical records remain available." : "be restored to active staff and become eligible for future payroll batches."}`}
        confirmLabel={
          statusAction?.next === "inactive"
            ? "Deactivate staff"
            : "Reactivate staff"
        }
        tone={statusAction?.next === "inactive" ? "danger" : "warning"}
        inputLabel="Reason for change"
        inputType="textarea"
        inputPlaceholder="Enter the audit reason"
        required
        value={statusAction?.reason || ""}
        onValueChange={(reason) =>
          setStatusAction((current) =>
            current ? { ...current, reason } : current,
          )
        }
        onClose={() => setStatusAction(null)}
        onConfirm={confirmStatusChange}
      />
    </div>
  );
}

function ColumnChooser({ columns, setColumns }) {
  return (
    <details className="relative">
      <summary className="flex h-10 cursor-pointer list-none items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-semibold">
        <Columns3 className="h-4 w-4" /> Columns
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-64 rounded-xl border border-border bg-popover p-3 shadow-xl">
        <p className="mb-2 text-xs font-bold uppercase text-muted-foreground">
          Visible columns
        </p>
        <div className="space-y-1">
          {columnOptions.map(([key, label]) => (
            <label
              key={key}
              className="flex cursor-pointer items-center justify-between rounded-lg px-2 py-2 text-sm hover:bg-muted"
            >
              <span>{label}</span>
              <input
                type="checkbox"
                checked={columns[key]}
                onChange={(event) =>
                  setColumns((current) => ({
                    ...current,
                    [key]: event.target.checked,
                  }))
                }
              />
            </label>
          ))}
        </div>
      </div>
    </details>
  );
}

function CountSummary({ title, icon: Icon, values, empty }) {
  return (
    <>
    <details className="group rounded-xl border border-border bg-card md:hidden">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 py-3">
        <Icon className="h-5 w-5 text-primary" />
        <span className="font-heading font-bold">{title}</span>
        <span className="ml-auto text-xs text-muted-foreground">{values.length} groups</span>
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3">
        {values.map(([label, count]) => <span key={label} className="rounded-full border border-border bg-muted/30 px-3 py-1.5 text-xs"><b>{label}</b> · {count}</span>)}
        {!values.length && <span className="text-xs text-muted-foreground">{empty}</span>}
      </div>
    </details>
    <Card className="hidden p-4 md:block">
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5 text-primary" />
        <h2 className="font-heading font-bold">{title}</h2>
        <span className="ml-auto text-xs text-muted-foreground">
          {values.length} groups
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {values.map(([label, count]) => (
          <span
            key={label}
            className="rounded-full border border-border bg-muted/30 px-3 py-1.5 text-xs"
          >
            <b>{label}</b> · {count}
          </span>
        ))}
        {!values.length && (
          <span className="text-xs text-muted-foreground">{empty}</span>
        )}
      </div>
    </Card>
    </>
  );
}

function StaffCard({ person, emailDomain, openDetails }) {
  const issue = getEmailIssue(person, emailDomain);
  return (
    <article className="min-w-0 overflow-hidden rounded-xl border border-border p-4">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1 basis-48">
          <p className="truncate font-semibold">{person.fullName}</p>
          <p className="break-all text-xs leading-5 text-muted-foreground">
            {person.staffId} · {person.email || "No email"}
          </p>
          {issue && (
            <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
              <MailWarning className="h-3.5 w-3.5 shrink-0" />
              {issue}
            </p>
          )}
        </div>
        <StatusBadge
          status={person.employmentStatus === "active" ? "Active" : "Inactive"}
        />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
        <Detail label="Department" value={person.department} />
        <Detail label="Branch" value={person.branch} />
        <Detail label="Position" value={person.position} />
        <Detail label="Phone" value={person.phone} />
      </div>
      <SecondaryButton
        className="mt-4 min-h-11 w-full"
        onClick={() => openDetails(person)}
      >
        <Eye className="h-4 w-4" /> View staff details
      </SecondaryButton>
    </article>
  );
}

function StaffDrawer({
  person,
  editing,
  form,
  setForm,
  organization,
  canManage,
  saving,
  close,
  beginEdit,
  cancelEdit,
  saveEdit,
  toggleStatus,
}) {
  const issue = getEmailIssue(person, organization.emailDomain);
  return (
    <ResponsiveSheet
      open
      onOpenChange={(next) => !next && close()}
      title={editing ? `Edit ${person.fullName}` : person.fullName}
      description={`Staff record ${person.staffId}`}
      className="md:w-[min(46rem,92vw)]"
    >
        {editing ? (
          <form
            onSubmit={saveEdit}
            className="grid gap-4 sm:grid-cols-2"
          >
            <DrawerStaffFields
              form={form}
              setForm={setForm}
              branches={organization.branches}
              departments={organization.departments}
              customColumns={organization.staffImportColumns}
            />
            <div className="sticky bottom-0 -mx-5 mt-2 grid grid-cols-2 gap-2 border-t border-border bg-card/95 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur sm:col-span-2 sm:-mx-6 sm:flex sm:justify-end sm:px-6">
              <SecondaryButton type="button" onClick={cancelEdit}>
                Cancel
              </SecondaryButton>
              <PrimaryButton disabled={saving} type="submit">
                {saving ? "Saving..." : "Save changes"}
              </PrimaryButton>
            </div>
          </form>
        ) : (
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge
                status={
                  person.employmentStatus === "active" ? "Active" : "Inactive"
                }
              />
              {issue && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-bold text-amber-700 dark:text-amber-400">
                  <MailWarning className="h-3.5 w-3.5" />
                  {issue}
                </span>
              )}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <DrawerDetail
                label="Official email"
                value={person.email || "No email recorded"}
                warning={Boolean(issue)}
              />
              <DrawerDetail label="Phone number" value={person.phone} />
              <DrawerDetail label="Department" value={person.department} />
              <DrawerDetail label="Position" value={person.position} />
              <DrawerDetail label="Branch" value={person.branch} />
              <DrawerDetail
                label="Employment status"
                value={person.employmentStatus}
              />
              {organization.staffImportColumns.map((column) => <DrawerDetail key={column.key} label={column.label} value={person.customFields?.[column.key]} />)}
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <Link to={`/salary-history?staff=${person.id}`}>
                <SecondaryButton className="min-h-11 w-full">
                  <History className="h-4 w-4" /> Salary history
                </SecondaryButton>
              </Link>
              {canManage && (
                <PrimaryButton className="min-h-11 w-full" onClick={beginEdit}>
                  <Edit3 className="h-4 w-4" /> Edit record
                </PrimaryButton>
              )}
              {canManage && (
                <button
                  type="button"
                  onClick={toggleStatus}
                  className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold sm:col-span-2 ${person.employmentStatus === "active" ? "border-red-500/30 text-red-600 hover:bg-red-500/10" : "border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10"}`}
                >
                  {person.employmentStatus === "active" ? (
                    <UserX className="h-4 w-4" />
                  ) : (
                    <RefreshCcw className="h-4 w-4" />
                  )}
                  {person.employmentStatus === "active"
                    ? "Deactivate staff"
                    : "Reactivate staff"}
                </button>
              )}
            </div>
          </div>
        )}
    </ResponsiveSheet>
  );
}

function DrawerStaffFields({ form, setForm, branches, departments, customColumns = [] }) {
  const update = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));
  const departmentOptions = includeCurrentOption(
    departments,
    form.department,
  );
  const branchOptions = includeCurrentOption(branches, form.branch);
  return (
    <>
      <DrawerField label="Staff name">
        <input
          className={inputClass}
          value={form.fullName}
          onChange={(event) => update("fullName", event.target.value)}
          required
        />
      </DrawerField>
      <DrawerField label="Staff ID">
        <input
          className={inputClass}
          value={form.staffId}
          onChange={(event) => update("staffId", event.target.value)}
          required
        />
      </DrawerField>
      <DrawerField label="Official email">
        <input
          className={inputClass}
          type="email"
          value={form.email}
          onChange={(event) => update("email", event.target.value)}
          required
        />
      </DrawerField>
      <DrawerField label="Phone number">
        <input
          className={inputClass}
          value={form.phone}
          onChange={(event) => update("phone", event.target.value)}
        />
      </DrawerField>
      <DrawerField label="Department">
        <select
          className={inputClass}
          value={form.department}
          onChange={(event) => update("department", event.target.value)}
          required
        >
          <option value="">Select department</option>
          {departmentOptions.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </DrawerField>
      <DrawerField label="Position">
        <input
          className={inputClass}
          value={form.position}
          onChange={(event) => update("position", event.target.value)}
          required
        />
      </DrawerField>
      <DrawerField label="Branch">
        <select
          className={inputClass}
          value={form.branch}
          onChange={(event) => update("branch", event.target.value)}
          required
        >
          <option value="">Select branch</option>
          {branchOptions.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </DrawerField>
      <DrawerField label="Employment status">
        <select
          className={inputClass}
          value={form.employmentStatus}
          onChange={(event) => update("employmentStatus", event.target.value)}
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </DrawerField>
      {customColumns.map((column) => <DrawerField key={column.key} label={column.label}>
        <input
          className={inputClass}
          value={form.customFields?.[column.key] || ""}
          onChange={(event) => setForm((current) => ({ ...current, customFields: { ...(current.customFields || {}), [column.key]: event.target.value } }))}
          required={Boolean(column.required)}
        />
      </DrawerField>)}
      <DrawerField label="Reason for change" className="sm:col-span-2">
        <textarea
          className="min-h-24 w-full rounded-lg border border-border bg-background p-3 text-sm"
          value={form.reason}
          onChange={(event) => update("reason", event.target.value)}
          required
        />
      </DrawerField>
    </>
  );
}

function includeCurrentOption(options, currentValue) {
  const current = String(currentValue || "").trim();
  if (!current) return options;
  return [
    current,
    ...options.filter(
      (item) => String(item).trim().toLowerCase() !== current.toLowerCase(),
    ),
  ];
}

function DrawerField({ label, children, className = "" }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
function Detail({ label, value }) {
  return (
    <div>
      <span className="text-muted-foreground">{label}</span>
      <p className="font-semibold">{value || "—"}</p>
    </div>
  );
}
function DrawerDetail({ label, value, warning = false }) {
  return (
    <div
      className={`rounded-xl border p-3 ${warning ? "border-amber-500/30 bg-amber-500/[.04]" : "border-border"}`}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold capitalize">
        {value || "—"}
      </p>
    </div>
  );
}
function EmptyDirectory() {
  return (
    <p className="py-10 text-center text-sm text-muted-foreground">
      No staff records match these filters.
    </p>
  );
}
function getEmailIssue(person, configuredDomain = "@bawjiasecommunitybank.com") {
  const email = String(person.email || "")
    .trim()
    .toLowerCase();
  const officialDomain = String(configuredDomain || "@bawjiasecommunitybank.com").trim().toLowerCase().replace(/^(?!@)/, "@");
  return !email
    ? "Missing email"
    : !email.endsWith(officialDomain)
      ? "Invalid official email"
      : "";
}
function countBy(records, key) {
  const counts = records.reduce((result, item) => {
    const label = item[key] || "Unassigned";
    result[label] = (result[label] || 0) + 1;
    return result;
  }, {});
  return Object.entries(counts).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
}
function readAuditTarget(value) {
  try {
    const target = JSON.parse(value);
    return (
      target.staffName || target.fileName || target.staffId || "Staff records"
    );
  } catch {
    return value;
  }
}
