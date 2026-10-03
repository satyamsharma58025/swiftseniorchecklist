import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function PageEmptyState({
  title,
  description,
  href,
  actionLabel,
}: {
  title: string;
  description: string;
  href: string;
  actionLabel: string;
}) {
  return (
    <div className="neo-border bg-paper p-5 text-ink">
      <h2 className="text-base font-bold">{title}</h2>
      <p className="mt-2 text-sm text-ink/75">{description}</p>
      <Link href={href} className="neo-press mt-4 inline-flex min-h-11 items-center gap-2 border-[3px] border-ink bg-electric-lime px-4 py-2 text-sm font-bold text-ink">
        {actionLabel}
        <ArrowRight aria-hidden="true" size={18} strokeWidth={2.5} />
      </Link>
    </div>
  );
}