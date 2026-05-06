"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, CreditCard, Heart, Loader2, MapPin, Star } from "lucide-react";
import { StripeElementsPanel } from "@/components/payments/stripe-elements-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { formatCurrency, formatTime } from "@/lib/utils";
import type { BookingStatus, Client, ClientPaymentMethod, PaymentStatus, Profile, Service, Shop } from "@/types/database";

type ListedShop = Shop & {
  barbers?: Array<{ id: string; display_name: string; rating: number | null }>;
  services?: Service[];
};

type ClientBooking = {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  status: BookingStatus;
  barber_id: string;
  shop_id: string;
  service_id: string;
  payment_status: PaymentStatus;
  payment_required: boolean;
  payment_amount: number;
  payment_currency: string;
  paid_at: string | null;
  shops: { name: string; slug: string } | null;
  barbers: { display_name: string } | null;
  services: { name: string; price: number; currency: string } | null;
  reviews?: Array<{ id: string }>;
};

type ClientTab = "summary" | "bookings" | "favorites" | "profile";

interface Props {
  profile: Profile;
  client: Client;
  shops: ListedShop[];
  favoriteShopIds: string[];
  favoriteBarberIds: string[];
  bookings: ClientBooking[];
  paymentMethods: ClientPaymentMethod[];
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

const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: "Pendiente de pago",
  paid: "Pagada",
  failed: "Pago fallido",
  refunded: "Reembolsada",
};

const clientTabs: Array<{ id: ClientTab; label: string }> = [
  { id: "summary", label: "Cerca de mí" },
  { id: "bookings", label: "Reservas" },
  { id: "favorites", label: "Favoritos" },
  { id: "profile", label: "Perfil" },
];

