"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { addDays, format, startOfDay } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowLeft, CheckCircle2, Clock, Home, Loader2, Scissors, Star, UserRound } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { formatCurrency, formatTime, getCurrentDateInTimeZone, getCurrentTimeInTimeZone, parseDateOnly } from "@/lib/utils";
import { getTimeZoneForCountry } from "@/lib/locations";
import type { Barber, Client, Service, Shop } from "@/types/database";

interface ShopWithRelations extends Shop {
  barbers: Array<Barber & { barber_services?: Array<{ service_id: string }> }>;
  services: Service[];
}

interface Props {
  shop: ShopWithRelations;
  client: Client;
  preselectedBarberId?: string;
}

type Step = "barber" | "service" | "datetime" | "confirm" | "success";
type BookedInterval = { start: string; end: string };
type OpeningHoursValue = Record<string, { open: string; close: string; closed: boolean }>;

function generateDates(timeZone: string, days = 14): Date[] {
  const startDate = startOfDay(parseDateOnly(getCurrentDateInTimeZone(timeZone)));
  return Array.from({ length: days }, (_, i) => addDays(startDate, i));
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(total: number) {
  const hours = Math.floor(total / 60)
    .toString()
    .padStart(2, "0");
  const minutes = (total % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

function ceilToHalfHour(total: number) {
  return Math.ceil(total / 30) * 30;
}

function floorToHalfHour(total: number) {
  return Math.floor(total / 30) * 30;
}

function intervalsOverlap(start: string, end: string, booked: BookedInterval) {
  return timeToMinutes(start) < timeToMinutes(booked.end) && timeToMinutes(end) > timeToMinutes(booked.start);
}

function defaultOpeningHours(): OpeningHoursValue {
  return {
    lunes: { open: "09:00", close: "19:00", closed: false },
    martes: { open: "09:00", close: "19:00", closed: false },
    miercoles: { open: "09:00", close: "19:00", closed: false },
    jueves: { open: "09:00", close: "19:00", closed: false },
    viernes: { open: "09:00", close: "19:00", closed: false },
    sabado: { open: "09:00", close: "17:00", closed: false },
    domingo: { open: "09:00", close: "13:00", closed: true },
  };
}

function normalizeOpeningHours(value: Shop["opening_hours"]): OpeningHoursValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaultOpeningHours();

  const fallback = defaultOpeningHours();
  const raw = value as Record<string, unknown>;
  const normalized: OpeningHoursValue = { ...fallback };

  for (const key of Object.keys(fallback)) {
    const current = raw[key];
    if (current && typeof current === "object" && !Array.isArray(current)) {
      const day = current as Record<string, unknown>;
      normalized[key] = {
        open: typeof day.open === "string" ? day.open : fallback[key].open,
        close: typeof day.close === "string" ? day.close : fallback[key].close,
        closed: typeof day.closed === "boolean" ? day.closed : fallback[key].closed,
      };
    }
  }

  return normalized;
}

function weekdayKey(date: Date) {
  return ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"][date.getDay()];
}

function buildSlots(date: Date, openingHours: OpeningHoursValue, duration = 30) {
  const dayConfig = openingHours[weekdayKey(date)];
  if (!dayConfig || dayConfig.closed) return [];

  const start = ceilToHalfHour(timeToMinutes(dayConfig.open));
  const end = floorToHalfHour(timeToMinutes(dayConfig.close));
  const slots: string[] = [];

  for (let minute = start; minute + duration <= end; minute += 30) {
    slots.push(minutesToTime(minute));
  }

  return slots;
}

export default function BookingFlow({ shop, client, preselectedBarberId }: Props) {
  const shopTimeZone = useMemo(() => getTimeZoneForCountry(shop.country_code || ""), [shop.country_code]);
  const activeBarbers = shop.barbers.filter((barber) => barber.is_active !== false);
  const openingHours = useMemo(() => normalizeOpeningHours(shop.opening_hours), [shop.opening_hours]);
  const preselectedBarber = preselectedBarberId ? activeBarbers.find((barber) => barber.id === preselectedBarberId) || null : null;

  const [step, setStep] = useState<Step>(preselectedBarber ? "service" : "barber");
  const [selectedBarber, setSelectedBarber] = useState<ShopWithRelations["barbers"][number] | null>(preselectedBarber);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [bookedSlots, setBookedSlots] = useState<BookedInterval[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const compatibleServiceIds = new Set(selectedBarber?.barber_services?.map((item) => item.service_id) || []);
  const activeServices = shop.services.filter(
    (service) => service.is_active && service.is_visible !== false && (!selectedBarber || compatibleServiceIds.size === 0 || compatibleServiceIds.has(service.id))
  );
  const dates = useMemo(() => generateDates(shopTimeZone, 14), [shopTimeZone]);
  const availableSlots = selectedDate ? buildSlots(selectedDate, openingHours, selectedService?.duration_min || 30) : [];
  const selectedDayConfig = selectedDate ? openingHours[weekdayKey(selectedDate)] : null;

  async function loadBookedSlots(barberId: string, date: Date) {
    setLoadingSlots(true);
    const dateStr = format(date, "yyyy-MM-dd");

    try {
      const response = await fetch(`/api/availability?barber_id=${barberId}&date=${dateStr}`);
      const payload = await response.json();
      setBookedSlots(response.ok ? payload.intervals || [] : []);
    } finally {
      setLoadingSlots(false);
    }
  }

  async function handleDateSelect(date: Date) {
    setSelectedDate(date);
    setSelectedTime(null);
    if (selectedBarber) {
      await loadBookedSlots(selectedBarber.id, date);
    }
    setStep("datetime");
  }

  async function handleConfirm() {
    if (!selectedBarber || !selectedService || !selectedDate || !selectedTime) return;
    setSubmitting(true);

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.startsWith("http")) {
      await new Promise((resolve) => setTimeout(resolve, 600));
      setStep("success");
      setSubmitting(false);
      return;
    }

    const dateStr = format(selectedDate, "yyyy-MM-dd");
    const [hours, minutes] = selectedTime.split(":").map(Number);
    const endTotal = hours * 60 + minutes + selectedService.duration_min;
    const endTime = minutesToTime(endTotal);

    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          barber_id: selectedBarber.id,
          shop_id: shop.id,
          service_id: selectedService.id,
          date: dateStr,
          start_time: `${selectedTime}:00`,
          end_time: `${endTime}:00`,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: "Error al reservar" }));
        toast({
          variant: "destructive",
          title: "Error al reservar",
          description: String(payload.error || "").includes("overlap")
            ? "Ese horario ya no está disponible, elige otro."
            : payload.error || "No se pudo crear la reserva.",
        });
        setSubmitting(false);
        return;
      }

      setStep("success");
    } catch {
      toast({
        variant: "destructive",
        title: "Error al reservar",
        description: "No se pudo conectar con el servidor. Inténtalo otra vez.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (step === "success") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[hsl(var(--muted))] px-4 text-center">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
          <CheckCircle2 className="h-11 w-11" />
        </div>
        <h1 className="mb-2 text-2xl font-bold">¡Reserva confirmada!</h1>
        <p className="mb-2 text-muted-foreground">
          <strong>{selectedService?.name}</strong> con <strong>{selectedBarber?.display_name}</strong>
        </p>
        <p className="mb-8 text-muted-foreground">
          {selectedDate && format(selectedDate, "EEEE d 'de' MMMM", { locale: es })} a las {selectedTime && formatTime(selectedTime)}
        </p>
        <div className="flex w-full max-w-xs flex-col gap-3">
          <Button asChild variant="outline" className="w-full">
            <Link href="/">Volver a inicio</Link>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link href={`/${shop.slug}`}>Volver a {shop.name}</Link>
          </Button>
          <Button asChild className="w-full">
            <Link href="/dashboard?tab=bookings">Ver mis reservas</Link>
          </Button>
        </div>
        <Toaster />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[hsl(var(--muted))]">
      <header className="relative overflow-hidden bg-[hsl(var(--foreground))] text-white">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: shop.banner_url
              ? `url('${shop.banner_url}')`
              : "url('https://images.unsplash.com/photo-1517832606299-7ae9b720a186?auto=format&fit=crop&w=1200&q=80')",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div className="relative mx-auto flex max-w-3xl items-center gap-3 px-4 py-5">
          <Button asChild variant="ghost" size="icon" className="text-white hover:bg-white/10 hover:text-white">
            <Link href={`/${shop.slug}`}>
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div className="flex-1">
            <p className="text-sm font-semibold">{shop.name}</p>
            <p className="text-xs text-white/70">
              {step === "barber" && "Elige tu artista"}
              {step === "service" && "Elige el servicio"}
              {step === "datetime" && "Elige fecha y hora"}
              {step === "confirm" && "Confirmar reserva"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="text-white hover:bg-white/10 hover:text-white">
              <Link href="/">
                <Home className="mr-2 h-4 w-4" />
                <span className="hidden sm:inline">Inicio</span>
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="text-white hover:bg-white/10 hover:text-white">
              <Link href="/dashboard?tab=bookings">
                <span className="hidden sm:inline">Mi panel</span>
                <span className="sm:hidden">Panel</span>
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="mb-5 grid grid-cols-4 gap-2">
          {(["barber", "service", "datetime", "confirm"] as Step[]).map((item, index) => (
            <div
              key={item}
              className={`h-1.5 rounded-full ${
                ["barber", "service", "datetime", "confirm"].indexOf(step) >= index ? "bg-primary" : "bg-border"
              }`}
            />
          ))}
        </div>

        {step === "barber" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">¿Con quién quieres tu cita?</h2>
            {activeBarbers.length === 0 ? (
              <div className="rounded-lg border bg-background p-4 text-sm text-muted-foreground">
                Esta estudio aún no tiene artistas activos para recibir reservas.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {activeBarbers.map((barber) => (
                  <button
                    key={barber.id}
                    onClick={() => {
                      setSelectedBarber(barber);
                      setStep("service");
                    }}
                    className="rounded-lg border bg-background p-4 text-left transition-colors hover:border-primary"
                    type="button"
                  >
                    <div className="relative mb-3 h-16 w-16 overflow-hidden rounded-xl bg-muted flex items-center justify-center">
                      {barber.avatar_url ? (
                        <Image src={barber.avatar_url} alt={barber.display_name} width={64} height={64} className="object-cover w-full h-full" />
                      ) : (
                        <UserRound className="h-7 w-7 text-muted-foreground" />
                      )}
                      {barber.rating > 0 && (
                        <span className="absolute bottom-0.5 right-0.5 flex items-center gap-0.5 rounded bg-black/60 px-1 py-0.5 text-[9px] font-semibold text-white leading-none">
                          <Star className="h-2 w-2 fill-amber-400 text-amber-400" />
                          {barber.rating.toFixed(1)}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium">{barber.display_name}</p>
                    {barber.specialty && <p className="mt-1 text-xs text-primary">{barber.specialty}</p>}
                    {barber.bio && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{barber.bio}</p>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {step === "service" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <button onClick={() => setStep("barber")} className="text-muted-foreground hover:text-foreground" type="button">
                <ArrowLeft className="h-4 w-4" />
              </button>
              <h2 className="text-lg font-semibold">¿Qué servicio quieres?</h2>
            </div>
            <div className="space-y-2">
              {activeServices.length === 0 && (
                <p className="rounded-lg border bg-background p-4 text-sm text-muted-foreground">
                  Este artista aún no tiene servicios asignados.
                </p>
              )}
              {activeServices.map((service) => (
                <button
                  key={service.id}
                  onClick={() => {
                    setSelectedService(service);
                    setSelectedTime(null);
                  }}
                  className={`flex w-full items-center justify-between rounded-lg border bg-background p-4 text-left transition-all ${
                    selectedService?.id === service.id ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "hover:border-primary/40"
                  }`}
                  type="button"
                >
                  <div>
                    <p className="font-medium">{service.name}</p>
                    {service.description && <p className="mt-1 max-w-[18rem] line-clamp-2 text-xs text-muted-foreground">{service.description}</p>}
                    <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      {service.duration_min} min
                    </p>
                  </div>
                  <p className="font-semibold text-primary">{formatCurrency(service.price, service.currency)}</p>
                </button>
              ))}
            </div>
            {selectedService && (
              <Button className="w-full" onClick={() => setStep("datetime")}>
                Elegir fecha y hora
              </Button>
            )}
          </div>
        )}

        {step === "datetime" && (
          <div className="space-y-5">
            <div className="flex items-center gap-2">
              <button onClick={() => setStep("service")} className="text-muted-foreground hover:text-foreground" type="button">
                <ArrowLeft className="h-4 w-4" />
              </button>
              <h2 className="text-lg font-semibold">Elige fecha</h2>
            </div>

            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2">
              {dates.map((date) => {
                const closed = openingHours[weekdayKey(date)]?.closed;
                return (
                  <button
                    key={date.toISOString()}
                    onClick={() => handleDateSelect(date)}
                    className={`min-w-[64px] flex-shrink-0 rounded-lg border p-3 text-center transition-all ${
                      selectedDate?.toDateString() === date.toDateString()
                        ? "border-primary bg-primary text-white"
                        : closed
                          ? "cursor-not-allowed opacity-40"
                          : "hover:border-primary/40"
                    }`}
                    disabled={closed}
                    type="button"
                  >
                    <p className="text-xs font-medium">{format(date, "EEE", { locale: es })}</p>
                    <p className="text-lg font-bold">{format(date, "d")}</p>
                    <p className="text-xs">{format(date, "MMM", { locale: es })}</p>
                  </button>
                );
              })}
            </div>

            {selectedDate && (
              <div>
                <h3 className="mb-3 font-medium">Horarios disponibles</h3>
                {selectedDayConfig?.closed ? (
                  <p className="rounded-lg border bg-background p-4 text-sm text-muted-foreground">La estudio está cerrada ese día.</p>
                ) : loadingSlots ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : availableSlots.length === 0 ? (
                  <p className="rounded-lg border bg-background p-4 text-sm text-muted-foreground">
                    No hay horarios configurados para este día.
                  </p>
                ) : (
                  <div className="grid grid-cols-4 gap-2">
                    {availableSlots.map((slot) => {
                      const duration = selectedService?.duration_min || 30;
                      const slotEnd = minutesToTime(timeToMinutes(slot) + duration);
                      const dateStr = selectedDate ? format(selectedDate, "yyyy-MM-dd") : "";
                      const todayStr = getCurrentDateInTimeZone(shopTimeZone);
                      const currentTime = getCurrentTimeInTimeZone(shopTimeZone);
                      const inPast = dateStr === todayStr && timeToMinutes(slot) <= timeToMinutes(currentTime);
                      const taken = inPast || bookedSlots.some((booked) => intervalsOverlap(slot, slotEnd, booked));

                      return (
                        <button
                          key={slot}
                          disabled={taken}
                          onClick={() => setSelectedTime(slot)}
                          className={`rounded-lg border bg-background py-2.5 text-sm font-medium transition-all ${
                            taken
                              ? "cursor-not-allowed bg-muted opacity-30"
                              : selectedTime === slot
                                ? "border-primary bg-primary text-white"
                                : "hover:border-primary/40"
                          }`}
                          type="button"
                        >
                          {formatTime(slot)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {selectedDate && selectedTime && (
              <Button className="w-full" onClick={() => setStep("confirm")}>
                Confirmar horario
              </Button>
            )}
          </div>
        )}

        {step === "confirm" && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold">Confirmar reserva</h2>

            <Card className="border-none">
              <CardContent className="space-y-4 p-5">
                <div className="flex items-center gap-3 border-b pb-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Scissors className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold">{shop.name}</p>
                    <p className="text-xs text-muted-foreground">{client.name}</p>
                  </div>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Artista</span>
                  <span className="font-medium">{selectedBarber?.display_name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Servicio</span>
                  <span className="font-medium">{selectedService?.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Fecha</span>
                  <span className="font-medium">{selectedDate && format(selectedDate, "EEEE d 'de' MMMM", { locale: es })}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Hora</span>
                  <span className="font-medium">{selectedTime && formatTime(selectedTime)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Duración</span>
                  <span className="font-medium">{selectedService?.duration_min} min</span>
                </div>
                <div className="flex justify-between border-t pt-3">
                  <span className="font-semibold">Total</span>
                  <span className="text-lg font-bold text-primary">
                    {selectedService && formatCurrency(selectedService.price, selectedService.currency)}
                  </span>
                </div>
                {shop.payments_enabled && (
                  <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                    {shop.online_payment_mode === "required"
                      ? "Esta estudio tiene pago online obligatorio. Después de reservar podrás completar el pago desde tu panel."
                      : "Esta estudio admite pago online. Después de reservar podrás pagar desde tu panel si quieres dejarla abonada."}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep("datetime")} className="flex-1">
                ← Cambiar
              </Button>
              <Button onClick={handleConfirm} disabled={submitting} className="flex-1">
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Reservando...
                  </>
                ) : (
                  "Confirmar reserva"
                )}
              </Button>
            </div>
          </div>
        )}
      </div>

      <Toaster />
    </div>
  );
}
