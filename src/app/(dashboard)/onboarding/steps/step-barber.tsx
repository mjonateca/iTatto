"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { getCitiesForCountry, getCountryName, getCurrencyForCountry } from "@/lib/locations";
import { buildAppUrl } from "@/lib/utils";
import type { OnboardingData } from "../onboarding-wizard";

const APP_BUSINESS_TYPE = "tattoo";

const schema = z.object({
  artistName: z.string().min(2, "Nombre requerido"),
  artistBio: z.string().max(200, "Máximo 200 caracteres").optional(),
});

type FormData = z.infer<typeof schema>;

interface Props {
  data: Partial<OnboardingData>;
  onUpdate: (d: Partial<OnboardingData>) => void;
  onBack: () => void;
  onComplete: (slug: string) => void;
  userId: string;
}

export default function StepBarber({ data, onBack, onComplete, userId }: Props) {
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      artistName: data.artistName || "",
      artistBio: data.artistBio || "",
    },
  });

  async function onSubmit(formData: FormData) {
    setLoading(true);

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.startsWith("http")) {
      await new Promise((r) => setTimeout(r, 800));
      toast({ title: "¡Estudio creado! (demo)", description: buildAppUrl("/ink-studio") + " ya está listo" });
      onComplete("ink-studio");
      return;
    }

    const supabase = createClient();

    const targetCountryCode = data.countryCode || "US";
    const targetCountryName = data.countryName || getCountryName(targetCountryCode);
    const targetCity = data.city || getCitiesForCountry(targetCountryCode)[0] || "New York";

    try {
      let { data: shop, error: shopError } = await supabase
        .from("shops")
        .insert({
          owner_id: userId,
          name: data.shopName!,
          slug: data.slug!,
          business_type: APP_BUSINESS_TYPE,
          phone: data.phone || null,
          whatsapp: data.phone || null,
          address: data.address || null,
          country_code: targetCountryCode,
          country_name: targetCountryName,
          city: targetCity,
          currency: data.currency || getCurrencyForCountry(targetCountryCode).currency,
          description: data.description || null,
          opening_hours: {
            lunes:     { open: "09:00", close: "19:00", closed: false },
            martes:    { open: "09:00", close: "19:00", closed: false },
            miercoles: { open: "09:00", close: "19:00", closed: false },
            jueves:    { open: "09:00", close: "19:00", closed: false },
            viernes:   { open: "09:00", close: "19:00", closed: false },
            sabado:    { open: "09:00", close: "17:00", closed: false },
            domingo:   { open: "09:00", close: "13:00", closed: true },
          },
        })
        .select()
        .single();

      if (shopError && /country_code|country_name|city|description|whatsapp|currency|business_type/.test(shopError.message)) {
        const fallback = await supabase
          .from("shops")
          .insert({
            owner_id: userId,
            name: data.shopName!,
            slug: data.slug!,
            business_type: APP_BUSINESS_TYPE,
            phone: data.phone || null,
            address: data.address || null,
            opening_hours: {
              lunes:     { open: "09:00", close: "19:00", closed: false },
              martes:    { open: "09:00", close: "19:00", closed: false },
              miercoles: { open: "09:00", close: "19:00", closed: false },
              jueves:    { open: "09:00", close: "19:00", closed: false },
              viernes:   { open: "09:00", close: "19:00", closed: false },
              sabado:    { open: "09:00", close: "17:00", closed: false },
              domingo:   { open: "09:00", close: "13:00", closed: true },
            },
          })
          .select()
          .single();
        shop = fallback.data;
        shopError = fallback.error;
      }

      if (shopError) throw shopError;

      if (data.services && data.services.length > 0) {
        let { error: svcError } = await supabase
          .from("services")
          .insert(
            data.services.map((s) => ({
              shop_id: shop.id,
              name: s.name,
              duration_min: s.duration_min,
              price: s.price,
              currency: shop.currency || "USD",
              description: null,
              category: "General",
              is_visible: true,
            }))
          );
        if (svcError && /description|category|is_visible/.test(svcError.message)) {
          const fallback = await supabase
            .from("services")
            .insert(
              data.services.map((s) => ({
                shop_id: shop.id,
                name: s.name,
                duration_min: s.duration_min,
                price: s.price,
                currency: shop.currency || "USD",
              }))
            );
          svcError = fallback.error;
        }
        if (svcError) throw svcError;
      }

      let { error: barberError } = await supabase
        .from("barbers")
        .insert({
          user_id: userId,
          shop_id: shop.id,
          display_name: formData.artistName,
          bio: formData.artistBio || null,
          specialty: null,
          is_active: true,
          is_independent: false,
        });

      if (barberError && /specialty|is_active/.test(barberError.message)) {
        const fallback = await supabase
          .from("barbers")
          .insert({
            user_id: userId,
            shop_id: shop.id,
            display_name: formData.artistName,
            bio: formData.artistBio || null,
            is_independent: false,
          });
        barberError = fallback.error;
      }

      if (barberError) throw barberError;

      toast({
        title: "¡Estudio creado!",
        description: `${buildAppUrl(`/${shop.slug}`)} ya está listo`,
      });

      onComplete(shop.slug);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Error desconocido";
      toast({
        variant: "destructive",
        title: "Error al crear el estudio",
        description: msg,
      });
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3 mb-1">
          <div className="bg-primary/10 rounded-xl p-2.5">
            <User className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle>Tu perfil de artista</CardTitle>
            <CardDescription>Cómo te verán tus clientes</CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="artistName">Tu nombre como artista *</Label>
            <Input
              id="artistName"
              placeholder="Ej: Laura Ink"
              {...register("artistName")}
            />
            {errors.artistName && (
              <p className="text-xs text-destructive">{errors.artistName.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="artistBio">
              Bio corta{" "}
              <span className="text-muted-foreground font-normal">(opcional)</span>
            </Label>
            <textarea
              id="artistBio"
              className="flex min-h-[80px] w-full rounded-xl border border-input bg-background px-4 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
              placeholder="Especialista en fine line, blackwork, realismo o diseño personalizado..."
              maxLength={200}
              {...register("artistBio")}
            />
            {errors.artistBio && (
              <p className="text-xs text-destructive">{errors.artistBio.message}</p>
            )}
          </div>

          <div className="rounded-xl bg-muted/40 p-4 space-y-2 text-sm">
            <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
              Resumen
            </p>
            <p>
              <span className="text-muted-foreground">Estudio:</span>{" "}
              <strong>{data.shopName}</strong>
            </p>
            <p>
              <span className="text-muted-foreground">URL:</span>{" "}
              <strong>{buildAppUrl(`/${data.slug}`)}</strong>
            </p>
            <p>
              <span className="text-muted-foreground">Servicios:</span>{" "}
              <strong>{data.services?.length || 0} configurados</strong>
            </p>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" type="button" onClick={onBack} className="flex-1">
              ← Volver
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creando...</>
              ) : (
                "🎉 Crear estudio"
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
