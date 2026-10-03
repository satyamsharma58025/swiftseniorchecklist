import { getServerSession } from "next-auth/next";

import { authOptions } from "@/auth";
import { AppNavigation } from "@/components/AppNavigation";
import { TopMarquee } from "@/components/TopMarquee";
import { istDateKey } from "@/lib/dates";
import { canAccessManageMenu } from "@/lib/route-access";

export async function AppNav() {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role ?? null;

  return (
    <>
      <TopMarquee />
      <AppNavigation
        date={istDateKey()}
        signedIn={Boolean(session)}
        canManage={canAccessManageMenu(role)}
        userLabel={session?.user?.name ?? session?.user?.email ?? "Account"}
      />
    </>
  );
}