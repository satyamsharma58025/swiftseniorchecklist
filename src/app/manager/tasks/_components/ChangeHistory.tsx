"use client";

import { useMemo, useState } from "react";

import { buildHistoryLine, type ScheduleChanges } from "@/lib/task-schedule-view";

type ChangeRow = {
  id: string;
  taskCode: string;
  actorName: string;
  createdAt: string;
  changes: unknown;
  reason: string | null;
};

function getChanges(value: unknown): ScheduleChanges {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: ScheduleChanges = {};
  for (const [field, change] of Object.entries(value)) {
    if (change && typeof change === "object" && "from" in change && "to" in change) {
      result[field] = { from: change.from, to: change.to };
    }
  }
  return result;
}

export function ChangeHistory({ changes }: { changes: ChangeRow[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const groups = useMemo(() => {
    const grouped = new Map<string, ChangeRow[]>();
    for (const change of changes) {
      grouped.set(change.taskCode, [...(grouped.get(change.taskCode) ?? []), change]);
    }
    return [...grouped.entries()];
  }, [changes]);

  if (changes.length === 0) return <p className="mt-3 text-sm text-ink/75">No schedule edits yet.</p>;

  return (
    <ul data-testid="change-history" className="mt-3 space-y-4">
      {groups.map(([taskCode, entries]) => {
        const showAll = expanded.has(taskCode);
        const visible = showAll ? entries : entries.slice(0, 2);
        return (
          <li key={taskCode} className="border-[3px] border-ink bg-paper p-3">
            <h3 className="font-black">{taskCode}</h3>
            <ul className="mt-2 space-y-3 text-sm">
              {visible.map((change) => (
                <li key={change.id} className="border-t border-ink/30 pt-2">
                  <p>{buildHistoryLine(taskCode, getChanges(change.changes), change.actorName, change.createdAt).replace(`${taskCode} · `, "")}</p>
                  {change.reason ? <p className="mt-1 text-ink/75">Reason: {change.reason}</p> : null}
                </li>
              ))}
            </ul>
            {entries.length > 2 ? (
              <button
                type="button"
                data-testid={`history-more-${taskCode}`}
                aria-expanded={showAll}
                onClick={() => setExpanded((current) => {
                  const next = new Set(current);
                  if (next.has(taskCode)) next.delete(taskCode);
                  else next.add(taskCode);
                  return next;
                })}
                className="mt-3 underline decoration-2 underline-offset-2"
              >
                {showAll ? "Show less" : `Show ${entries.length - 2} more`}
              </button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
