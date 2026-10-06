"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { StatusBadge } from "@/components/ui/StatusBadge";
import { PageEmptyState } from "@/components/ui/PageEmptyState";
import { sectionFor, type ChecklistSection } from "@/lib/checklist-sections";

export const SECTION_ORDER: ChecklistSection[] = [
  "NEEDS_ATTENTION",
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "QUARTERLY",
  "YEARLY",
  "ADDED_OR_CARRIED_FORWARD",
];

export const SECTION_LABELS: Record<ChecklistSection, string> = {
  NEEDS_ATTENTION: "Needs attention",
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  YEARLY: "Yearly",
  ADDED_OR_CARRIED_FORWARD: "Added or carried forward",
};

export type ChecklistTaskRow = {
  id: string;
  checklistCode: string;
  taskDescription: string;
  employeeName: string;
  designation?: string | null;
  cadence?: "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY" | null;
  category?: string | null;
  scheduleDetail?: string | null;
  section?: ChecklistSection;
  status: "PENDING" | "DONE" | "NOT_DONE";
  colorStatus?: string | null;
  priority: "HIGH" | "MEDIUM" | "LOW";
  reminderCount: number;
  escalated: boolean;
  seniorRemarks?: string | null;
  employeeResponse?: string | null;
  formSubmittedAt?: string | null;
};

export type SectionGroup = {
  section: ChecklistSection;
  title: string;
  rows: ChecklistTaskRow[];
  total: number;
  done: number;
  pending: number;
  notDone: number;
  progress: number;
};

export type EmployeeGroup = {
  employeeName: string;
  designation: string | null;
  total: number;
  done: number;
  pending: number;
  notDone: number;
  progress: number;
  rows: ChecklistTaskRow[];
  sections: SectionGroup[];
};

export function buildSectionGroups(items: ChecklistTaskRow[]): SectionGroup[] {
  const grouped = new Map<ChecklistSection, ChecklistTaskRow[]>();
  for (const section of SECTION_ORDER) {
    grouped.set(section, []);
  }

  for (const item of items) {
    const key = item.section ?? sectionFor({
      cadence: item.cadence ?? null,
      status: item.status,
      escalated: item.escalated,
      isQueueOnly: item.taskDescription.startsWith("MANUAL-") || item.checklistCode.startsWith("MANUAL-"),
      isCarriedForward: false,
    });
    grouped.get(key)?.push(item);
  }

  return SECTION_ORDER.map((section) => {
    const rows = grouped.get(section) ?? [];
    const done = rows.filter((item) => item.status === "DONE").length;
    const pending = rows.filter((item) => item.status === "PENDING").length;
    const notDone = rows.filter((item) => item.status === "NOT_DONE").length;
    return {
      section,
      title: SECTION_LABELS[section],
      rows,
      total: rows.length,
      done,
      pending,
      notDone,
      progress: rows.length ? Math.round((done / rows.length) * 100) : 0,
    };
  }).filter((group) => group.rows.length > 0);
}

export function buildEmployeeGroups(items: ChecklistTaskRow[]): EmployeeGroup[] {
  const grouped = new Map<string, ChecklistTaskRow[]>();
  for (const item of items) {
    const rows = grouped.get(item.employeeName) ?? [];
    rows.push(item);
    grouped.set(item.employeeName, rows);
  }

  return Array.from(grouped.entries()).map(([employeeName, rows]) => {
    const sections = buildSectionGroups(rows);
    const total = rows.length;
    const done = rows.filter((item) => item.status === "DONE").length;
    const pending = rows.filter((item) => item.status === "PENDING").length;
    const notDone = rows.filter((item) => item.status === "NOT_DONE").length;
    return {
      employeeName,
      designation: rows[0]?.designation ?? null,
      total,
      done,
      pending,
      notDone,
      progress: total ? Math.round((done / total) * 100) : 0,
      rows,
      sections,
    };
  }).sort((first, second) => second.total - first.total || first.employeeName.localeCompare(second.employeeName));
}

export function defaultExpansionForSectionGroups(groups: SectionGroup[]): Record<string, boolean> {
  return Object.fromEntries(groups.map((group) => [group.section, group.total === 0 ? false : group.progress < 100]));
}

