import { getServerSession } from "next-auth/next";

import { authOptions } from "@/auth";
import { AppNavigation } from "@/components/AppNavigation";
import { istDateKey } from "@/lib/dates";

export async function AppNav() {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role ?? null;
  const canManage = role === "MANAGER" || role === "SENIOR";

  return (
    <AppNavigation
      date={istDateKey()}
      signedIn={Boolean(session)}
      canManage={canManage}
      userLabel={session?.user?.name ?? session?.user?.email ?? "Account"}
    />
  );
}