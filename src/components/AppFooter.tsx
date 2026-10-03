export function AppFooter({ lastSyncAt }: { lastSyncAt?: string | null }) {
  if (!lastSyncAt) return null;

  return (
    <footer className="mx-auto w-full max-w-screen-2xl border-t-[3px] border-ink px-3 py-3 text-xs font-semibold text-ink/70 md:px-6">
      Last daily sync: <time dateTime={lastSyncAt}>{lastSyncAt}</time>
    </footer>
  );
}