export function defaultExpansionForEmployeeGroups(groups: EmployeeGroup[]): Record<string, boolean> {
  const expansions = new Map<string, boolean>();
  for (const group of groups) {
    expansions.set(group.employeeName, true);
    for (const section of group.sections) {
      expansions.set(section.section, true);
    }
  }
  return Object.fromEntries(expansions);
}

function subscribeToSessionStorage(key: string, onChange: () => void) {
  if (typeof window === "undefined") return () => {};

  const handleStorage = (event: StorageEvent) => {
    if (event.key === key) onChange();
  };
  window.addEventListener("storage", handleStorage);
  return () => window.removeEventListener("storage", handleStorage);
}

function getSessionStorageItem(key: string) {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

type RetryAction =
  | { kind: "status"; itemId: string; status: "DONE" | "NOT_DONE" }
  | { kind: "remark"; itemId: string };

type SaveFeedback = {
  phase: "pending" | "success" | "error";
  message: string;
  retry?: RetryAction;
};

export function ChecklistPanel({
  items,
  employeeName,
  emptyHref = "/dashboard",
}: {
  items: ChecklistTaskRow[];
  employeeName: string;
  emptyHref?: string;
}) {
  const [localItems, setLocalItems] = useState(items);
  const [editingRemarks, setEditingRemarks] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<SaveFeedback | null>(null);
  const [statusFilter, setStatusFilter] = useState<"ALL" | "PENDING" | "DONE" | "NOT_DONE" | "ESCALATED">("ALL");
  const [searchTerm, setSearchTerm] = useState("");

  const summary = useMemo(() => {
    return {
      done: localItems.filter((item) => item.status === "DONE").length,
      pending: localItems.filter((item) => item.status === "PENDING").length,
      notDone: localItems.filter((item) => item.status === "NOT_DONE").length,
      escalated: localItems.filter((item) => item.escalated).length,
    };
  }, [localItems]);

  const filteredItems = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return localItems.filter((item) => {
      const matchesFilter =
        statusFilter === "ALL"
          ? true
          : statusFilter === "ESCALATED"
            ? item.escalated
            : item.status === statusFilter;

      const matchesSearch =
        query.length === 0 ||
        [item.taskDescription, item.employeeName, item.checklistCode]
          .some((value) => value?.toLowerCase().includes(query));

      return matchesFilter && matchesSearch;
    });
  }, [localItems, searchTerm, statusFilter]);

  async function updateStatus(itemId: string, nextStatus: "DONE" | "NOT_DONE") {
    const previous = localItems.find((item) => item.id === itemId);
    const activeRemark = editingRemarks[itemId] ?? previous?.seniorRemarks ?? (nextStatus === "NOT_DONE" ? "Marked not done by authority" : "");

    setLocalItems((current) =>
      current.map((item) =>
        item.id === itemId
          ? {
              ...item,
              status: nextStatus,
              seniorRemarks: activeRemark || item.seniorRemarks,
            }
          : item,
      ),
    );

    try {
      setSavingId(itemId);
      setSaveFeedback({ phase: "pending", message: "Saving task status." });
      const response = await fetch(`/api/checklist/item/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: nextStatus,
          seniorRemarks: activeRemark || (nextStatus === "NOT_DONE" ? "Marked not done by authority" : "Manual update"),
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save task status");
      }

      const updated = await response.json();
      setLocalItems((current) =>
        current.map((item) => (item.id === updated.id ? { ...item, ...updated, status: updated.status } : item)),
      );
      setSaveFeedback({ phase: "success", message: "Task status saved." });
    } catch {
      setLocalItems((current) =>
        current.map((item) =>
          item.id === itemId
            ? {
                ...item,
                status: previous?.status ?? item.status,
                seniorRemarks: previous?.seniorRemarks ?? item.seniorRemarks,
              }
            : item,
        ),
      );
        setSaveFeedback({
          phase: "error",
          message: "Could not save task status. The previous status was restored.",
          retry: { kind: "status", itemId, status: nextStatus },
        });
    } finally {
      setSavingId(null);
    }
  }

  async function saveRemarkOnly(itemId: string) {
    const remarkValue = editingRemarks[itemId];
    if (remarkValue === undefined) return;

    try {
      setSavingId(itemId);
      setSaveFeedback({ phase: "pending", message: "Saving remark." });
      const response = await fetch(`/api/checklist/item/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seniorRemarks: remarkValue,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save remark");
      }

      const updated = await response.json();
      setLocalItems((current) =>
        current.map((item) => (item.id === updated.id ? { ...item, seniorRemarks: updated.seniorRemarks } : item)),
      );
      setSaveFeedback({ phase: "success", message: "Remark saved." });
    } catch {
      setSaveFeedback({
        phase: "error",
        message: "Could not save remark. Your text is still here; retry when the connection is available.",
        retry: { kind: "remark", itemId },
      });
    } finally {
      setSavingId(null);
    }
  }

  async function retryFailedAction() {
    const retry = saveFeedback?.retry;
    if (!retry) return;
    if (retry.kind === "status") {
      await updateStatus(retry.itemId, retry.status);
    } else {
      await saveRemarkOnly(retry.itemId);
    }
  }

  const sectionGroups = useMemo(() => buildSectionGroups(filteredItems), [filteredItems]);
  const employeeGroups = useMemo(() => buildEmployeeGroups(filteredItems), [filteredItems]);
  const defaultExpansion = useMemo(() => employeeName === "All Employees"
    ? defaultExpansionForEmployeeGroups(employeeGroups)
    : defaultExpansionForSectionGroups(sectionGroups), [employeeName, employeeGroups, sectionGroups]);
  const [groupExpansion, setGroupExpansion] = useState<Record<string, boolean>>({});
  const storageKey = `checklist-panel:${employeeName}`;
  const subscribeToExpansion = useCallback(
    (onChange: () => void) => subscribeToSessionStorage(storageKey, onChange),
    [storageKey],
  );
  const getExpansionSnapshot = useCallback(
    () => getSessionStorageItem(storageKey),
    [storageKey],
  );
  const storedExpansion = useSyncExternalStore(subscribeToExpansion, getExpansionSnapshot, () => null);
  const persistedExpansion = useMemo(() => {
    if (!storedExpansion) return {};
    try {
      const parsed: unknown = JSON.parse(storedExpansion);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
      return Object.fromEntries(
        Object.entries(parsed).filter(([, value]) => typeof value === "boolean"),
      );
    } catch {
      return {};
    }
  }, [storedExpansion]);
  const resolvedExpansion = useMemo(
    () => ({ ...defaultExpansion, ...persistedExpansion, ...groupExpansion }),
    [defaultExpansion, persistedExpansion, groupExpansion],
  );

  useEffect(() => {
    if (typeof window === "undefined" || !Object.keys(groupExpansion).length) return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(resolvedExpansion));
    } catch {
      // Best effort only: sessionStorage is optional in some browsers.
    }
  }, [groupExpansion, resolvedExpansion, storageKey]);

  if (!localItems.length) {
    return (
      <PageEmptyState
        title="No tasks assigned"
        description={`No tasks assigned to ${employeeName} on this date.`}
        href={emptyHref}
        actionLabel="Open assignment queue"
      />
    );
  }

  const toggleAll = (next: boolean) => {
    const keys = employeeName === "All Employees"
      ? employeeGroups.flatMap((group) => [
          [group.employeeName, next] as const,
          ...group.sections.map((section) => [section.section, next] as const),
        ])
      : sectionGroups.map((group) => [group.section, next] as const);
    setGroupExpansion((current) => ({ ...current, ...Object.fromEntries(keys) }));
  };

  const renderTaskCard = (item: ChecklistTaskRow) => (
    <div key={item.id} className="neo-border bg-white p-4 neo-shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="sticker bg-sun-yellow text-[11px] font-black uppercase tracking-[0.14em] text-ink">
                {item.employeeName}
              </span>
              <span className="sticker bg-paper font-mono text-[10px] font-bold text-ink">
                {item.checklistCode}
              </span>
            </div>
            <p className="text-lg font-black uppercase tracking-[0.04em] text-ink">{item.taskDescription}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-ink">
              <span className="sticker bg-paper text-ink">Priority: {item.priority}</span>
              <StatusBadge status={item.escalated ? "ESCALATED" : item.status} />
              {item.reminderCount > 0 ? <span className="sticker bg-cyber-cyan text-ink">Reminders: {item.reminderCount}</span> : null}
              {item.formSubmittedAt ? (
                <span className="sticker bg-paper text-ink">
                  Via form {new Date(item.formSubmittedAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })}
                </span>
              ) : null}
            </div>

            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <label htmlFor={`remarks-${item.id}`} className="text-sm font-semibold text-ink">Senior remark</label>
              <input
                id={`remarks-${item.id}`}
                type="text"
                placeholder="Add specific remark for this task..."
                value={editingRemarks[item.id] !== undefined ? editingRemarks[item.id] : (item.seniorRemarks ?? "")}
                onChange={(e) => setEditingRemarks({ ...editingRemarks, [item.id]: e.target.value })}
                className="neo-border flex-1 bg-paper/50 px-3 py-1.5 text-xs font-semibold text-ink placeholder:text-ink/40 focus:bg-white focus:outline-none"
              />
              {editingRemarks[item.id] !== undefined && editingRemarks[item.id] !== (item.seniorRemarks ?? "") && (
                <button
                  type="button"
                  onClick={() => saveRemarkOnly(item.id)}
                  disabled={savingId === item.id}
                  className="neo-press neo-border bg-electric-lime px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-ink"
                >
                  {savingId === item.id ? "Saving..." : "Save remark"}
                </button>
              )}
            </div>

            {(item.seniorRemarks || item.employeeResponse) && (
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {item.seniorRemarks ? (
                  <div className="neo-border bg-sun-yellow p-3 text-sm text-ink">
                    <p className="mb-1 text-[10px] font-black uppercase tracking-[0.18em] text-ink/80">Current Senior Remark</p>
                    <p>{item.seniorRemarks}</p>
                  </div>
                ) : null}
                {item.employeeResponse ? (
                  <div className="neo-border bg-electric-lime p-3 text-sm text-ink">
                    <p className="mb-1 text-[10px] font-black uppercase tracking-[0.18em] text-ink/80">Employee response</p>
                    <p>{item.employeeResponse}</p>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => updateStatus(item.id, "DONE")}
            disabled={savingId === item.id}
            aria-busy={savingId === item.id}
            className="neo-press neo-border min-h-11 bg-brand-green px-3 py-2 text-sm font-black text-ink"
          >
            Done
          </button>
          <button
            type="button"
            onClick={() => updateStatus(item.id, "NOT_DONE")}
            disabled={savingId === item.id}
            aria-busy={savingId === item.id}
            className="neo-press neo-border min-h-11 bg-hot-pink px-3 py-2 text-sm font-black text-ink"
          >
            Not done
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {saveFeedback ? (
        <div
          className={`neo-border flex flex-wrap items-center justify-between gap-3 p-3 text-sm font-bold ${saveFeedback.phase === "error" ? "bg-hot-pink text-ink" : saveFeedback.phase === "success" ? "bg-electric-lime text-ink" : "bg-sun-yellow text-ink"}`}
          role={saveFeedback.phase === "error" ? "alert" : "status"}
          aria-live={saveFeedback.phase === "error" ? "assertive" : "polite"}
          aria-atomic="true"
        >
          <span>{saveFeedback.message}</span>
          {saveFeedback.retry ? (
            <button
              type="button"
              onClick={retryFailedAction}
              disabled={savingId !== null}
              className="neo-press neo-border min-h-11 bg-white px-4 py-2 text-sm font-bold text-ink"
            >
              Retry
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { value: summary.done, tone: "bg-brand-green", status: "DONE" as const },
          { value: summary.pending, tone: "bg-sun-yellow", status: "PENDING" as const },
          { value: summary.notDone, tone: "bg-hot-pink", status: "NOT_DONE" as const },
        ].map((card) => (
          <div key={card.status} className={`neo-border p-4 neo-shadow-sm ${card.tone}`}>
            <StatusBadge status={card.status} />
            <p className="brand-display mt-2 text-3xl leading-none">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex-1">
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search tasks, code or employee..."
            aria-label="Search tasks"
            className="neo-border w-full bg-paper/60 px-3 py-2 text-sm font-medium text-ink placeholder:text-ink/40 focus:bg-white focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {(["ALL", "PENDING", "DONE", "NOT_DONE", "ESCALATED"] as const).map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setStatusFilter(filter)}
              className={[
                "neo-press border-[3px] border-ink px-2.5 py-2 text-[10px] font-black uppercase tracking-[0.14em]",
                statusFilter === filter ? "bg-ink text-paper" : "bg-white text-ink",
              ].join(" ")}
            >
              {filter === "ESCALATED" ? "Escalated" : filter === "ALL" ? "All" : filter.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => toggleAll(true)} className="neo-press neo-border bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-ink">Expand all</button>
        <button type="button" onClick={() => toggleAll(false)} className="neo-press neo-border bg-paper px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-ink">Collapse all</button>
      </div>

      {filteredItems.length === 0 ? (
        <div className="neo-border bg-paper p-8 text-center text-ink neo-shadow-sm">
          <p className="brand-display text-2xl text-ink">No matching tasks</p>
          <p className="mt-2 text-sm text-ink/75">No tasks match the current search and filter selection.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {employeeName === "All Employees"
            ? employeeGroups.map((employee) => {
                const expanded = resolvedExpansion[employee.employeeName] ?? employee.progress < 100;
                return (
                  <div key={employee.employeeName} className="neo-border bg-paper p-4 neo-shadow-sm">
                    <button
                      type="button"
                      onClick={() => setGroupExpansion((current) => ({ ...current, [employee.employeeName]: !expanded }))}
                      aria-expanded={expanded}
                      className="flex w-full items-center justify-between gap-3 text-left"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          aria-hidden="true"
                          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-[3px] border-ink bg-electric-lime text-sm font-black uppercase text-ink"
                        >
                          {employee.employeeName.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?"}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black uppercase tracking-[0.04em] text-ink">{employee.employeeName}</p>
                          <p className="text-[10px] uppercase tracking-[0.14em] text-ink/60">{employee.designation ?? "Employee"}</p>
                          <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-ink/70">{employee.total} assigned tasks</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="h-2.5 w-24 border-[2px] border-ink bg-white">
                          <div className="h-full bg-brand-green" style={{ width: `${employee.progress}%` }} />
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-[0.12em] text-ink">{employee.progress}%</span>
                      </div>
                    </button>

                    {expanded ? (
                      <div className="mt-3 space-y-3">
                        {employee.sections.map((section) => {
                          const sectionExpanded = resolvedExpansion[section.section] ?? section.progress < 100;
                          return (
                            <div key={`${employee.employeeName}-${section.section}`} className="neo-border bg-white p-3">
                              <button
                                type="button"
                                onClick={() => setGroupExpansion((current) => ({ ...current, [section.section]: !sectionExpanded }))}
                                aria-expanded={sectionExpanded}
                                className="flex w-full items-center justify-between gap-3 text-left"
                              >
                                <div>
                                  <p className="text-sm font-black uppercase tracking-[0.04em] text-ink">{section.title}</p>
                                  <p className="text-[10px] uppercase tracking-[0.12em] text-ink/60">{section.total} tasks</p>
                                </div>
                                <div className="flex items-center gap-3">
                                  <div className="h-2.5 w-20 border-[2px] border-ink bg-paper">
                                    <div className="h-full bg-brand-green" style={{ width: `${section.progress}%` }} />
                                  </div>
                                  <span className="text-[10px] font-black uppercase tracking-[0.12em] text-ink">{section.progress}%</span>
                                </div>
                              </button>
                              {sectionExpanded ? <div className="mt-3 space-y-3">{section.rows.map(renderTaskCard)}</div> : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })
            : sectionGroups.map((section) => {
                const expanded = resolvedExpansion[section.section] ?? section.progress < 100;
                return (
                  <div key={section.section} className="neo-border bg-paper p-3 neo-shadow-sm">
                    <button
                      type="button"
                      onClick={() => setGroupExpansion((current) => ({ ...current, [section.section]: !expanded }))}
                      aria-expanded={expanded}
                      className="flex w-full items-center justify-between gap-3 text-left"
                    >
                      <div>
                        <p className="text-sm font-black uppercase tracking-[0.04em] text-ink">{section.title}</p>
                        <p className="text-[10px] uppercase tracking-[0.12em] text-ink/60">{section.total} tasks</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="h-2.5 w-24 border-[2px] border-ink bg-white">
                          <div className="h-full bg-brand-green" style={{ width: `${section.progress}%` }} />
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-[0.12em] text-ink">{section.progress}%</span>
                      </div>
                    </button>
                    {expanded ? <div className="mt-3 space-y-3">{section.rows.map(renderTaskCard)}</div> : null}
                  </div>
                );
              })}
        </div>
      )}
    </div>
  );
}
