"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { MapPin, Phone, Star, Clock, Scissors, Home, ExternalLink } from "lucide-react";
import { buildMapsEmbedUrl, formatCurrency, normalizeMapsUrl } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { AccountRole, Shop, Barber, Service } from "@/types/database";

interface BarberWithServices extends Barber {
  barber_services: Array<{ service_id: string }>;
}

interface ShopWithRelations extends Shop {
  barbers: BarberWithServices[];
  services: Service[];
}

interface Props {
  shop: ShopWithRelations;
  viewerRole?: AccountRole | null;
}

export default function ShopPublicView({ shop, viewerRole }: Props) {
  const [selectedBarber, setSelectedBarber] = useState<string | null>(null);

  const activeServices = shop.services.filter((s) => s.is_active && s.is_visible !== false);
  const activeBarbers = shop.barbers.filter((barber) => barber.is_active !== false);
  const selectedBarberData = selectedBarber
    ? activeBarbers.find((barber) => barber.id === selectedBarber) || null
    : null;

  function getBarberServices(barber: BarberWithServices): Service[] {
    const serviceIds = new Set(barber.barber_services.map((bs) => bs.service_id));
    if (serviceIds.size === 0) return activeServices; // ofrece todos si no hay filtro
    return activeServices.filter((s) => serviceIds.has(s.id));
  }

  const locationQuery = [shop.address, shop.city, shop.country_name].filter(Boolean).join(", ");
  const mapsEmbedSrc = buildMapsEmbedUrl(shop.maps_url, locationQuery || null);
  const mapsExternalUrl = normalizeMapsUrl(shop.maps_url) || null;

  return (
    <div className="min-h-screen bg-[hsl(var(--muted))]">
      {/* Header de la estudio de tatuajes */}
      <div className="relative overflow-hidden bg-[hsl(var(--foreground))] text-white">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              shop.banner_url ? `url('${shop.banner_url}')` : "url('https://images.unsplash.com/photo-1517832606299-7ae9b720a186?auto=format&fit=crop&w=1200&q=80')",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div className="relative mx-auto max-w-3xl px-4 pb-9 pt-10">
          <div className="mb-6 flex justify-end gap-2">
            <Button asChild variant="outline" className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white">
              <Link href="/">
                <Home className="mr-2 h-4 w-4" />
                Inicio
              </Link>
            </Button>
            {viewerRole && (
              <Button asChild variant="outline" className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white">
                <Link href="/dashboard?tab=summary">Mi panel</Link>
              </Button>
            )}
          </div>
          <div className="flex items-start gap-4">
            {shop.logo_url ? (
              <Image
                src={shop.logo_url}
                alt={shop.name}
                width={72}
                height={72}
                className="rounded-lg object-cover"
              />
            ) : (
              <div className="flex h-[72px] w-[72px] items-center justify-center rounded-lg bg-white/12">
                <Scissors className="h-8 w-8 text-primary" />
              </div>
            )}
            <div>
              <h1 className="text-2xl font-bold">{shop.name}</h1>
              {shop.address && (
                <p className="flex items-center gap-1.5 text-sm text-zinc-300 mt-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {shop.address}
                  {mapsExternalUrl && (
                    <a href={mapsExternalUrl} target="_blank" rel="noopener noreferrer" className="ml-1 inline-flex items-center gap-0.5 underline underline-offset-2 hover:text-white">
                      Ver mapa <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </p>
              )}
              {!shop.address && mapsExternalUrl && (
                <a href={mapsExternalUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-zinc-300 mt-1 hover:text-white">
                  <MapPin className="h-3.5 w-3.5" />
                  Ver ubicación en Google Maps <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {shop.phone && (
                <p className="flex items-center gap-1.5 text-sm text-zinc-300 mt-0.5">
                  <Phone className="h-3.5 w-3.5" />
                  {shop.phone}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-6 space-y-8">
        {/* Tatuadors */}
        {activeBarbers.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold mb-4">Nuestros tatuadors</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {activeBarbers.map((barber) => (
                <button
                  key={barber.id}
                  onClick={() =>
                    setSelectedBarber(
                      selectedBarber === barber.id ? null : barber.id
                    )
                  }
                  className={`rounded-lg border bg-background p-4 text-left transition-all ${
                    selectedBarber === barber.id
                      ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                      : "border-border hover:border-primary/40"
                  }`}
                >
                  <div className="relative w-20 h-20 rounded-xl bg-muted flex items-center justify-center mb-3 overflow-hidden">
                    {barber.avatar_url ? (
                      <Image
                        src={barber.avatar_url}
                        alt={barber.display_name}
                        width={80}
                        height={80}
                        className="object-cover w-full h-full"
                      />
                    ) : (
                      <span className="text-2xl font-bold text-muted-foreground">
                        {barber.display_name[0].toUpperCase()}
                      </span>
                    )}
                    {barber.rating > 0 && (
                      <span className="absolute bottom-1 right-1 flex items-center gap-0.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white leading-none">
                        <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
                        {barber.rating.toFixed(1)}
                      </span>
                    )}
                  </div>
                  <p className="font-medium text-sm leading-tight">
                    {barber.display_name}
                  </p>
                  {barber.specialty && (
                    <p className="mt-1 text-xs text-primary">{barber.specialty}</p>
                  )}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Servicios */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Servicios</h2>
          <div className="space-y-2">
            {(selectedBarberData
              ? getBarberServices(selectedBarberData)
              : activeServices
            ).map((service) => (
              <Card key={service.id} className="border-none shadow-none">
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium">{service.name}</p>
                    {service.description && (
                      <p className="mt-1 max-w-md text-xs text-muted-foreground line-clamp-2">
                        {service.description}
                      </p>
                    )}
                    <p className="flex items-center gap-1.5 text-sm text-muted-foreground mt-0.5">
                      <Clock className="h-3.5 w-3.5" />
                      {service.duration_min} min
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-primary">
                      {formatCurrency(service.price, service.currency)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
            {activeServices.length === 0 && (
              <Card className="border-none shadow-none">
                <CardContent className="p-4 text-sm text-muted-foreground">
                  Esta estudio de tatuajes aún no tiene servicios activos.
                </CardContent>
              </Card>
            )}
          </div>
        </section>

        {/* Mapa */}
        {mapsEmbedSrc && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Ubicación</h2>
              {mapsExternalUrl && (
                <a
                  href={mapsExternalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Abrir en Google Maps
                </a>
              )}
            </div>
            <div className="overflow-hidden rounded-xl border shadow-sm">
              <iframe
                src={mapsEmbedSrc}
                width="100%"
                height="300"
                style={{ border: 0 }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                title="Ubicación de la estudio de tatuajes"
              />
            </div>
            {shop.address && (
              <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                {shop.address}
              </p>
            )}
          </section>
        )}

        {/* CTA Reservar */}
        <div className="pb-8">
          <Button asChild size="lg" className="w-full text-base h-14 shadow-lg">
            <Link
              href={
                selectedBarber
                  ? `/${shop.slug}/reservar?barber=${selectedBarber}`
                  : `/${shop.slug}/reservar`
              }
            >
              {selectedBarber ? "Reservar con este tatuador" : "Reservar cita"}
            </Link>
          </Button>

          {viewerRole && viewerRole !== "client" && (
            <p className="mt-3 rounded-lg border bg-background p-3 text-center text-xs text-muted-foreground">
              Estás viendo esta página como {viewerRole === "barber" ? "tatuador" : "estudio de tatuajes"}.
              Para reservar, usa una cuenta cliente.
            </p>
          )}

          {shop.deposit_required && shop.deposit_amount > 0 && (
            <p className="text-xs text-center text-muted-foreground mt-3">
              Se requiere depósito de {formatCurrency(shop.deposit_amount, shop.currency || "USD")} al reservar
            </p>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t bg-background py-4 text-center text-xs text-muted-foreground">
        Powered by{" "}
        <Link href="/" className="text-primary font-medium">
          iTatto
        </Link>
      </footer>
    </div>
  );
}
