"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Scissors, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import type { AccountRole } from "@/types/database";

const ROLE_LABELS: Record<AccountRole, string> = {
  client: "cliente",
  barber: "artista",
  shop_owner: "estudio",
};

export default function BookingRoleNotice({ role, shopSlug }: { role: AccountRole; shopSlug: string }) {
  const router = useRouter();

  async function signOutAndLogin() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push(`/login?redirect=${encodeURIComponent(`/${shopSlug}/reservar`)}`);
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-[hsl(var(--muted))] px-4 py-10">
      <Card className="mx-auto max-w-md overflow-hidden border-none">
        <div className="bg-[hsl(var(--foreground))] px-6 py-7 text-white">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-white/12">
            <Scissors className="h-6 w-6" />
          </div>
          <p className="text-sm text-white/70">Reserva de cita</p>
          <h1 className="mt-1 text-2xl font-bold">Necesitas una cuenta cliente</h1>
        </div>
        <CardContent className="space-y-4 p-6">
          <p className="text-sm text-muted-foreground">
            Ahora mismo estás usando una sesión de {ROLE_LABELS[role]}. Esa vista sirve para gestionar operación, no para crear
            reservas como cliente.
          </p>
          <div className="rounded-lg border bg-muted/60 p-4">
            <div className="flex items-start gap-3">
              <UserRound className="mt-0.5 h-5 w-5 text-primary" />
              <p className="text-sm">Cierra esta sesión e inicia con una cuenta cliente para reservar y evaluar artistas.</p>
            </div>
          </div>
          <div className="grid gap-2">
            <Button type="button" onClick={signOutAndLogin}>
              Cerrar sesión y entrar como cliente
            </Button>
            <Button asChild variant="outline">
              <Link href="/register">Crear cuenta cliente</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/">Ir a inicio</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/dashboard?tab=summary">Volver a mi panel</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
