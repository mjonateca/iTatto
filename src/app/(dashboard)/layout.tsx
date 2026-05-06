import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ensureAccountRecords } from "@/lib/account-repair";
import { createClient } from "@/lib/supabase/server";
import { IS_DEMO } from "@/lib/demo-data";
import DashboardNav from "@/components/layout/dashboard-nav";
import type { AccountRole } from "@/types/database";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let role: AccountRole = "shop_owner";

  if (!IS_DEMO) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const account = await ensureAccountRecords(user);
    role = account.role;
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <Suspense fallback={null}>
        <DashboardNav role={role} />
      </Suspense>
      <main className="pb-20 md:pb-0 md:ml-60">
        {children}
      </main>
    </div>
  );
}
