"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { FilterX, Search, SkipForward, X } from "lucide-react";

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

export type ChecklistStatusFilter = "ALL" | "PENDING" | "DONE" | "NOT_DONE" | "ESCALATED";
export type ChecklistPriorityFilter = "ALL" | ChecklistTaskRow["priority"];
export type ChecklistSort = "ACTION_FIRST" | "PRIORITY" | "TASK_NAME" | "EMPLOYEE";

export function selectChecklistItems(
  items: ChecklistTaskRow[],
  {
    status = "ALL",
    priority = "ALL",
    search = "",
    sort = "ACTION_FIRST",
  }: {
    status?: ChecklistStatusFilter;
    priority?: ChecklistPriorityFilter;
    search?: string;
    sort?: ChecklistSort;
  } = {},
) {
  const query = search.trim().toLowerCase();
  const priorityRank = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  const statusRank = (item: ChecklistTaskRow) => item.escalated ? 0 : item.status === "NOT_DONE" ? 1 : item.status === "PENDING" ? 2 : 3;

  return items
    .filter((item) => {
      const matchesStatus = status === "ALL"
        || (status === "ESCALATED" ? item.escalated : item.status === status);
      const matchesPriority = priority === "ALL" || item.priority === priority;
      const matchesSearch = query.length === 0
        || [item.taskDescription, item.employeeName, item.checklistCode, item.seniorRemarks, item.employeeResponse, item.category]
          .some((value) => value?.toLowerCase().includes(query));
      return matchesStatus && matchesPriority && matchesSearch;
    })
    .sort((first, second) => {
      if (sort === "PRIORITY") {
        return priorityRank[first.priority] - priorityRank[second.priority]
          || statusRank(first) - statusRank(second)
          || first.taskDescription.localeCompare(second.taskDescription);
      }
      if (sort === "TASK_NAME") return first.taskDescription.localeCompare(second.taskDescription);
      if (sort === "EMPLOYEE") {
        return first.employeeName.localeCompare(second.employeeName)
          || first.taskDescription.localeCompare(second.taskDescription);
      }
      return statusRank(first) - statusRank(second)
        || priorityRank[first.priority] - priorityRank[second.priority]
        || first.employeeName.localeCompare(second.employeeName)
        || first.taskDescription.localeCompare(second.taskDescription);
    });
}

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
  const [pendingJumpTaskId, setPendingJumpTaskId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ChecklistStatusFilter>("ALL");
  const [priorityFilter, setPriorityFilter] = useState<ChecklistPriorityFilter>("ALL");
  const [sortBy, setSortBy] = useState<ChecklistSort>("ACTION_FIRST");
  const [searchTerm, setSearchTerm] = useState("");

  const summary = useMemo(() => {
    return {
      done: localItems.filter((item) => item.status === "DONE").length,
      pending: localItems.filter((item) => item.status === "PENDING").length,
      notDone: localItems.filter((item) => item.status === "NOT_DONE").length,
      escalated: localItems.filter((item) => item.escalated).length,
      total: localItems.length,
    };
  }, [localItems]);

  const filteredItems = useMemo(() => {
    return selectChecklistItems(localItems, {
      status: statusFilter,
      priority: priorityFilter,
      search: searchTerm,
      sort: sortBy,
    });
  }, [localItems, priorityFilter, searchTerm, sortBy, statusFilter]);

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
    if (!pendingJumpTaskId) return;
    const frame = window.requestAnimationFrame(() => {
      const taskCard = document.getElementById(`checklist-task-${pendingJumpTaskId}`);
      if (!taskCard) return;
      taskCard.scrollIntoView({ behavior: "smooth", block: "center" });
      taskCard.querySelector<HTMLButtonElement>('[data-task-action="done"]')?.focus({ preventScroll: true });
      setPendingJumpTaskId(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pendingJumpTaskId, resolvedExpansion]);

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

  const clearFilters = () => {
    setSearchTerm("");
    setStatusFilter("ALL");
    setPriorityFilter("ALL");
    setSortBy("ACTION_FIRST");
  };

  const jumpToNextOpenTask = () => {
    const nextOpen = filteredItems.find((item) => item.status !== "DONE" || item.escalated);
    if (!nextOpen) return;
    const expandedKeys = employeeName === "All Employees"
      ? employeeGroups.flatMap((employee) => employee.rows.some((item) => item.id === nextOpen.id)
        ? [
            [employee.employeeName, true] as const,
            ...employee.sections.map((section) => [section.section, section.rows.some((item) => item.id === nextOpen.id)] as const),
          ]
        : [])
      : sectionGroups.map((section) => [section.section, section.rows.some((item) => item.id === nextOpen.id)] as const);
    setGroupExpansion((current) => ({ ...current, ...Object.fromEntries(expandedKeys) }));
    setPendingJumpTaskId(nextOpen.id);
  };

  const renderTaskCard = (item: ChecklistTaskRow) => (
    <div id={`checklist-task-${item.id}`} key={item.id} className="neo-border scroll-mt-24 bg-white p-4 neo-shadow-sm">
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
              <span className={`sticker text-ink ${item.priority === "HIGH" ? "bg-hot-pink" : item.priority === "MEDIUM" ? "bg-sun-yellow" : "bg-paper"}`}>
                {item.priority} priority
              </span>
              <StatusBadge status={item.escalated ? "ESCALATED" : item.status} />
              {item.reminderCount > 0 ? <span className="sticker bg-cyber-cyan text-ink">Reminders: {item.reminderCount}</span> : null}
              {item.formSubmittedAt ? (
                <span className="sticker bg-paper text-ink">
                  Via form {new Date(item.formSubmittedAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })}
                </span>
              ) : null}
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
              <label htmlFor={`remarks-${item.id}`} className="text-xs font-bold text-ink">Senior remark</label>
              <input
                id={`remarks-${item.id}`}
                type="text"
                placeholder="Add specific remark for this task..."
                maxLength={500}
                value={editingRemarks[item.id] !== undefined ? editingRemarks[item.id] : (item.seniorRemarks ?? "")}
                onChange={(e) => setEditingRemarks((current) => ({ ...current, [item.id]: e.target.value }))}
                onKeyDown={(event) => {
                  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                    event.preventDefault();
                    void saveRemarkOnly(item.id);
                  }
                }}
                className="neo-border min-h-11 flex-1 bg-paper/50 px-3 py-2 text-sm font-semibold text-ink placeholder:text-ink/50 focus:bg-white focus:outline-none"
              />
              {editingRemarks[item.id] !== undefined && editingRemarks[item.id] !== (item.seniorRemarks ?? "") && (
                <button
                  type="button"
                  onClick={() => saveRemarkOnly(item.id)}
                  disabled={savingId === item.id}
                  className="neo-press neo-border min-h-11 bg-electric-lime px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-ink"
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

        <div className="flex shrink-0 flex-row gap-2 md:flex-col">
          <button
            type="button"
            onClick={() => updateStatus(item.id, "DONE")}
            disabled={savingId === item.id}
            aria-busy={savingId === item.id}
            data-task-action="done"
            className={`neo-press neo-border min-h-11 px-3 py-2 text-sm font-black text-ink ${item.status === "DONE" ? "bg-white" : "bg-brand-green"}`}
          >
            {item.status === "DONE" ? "Completed" : "Mark done"}
          </button>
          <button
            type="button"
            onClick={() => updateStatus(item.id, "NOT_DONE")}
            disabled={savingId === item.id}
            aria-busy={savingId === item.id}
            className={`neo-press neo-border min-h-11 px-3 py-2 text-sm font-black text-ink ${item.status === "NOT_DONE" ? "bg-white" : "bg-hot-pink"}`}
          >
            {item.status === "NOT_DONE" ? "Marked not done" : "Mark not done"}
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
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
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
        <div className="neo-border bg-grape p-4 text-ink neo-shadow-sm">
          <StatusBadge status="ESCALATED" />
          <p className="brand-display mt-2 text-3xl leading-none">{summary.escalated}</p>
          <p className="mt-1 text-xs font-bold">Needs follow-up</p>
        </div>
        <div className="neo-border bg-ink p-4 text-paper neo-shadow-sm">
          <span className="sticker border-paper bg-white text-ink">Completion</span>
          <p className="brand-display mt-2 text-3xl leading-none">
            {summary.total ? Math.round((summary.done / summary.total) * 100) : 0}%
          </p>
          <div
            role="progressbar"
            aria-label={`${summary.done} of ${summary.total} tasks completed`}
            aria-valuemin={0}
            aria-valuemax={summary.total || 1}
            aria-valuenow={summary.done}
            className="mt-3 h-2 border border-paper bg-white/20"
          >
            <span
              className="block h-full bg-electric-lime"
              style={{ width: `${summary.total ? (summary.done / summary.total) * 100 : 0}%` }}
            />
          </div>
          <p className="mt-1 text-[10px] font-bold text-paper/75">{summary.done} of {summary.total} tasks</p>
        </div>
      </div>

      <div className="neo-border space-y-3 bg-white p-3 neo-shadow-sm sm:p-4">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
          <label className="block">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.16em] text-ink/70">Find a task</span>
            <span className="relative block">
              <Search aria-hidden="true" size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/60" />
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search description, code, employee, or remarks..."
                aria-label="Search tasks"
                className="neo-border min-h-11 w-full bg-paper/60 py-2 pl-10 pr-3 text-sm font-medium text-ink placeholder:text-ink/50 focus:bg-white focus:outline-none"
              />
              {searchTerm ? (
                <button
                  type="button"
                  aria-label="Clear task search"
                  onClick={() => setSearchTerm("")}
                  className="absolute right-1 top-1 flex h-9 w-9 items-center justify-center text-ink hover:bg-paper"
                >
                  <X aria-hidden="true" size={16} />
                </button>
              ) : null}
            </span>
          </label>
          <div className="grid gap-2 sm:grid-cols-2 xl:w-[27rem]">
            <label>
              <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.16em] text-ink/70">Priority</span>
              <select
                value={priorityFilter}
                onChange={(event) => setPriorityFilter(event.target.value as ChecklistPriorityFilter)}
                className="neo-border min-h-11 w-full bg-white px-3 py-2 text-sm font-bold text-ink"
              >
                <option value="ALL">All priorities</option>
                <option value="HIGH">High priority</option>
                <option value="MEDIUM">Medium priority</option>
                <option value="LOW">Low priority</option>
              </select>
            </label>
            <label>
              <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.16em] text-ink/70">Sort tasks</span>
              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value as ChecklistSort)}
                className="neo-border min-h-11 w-full bg-white px-3 py-2 text-sm font-bold text-ink"
              >
                <option value="ACTION_FIRST">Action needed first</option>
                <option value="PRIORITY">Highest priority first</option>
                <option value="TASK_NAME">Task name</option>
                <option value="EMPLOYEE">Employee name</option>
              </select>
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
          {([
            { key: "ALL", label: "All", count: summary.total },
            { key: "PENDING", label: "Pending", count: summary.pending },
            { key: "NOT_DONE", label: "Not done", count: summary.notDone },
            { key: "ESCALATED", label: "Escalated", count: summary.escalated },
            { key: "DONE", label: "Done", count: summary.done },
          ] as const).map((filter) => (
            <button
              key={filter.key}
              type="button"
              onClick={() => setStatusFilter(filter.key)}
              aria-pressed={statusFilter === filter.key}
              className={[
                "neo-press inline-flex min-h-10 items-center gap-2 border-[2px] border-ink px-3 py-1.5 text-xs font-black uppercase",
                statusFilter === filter.key ? "bg-ink text-paper" : "bg-white text-ink",
              ].join(" ")}
            >
              {filter.label}
              <span className={`inline-flex min-w-5 justify-center border border-current px-1 py-0.5 text-[10px] ${statusFilter === filter.key ? "bg-white text-ink" : "bg-paper text-ink"}`}>
                {filter.count}
              </span>
            </button>
          ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={jumpToNextOpenTask}
              disabled={!filteredItems.some((item) => item.status !== "DONE" || item.escalated)}
              className="neo-press inline-flex min-h-10 items-center gap-2 border-[2px] border-ink bg-electric-lime px-3 text-xs font-black uppercase text-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              <SkipForward aria-hidden="true" size={15} /> Next open task
            </button>
            {(searchTerm || statusFilter !== "ALL" || priorityFilter !== "ALL" || sortBy !== "ACTION_FIRST") ? (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex min-h-10 items-center gap-2 border-[2px] border-ink bg-white px-3 text-xs font-bold text-ink hover:bg-paper"
              >
                <FilterX aria-hidden="true" size={15} /> Clear filters
              </button>
            ) : null}
          </div>
        </div>
        <p aria-live="polite" className="text-xs font-semibold text-ink/70">
          Showing {filteredItems.length} of {summary.total} tasks
          {statusFilter !== "ALL" ? ` · ${statusFilter === "ESCALATED" ? "Escalated" : statusFilter.replace("_", " ").toLowerCase()}` : ""}
          {priorityFilter !== "ALL" ? ` · ${priorityFilter.toLowerCase()} priority` : ""}
        </p>
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
