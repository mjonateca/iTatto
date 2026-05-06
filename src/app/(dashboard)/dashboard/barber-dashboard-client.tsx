"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, Camera, Clock, Scissors, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { formatCurrency, formatTime } from "@/lib/utils";
import type { Barber, BookingStatus, Service, Shop } from "@/types/database";

type BarberBooking = {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  status: BookingStatus;
  clients: { name: string; phone: string | null; whatsapp: string | null } | null;
  shops: { name: string; slug: string } | null;
  services: { name: string; price: number; currency: string } | null;
};

type BarberWithShop = Barber & { shops?: Shop | null; barber_services?: Array<{ service_id: string }> };
type BarberTab = "summary" | "bookings" | "clients" | "profile";

interface Props {
  barber: BarberWithShop;
  services: Service[];
  todayBookings: BarberBooking[];
  upcomingBookings: BarberBooking[];
  expectedToday: number;
  initialTab?: string;
}

const STATUS_LABELS: Record<BookingStatus, string> = {
  pending: "Pendiente",
  confirmed: "Confirmada",
  rescheduled: "Reprogramada",
  completed: "Completada",
  no_show: "No se presentó",
  cancelled: "Cancelada",
};

const barberTabs: Array<{ id: BarberTab; label: string }> = [
  { id: "summary", label: "Hoy" },
  { id: "bookings", label: "Turnos" },
  { id: "clients", label: "Clientes" },
  { id: "profile", label: "Perfil" },
];

