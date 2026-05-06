"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Calendar, Clock, LayoutDashboard, LogOut, Mail, Scissors, Settings, UserRound, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { AccountRole } from "@/types/database";

type NavItem = {
  tab: string;
  label: string;
  icon: typeof LayoutDashboard;
};

const shopNavItems: NavItem[] = [
  { tab: "summary", label: "Resumen", icon: LayoutDashboard },
  { tab: "bookings", label: "Reservas", icon: Calendar },
  { tab: "services", label: "Servicios", icon: Scissors },
  { tab: "barbers", label: "Tatuadors", icon: UserRound },
  { tab: "clients", label: "Clientes", icon: Users },
  { tab: "schedule", label: "Horarios", icon: Clock },
  { tab: "notifications", label: "Avisos", icon: Mail },
  { tab: "settings", label: "Ajustes", icon: Settings },
];

const clientNavItems: NavItem[] = [
  { tab: "summary", label: "Cerca de mí", icon: LayoutDashboard },
  { tab: "bookings", label: "Reservas", icon: Calendar },
  { tab: "favorites", label: "Favoritos", icon: Mail },
  { tab: "profile", label: "Perfil", icon: UserRound },
];

const barberNavItems: NavItem[] = [
  { tab: "summary", label: "Hoy", icon: LayoutDashboard },
  { tab: "bookings", label: "Turnos", icon: Calendar },
  { tab: "clients", label: "Clientes", icon: Users },
  { tab: "profile", label: "Perfil", icon: UserRound },
];

function tabHref(tab: string) {
  return `/dashboard?tab=${tab}`;
}

export default function DashboardNav({ role = "shop_owner" }: { role?: AccountRole }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const navItems = role === "client" ? clientNavItems : role === "barber" ? barberNavItems : shopNavItems;
  const activeTab = searchParams.get("tab") || "summary";

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <>
      <aside className="fixed left-0 top-0 hidden h-full w-60 flex-col border-r bg-background md:flex">
        <div className="border-b p-6">
          <Link href={tabHref("summary")} className="flex items-center gap-2">
            <div className="rounded-xl bg-primary p-2">
              <Scissors className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-bold">iTatto</span>
          </Link>
        </div>

        <nav className="flex-1 space-y-1 p-4">
          {navItems.map((item) => (
            <Link
              key={item.tab}
              href={tabHref(item.tab)}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                pathname === "/dashboard" && activeTab === item.tab
                  ? "bg-primary text-white"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon className="h-4.5 w-4.5" />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="border-t p-4">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background px-2 py-2 md:hidden">
        <div className="flex items-center justify-around">
          {navItems.map((item) => (
            <Link
              key={item.tab}
              href={tabHref(item.tab)}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-xl px-4 py-1.5 text-xs font-medium transition-colors",
                pathname === "/dashboard" && activeTab === item.tab ? "text-primary" : "text-muted-foreground"
              )}
            >
              <item.icon className={cn("h-5 w-5", pathname === "/dashboard" && activeTab === item.tab && "text-primary")} />
              {item.label}
            </Link>
          ))}
          <button
            onClick={handleLogout}
            className="flex flex-col items-center gap-0.5 rounded-xl px-4 py-1.5 text-xs font-medium text-muted-foreground"
          >
            <LogOut className="h-5 w-5" />
            Salir
          </button>
        </div>
      </nav>
    </>
  );
}