export default function ClientDashboardClient({
  profile,
  client,
  shops,
  favoriteShopIds,
  favoriteBarberIds,
  bookings,
  paymentMethods,
  initialTab = "summary",
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentTab = (searchParams.get("tab") || initialTab) as ClientTab;
  const [shopFavorites, setShopFavorites] = useState(new Set(favoriteShopIds));
  const [barberFavorites, setBarberFavorites] = useState(new Set(favoriteBarberIds));
  const [reviewedBookingIds, setReviewedBookingIds] = useState(
    new Set(bookings.filter((booking) => booking.reviews?.length).map((booking) => booking.id))
  );
  const [setupSecret, setSetupSecret] = useState<string | null>(null);
  const [paymentSecret, setPaymentSecret] = useState<string | null>(null);
  const [activePaymentBookingId, setActivePaymentBookingId] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const favoriteShops = useMemo(() => shops.filter((shop) => shopFavorites.has(shop.id)), [shopFavorites, shops]);
  const favoriteBarbers = useMemo(
    () =>
      shops.flatMap((shop) =>
        (shop.barbers || [])
          .filter((barber) => barberFavorites.has(barber.id))
          .map((barber) => ({ ...barber, shopName: shop.name, shopSlug: shop.slug }))
      ),
    [barberFavorites, shops]
  );

  function goToTab(tab: ClientTab) {
    router.push(`/dashboard?tab=${tab}`);
  }

  async function toggleFavorite(type: "shop" | "barber", id: string) {
    const current = type === "shop" ? shopFavorites : barberFavorites;
    const isFavorite = current.has(id);
    const response = await fetch(`/api/favorites/${type}`, {
      method: isFavorite ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(type === "shop" ? { shop_id: id } : { barber_id: id }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: "No se pudo actualizar favorito" }));
      toast({ variant: "destructive", title: "Error", description: payload.error });
      return;
    }

    const next = new Set(current);
    if (isFavorite) next.delete(id);
    else next.add(id);
    if (type === "shop") setShopFavorites(next);
    else setBarberFavorites(next);
  }

  async function submitReview(event: FormEvent<HTMLFormElement>, booking: ClientBooking) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        booking_id: booking.id,
        barber_id: booking.barber_id,
        rating: Number(form.get("rating")),
        comment: form.get("comment"),
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast({ variant: "destructive", title: "No se guardó la reseña", description: payload.error });
      return;
    }

    setReviewedBookingIds((prev) => new Set(prev).add(booking.id));
    toast({ title: "Reseña guardada" });
  }

  async function startAddCard() {
    setLoadingAction("setup");
    const response = await fetch("/api/payments/setup-intent", { method: "POST" });
    const payload = await response.json().catch(() => ({}));
    setLoadingAction(null);

    if (!response.ok) {
      toast({ variant: "destructive", title: "No se pudo preparar la tarjeta", description: payload.error || "Error inesperado" });
      return;
    }

    setSetupSecret(payload.clientSecret || null);
  }

  async function startBookingPayment(bookingId: string) {
    setLoadingAction(bookingId);
    const response = await fetch(`/api/payments/bookings/${bookingId}`, { method: "POST" });
    const payload = await response.json().catch(() => ({}));
    setLoadingAction(null);

    if (!response.ok) {
      toast({ variant: "destructive", title: "No se pudo preparar el pago", description: payload.error || "Error inesperado" });
      return;
    }

    setActivePaymentBookingId(bookingId);
    setPaymentSecret(payload.clientSecret || null);
  }

  return (
    <div className="max-w-6xl p-4 md:p-8">
      <div className="mb-7">
        <p className="text-sm text-muted-foreground">Vista cliente</p>
        <h1 className="text-2xl font-bold">{client.name || `${profile.first_name} ${profile.last_name || ""}`.trim()}</h1>
        <p className="text-muted-foreground">
          {profile.city} · {profile.country_name}
        </p>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <Metric title="Reservas" value={bookings.length} />
        <Metric title="Estudios de tatuajes favoritas" value={shopFavorites.size} />
        <Metric title="Tatuadors favoritos" value={barberFavorites.size} />
      </div>

      <div className="mb-6 flex gap-2 overflow-x-auto pb-2">
        {clientTabs.map((tab) => (
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
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>Estudios de tatuajes cerca de tu zona</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {shops.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay estudios de tatuajes activas en tu ciudad.</p>
            ) : (
              shops.map((shop) => (
                <div key={shop.id} className="rounded-lg border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-semibold">{shop.name}</h2>
                      <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5" />
                        {shop.city || "Sin ciudad"}
                      </p>
                    </div>
                    <button aria-label="Favorito" onClick={() => toggleFavorite("shop", shop.id)} className="rounded-md border p-2" type="button">
                      <Heart className={`h-4 w-4 ${shopFavorites.has(shop.id) ? "fill-primary text-primary" : ""}`} />
                    </button>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                    {shop.description || shop.address || "Agenda disponible."}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button asChild size="sm">
                      <Link href={`/${shop.slug}/reservar`}>Reservar</Link>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/${shop.slug}`}>Ver estudio de tatuajes</Link>
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      {currentTab === "bookings" && (
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>Mis reservas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {bookings.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aún no tienes reservas.</p>
            ) : (
              bookings.map((booking) => (
                <div key={booking.id} className="rounded-lg border p-4">
                  <p className="font-medium">{booking.shops?.name || "Estudio de tatuajes"}</p>
                  <p className="text-sm text-muted-foreground">
                    <CalendarDays className="mr-1 inline h-3.5 w-3.5" />
                    {booking.date} · {formatTime(booking.start_time.slice(0, 5))}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {booking.services?.name} · {booking.barbers?.display_name}
                  </p>
                  <p className="text-xs text-muted-foreground">{STATUS_LABELS[booking.status]}</p>
                  <p className="text-xs text-muted-foreground">
                    {PAYMENT_STATUS_LABELS[booking.payment_status]}
                    {booking.payment_amount > 0 ? ` · ${formatCurrency(booking.payment_amount, booking.payment_currency)}` : ""}
                  </p>

                  {booking.shops?.slug && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/${booking.shops.slug}`}>Ver estudio de tatuajes</Link>
                      </Button>
                      <Button asChild size="sm">
                        <Link href={`/${booking.shops.slug}/reservar?barber=${booking.barber_id}`}>Reservar otra</Link>
                      </Button>
                      {booking.payment_status !== "paid" && booking.status !== "cancelled" && (
                        <Button size="sm" variant="outline" onClick={() => startBookingPayment(booking.id)}>
                          {loadingAction === booking.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Pagar ahora"}
                        </Button>
                      )}
                    </div>
                  )}

                  {activePaymentBookingId === booking.id && paymentSecret && (
                    <div className="mt-4 rounded-lg border p-4">
                      <p className="mb-3 text-sm font-medium">Completa el pago de esta reserva</p>
                      <StripeElementsPanel
                        clientSecret={paymentSecret}
                        mode="payment"
                        buttonLabel="Confirmar pago"
                        onSuccess={() => {
                          toast({ title: "Pago procesado", description: "Estamos actualizando el estado de tu reserva." });
                          setActivePaymentBookingId(null);
                          setPaymentSecret(null);
                          router.refresh();
                        }}
                      />
                    </div>
                  )}

                  {booking.status === "completed" && !reviewedBookingIds.has(booking.id) && (
                    <form onSubmit={(event) => submitReview(event, booking)} className="mt-3 space-y-2">
                      <Label>Evaluar tatuador</Label>
                      <select name="rating" className="h-10 w-full rounded-md border bg-background px-3 text-sm" defaultValue="5">
                        {[5, 4, 3, 2, 1].map((rating) => (
                          <option key={rating} value={rating}>
                            {rating} estrellas
                          </option>
                        ))}
                      </select>
                      <textarea
                        name="comment"
                        className="min-h-[70px] w-full rounded-md border bg-background px-3 py-2 text-sm"
                        placeholder="Comentario opcional"
                      />
                      <Button size="sm" type="submit">
                        <Star className="mr-1 h-4 w-4" />
                        Guardar reseña
                      </Button>
                    </form>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      {currentTab === "favorites" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle>Estudios de tatuajes favoritas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {favoriteShops.length === 0 ? (
                <p className="text-sm text-muted-foreground">Todavía no has marcado estudios de tatuajes favoritas.</p>
              ) : (
                favoriteShops.map((shop) => (
                  <div key={shop.id} className="rounded-lg border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{shop.name}</p>
                        <p className="text-sm text-muted-foreground">{shop.city || "Sin ciudad"}</p>
                      </div>
                      <button type="button" onClick={() => toggleFavorite("shop", shop.id)} className="rounded-md border p-2">
                        <Heart className="h-4 w-4 fill-primary text-primary" />
                      </button>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/${shop.slug}`}>Ver estudio de tatuajes</Link>
                      </Button>
                      <Button asChild size="sm">
                        <Link href={`/${shop.slug}/reservar`}>Reservar</Link>
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="shadow-none">
            <CardHeader>
              <CardTitle>Tatuadors favoritos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {favoriteBarbers.length === 0 ? (
                <p className="text-sm text-muted-foreground">Todavía no has marcado tatuadors favoritos.</p>
              ) : (
                favoriteBarbers.map((barber) => (
                  <div key={barber.id} className="rounded-lg border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{barber.display_name}</p>
                        <p className="text-sm text-muted-foreground">{barber.shopName}</p>
                      </div>
                      <button type="button" onClick={() => toggleFavorite("barber", barber.id)} className="rounded-md border p-2">
                        <Heart className="h-4 w-4 fill-primary text-primary" />
                      </button>
                    </div>
                    <div className="mt-3">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/${barber.shopSlug}/reservar?barber=${barber.id}`}>Reservar con él</Link>
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {currentTab === "profile" && (
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>Mi perfil</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <ProfileItem label="Nombre" value={client.name || "Sin nombre"} />
            <ProfileItem label="Email" value={profile.email || "Sin email"} />
            <ProfileItem label="Teléfono" value={client.phone || client.whatsapp || profile.phone || "Sin teléfono"} />
            <ProfileItem label="Ubicación" value={`${profile.city}, ${profile.country_name}`} />
          </CardContent>
          <CardContent className="space-y-4 border-t pt-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-medium">Métodos de pago</p>
                <p className="text-sm text-muted-foreground">Guarda una tarjeta para pagar reservas online.</p>
              </div>
              <Button variant="outline" onClick={startAddCard}>
                {loadingAction === "setup" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
                Añadir tarjeta
              </Button>
            </div>

            {paymentMethods.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todavía no tienes tarjetas guardadas.</p>
            ) : (
              <div className="space-y-2">
                {paymentMethods.map((paymentMethod) => (
                  <div key={paymentMethod.id} className="rounded-lg border p-3 text-sm">
                    {paymentMethod.brand?.toUpperCase() || "Tarjeta"} terminada en {paymentMethod.last4 || "****"}
                    {paymentMethod.is_default ? " · Predeterminada" : ""}
                  </div>
                ))}
              </div>
            )}

            {setupSecret && (
              <div className="rounded-lg border p-4">
                <StripeElementsPanel
                  clientSecret={setupSecret}
                  mode="setup"
                  buttonLabel="Guardar tarjeta"
                  onSuccess={() => {
                    toast({ title: "Tarjeta guardada", description: "Ya puedes usarla para tus reservas." });
                    setSetupSecret(null);
                    router.refresh();
                  }}
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Toaster />
    </div>
  );
}

function Metric({ title, value }: { title: string; value: number }) {
  return (
    <Card className="shadow-none">
      <CardContent className="p-4">
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground">{title}</p>
      </CardContent>
    </Card>
  );
}

function ProfileItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}
