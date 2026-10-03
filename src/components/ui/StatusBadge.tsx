import { AlertTriangle, Check, Clock3, X } from "lucide-react";

export type ChecklistStatusBadgeValue = "DONE" | "PENDING" | "NOT_DONE" | "ESCALATED";

const statusPresentation: Record<ChecklistStatusBadgeValue, {
  label: string;
  className: string;
  Icon: typeof Check;
}> = {
  DONE: { label: "Done", className: "bg-brand-green text-ink", Icon: Check },
  PENDING: { label: "Pending", className: "bg-sun-yellow text-ink", Icon: Clock3 },
  NOT_DONE: { label: "Not done", className: "bg-hot-pink text-ink", Icon: X },
  ESCALATED: { label: "Escalated", className: "bg-ink text-paper", Icon: AlertTriangle },
};

export function StatusBadge({
  status,
  className = "",
}: {
  status: ChecklistStatusBadgeValue;
  className?: string;
}) {
  const presentation = statusPresentation[status];
  const Icon = presentation.Icon;

  return (
    <span className={`inline-flex min-h-8 items-center gap-1.5 border-[3px] border-ink px-2 py-1 text-xs font-bold leading-none ${presentation.className} ${className}`}>
      <Icon aria-hidden="true" size={16} strokeWidth={2.5} />
      <span>{presentation.label}</span>
    </span>
  );
}