export default function BarberDashboardClient({
  barber,
  services,
  todayBookings,
  upcomingBookings,
  expectedToday,
  initialTab = "summary",
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentTab = (searchParams.get("tab") || initialTab) as BarberTab;
  const [profile, setProfile] = useState(barber);
  const [saving, setSaving] = useState(false);

  const clientRows = useMemo(
    () =>
      [...todayBookings, ...upcomingBookings].reduce<Array<{ name: string; phone: string; source: string }>>((acc, booking) => {
        const name = booking.clients?.name;
        if (!name || acc.some((item) => item.name === name)) return acc;
        acc.push({
          name,
          phone: booking.clients?.phone || booking.clients?.whatsapp || "Sin teléfono",
          source: `${booking.services?.name || "Servicio"} · ${booking.date}`,
        });
        return acc;
      }, []),
    [todayBookings, upcomingBookings]
  );

  function goToTab(tab: BarberTab) {
    router.push(`/dashboard?tab=${tab}`);
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/barber/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        display_name: form.get("display_name"),
        specialty: form.get("specialty"),
        bio: form.get("bio"),
        avatar_url: form.get("avatar_url"),
      }),
    });
    const payload = await response.json().catch(() => ({}));
    setSaving(false);

    if (!response.ok) {
      toast({ variant: "destructive", title: "No se guardó el perfil", description: payload.error });
      return;
    }

    setProfile(payload);
    toast({ title: "Perfil actualizado" });
  }

  return (
    <div className="max-w-6xl p-4 md:p-8">
      <div className="mb-7">
        <p className="text-sm text-muted-foreground">Vista tatuador</p>
        <h1 className="text-2xl font-bold">{profile.display_name}</h1>
        <p className="text-muted-foreground">
          {profile.shops?.name ? `Trabajando en ${profile.shops.name}` : "Tatuador independiente o pendiente de vinculación"}
        </p>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <Metric title="Turnos hoy" value={todayBookings.length} icon={Clock} />
        <Metric title="Próximos turnos" value={upcomingBookings.length} icon={CalendarDays} />
        <Metric title="Clientes hoy" value={new Set(todayBookings.map((booking) => booking.clients?.name).filter(Boolean)).size} icon={Users} />
        <Metric title="Estimado hoy" value={formatCurrency(expectedToday)} icon={Scissors} />
      </div>

      <div className="mb-6 flex gap-2 overflow-x-auto pb-2">
        {barberTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => goToTab(tab.id)}
            className={`rounded-lg border px-3 py-2 text-sm font-medium whitespace-nowrap ${
              currentTab === tab.id ? "border-primary bg-primary text-white" : "bg-background"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {currentTab === "summary" && (
        <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle>Turnos de hoy</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {todayBookings.length === 0 ? (
                <p className="text-sm text-muted-foreground">No tienes turnos para hoy.</p>
              ) : (
                todayBookings.map((booking) => <BookingRow key={booking.id} booking={booking} />)
              )}
            </CardContent>
          </Card>

          <Card className="shadow-none">
            <CardHeader>
              <CardTitle>Servicios asignados</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {services.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aún no tienes servicios asignados.</p>
              ) : (
                services.map((service) => (
                  <div key={service.id} className="rounded-lg border p-4">
                    <p className="font-medium">{service.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {service.duration_min} min · {formatCurrency(service.price, service.currency)}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {currentTab === "bookings" && (
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>Próximos turnos</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {upcomingBookings.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay turnos próximos.</p>
            ) : (
              upcomingBookings.map((booking) => <BookingRow key={booking.id} booking={booking} />)
            )}
          </CardContent>
        </Card>
      )}

      {currentTab === "clients" && (
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>Clientes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {clientRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todavía no tienes clientes registrados en tus turnos.</p>
            ) : (
              clientRows.map((client) => (
                <div key={client.name} className="rounded-lg border p-4">
                  <p className="font-medium">{client.name}</p>
                  <p className="text-sm text-muted-foreground">{client.phone}</p>
                  <p className="text-xs text-muted-foreground">{client.source}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      {currentTab === "profile" && (
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>Mi perfil público</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={saveProfile} className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="display_name">Nombre público</Label>
                <Input id="display_name" name="display_name" defaultValue={profile.display_name} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="specialty">Especialidad</Label>
                <Input id="specialty" name="specialty" defaultValue={profile.specialty || ""} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="avatar_url">Foto</Label>
                <Input id="avatar_url" name="avatar_url" placeholder="URL de la foto" defaultValue={profile.avatar_url || ""} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="bio">Bio</Label>
                <textarea
                  id="bio"
                  name="bio"
                  className="min-h-[88px] w-full rounded-md border bg-background px-3 py-2 text-sm"
                  defaultValue={profile.bio || ""}
                />
              </div>
              {profile.shops?.slug && (
                <Button asChild variant="outline" className="w-full">
                  <Link href={`/${profile.shops.slug}`}>Ver mi estudio de tatuajes</Link>
                </Button>
              )}
              <Button type="submit" className="w-full" disabled={saving}>
                <Camera className="mr-2 h-4 w-4" />
                {saving ? "Guardando..." : "Guardar perfil"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Toaster />
    </div>
  );
}

function BookingRow({ booking }: { booking: BarberBooking }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{booking.clients?.name || "Cliente"}</p>
          <p className="text-sm text-muted-foreground">
            {booking.date} · {formatTime(booking.start_time.slice(0, 5))}
          </p>
          <p className="text-sm text-muted-foreground">{booking.services?.name}</p>
        </div>
        <span className="rounded-md bg-muted px-2 py-1 text-xs">{STATUS_LABELS[booking.status]}</span>
      </div>
      {booking.shops?.slug && (
        <Link href={`/${booking.shops.slug}`} className="mt-2 inline-block text-xs text-primary hover:underline">
          Ver estudio de tatuajes
        </Link>
      )}
    </div>
  );
}

function Metric({ title, value, icon: Icon }: { title: string; value: number | string; icon: typeof Clock }) {
  return (
    <Card className="shadow-none">
      <CardContent className="flex items-center gap-3 p-4">
        <div className="rounded-lg bg-primary/10 p-2">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{title}</p>
        </div>
      </CardContent>
    </Card>
  );
}
