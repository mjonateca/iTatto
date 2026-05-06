"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Store, Globe } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getAppBaseUrl, slugify } from "@/lib/utils";
import { COUNTRIES, getCitiesForCountry, getCountryName, getCurrencyForCountry } from "@/lib/locations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { OnboardingData } from "../onboarding-wizard";

const schema = z.object({
  shopName: z.string().min(2, "Nombre requerido (mínimo 2 caracteres)"),
  slug: z
    .string()
    .min(3, "URL mínimo 3 caracteres")
    .max(50, "URL máximo 50 caracteres")
    .regex(/^[a-z0-9-]+$/, "Solo letras minúsculas, números y guiones"),
  phone: z.string().min(7, "Teléfono requerido"),
  address: z.string().min(5, "Dirección requerida"),
  countryCode: z.string().min(2, "País requerido"),
  city: z.string().min(2, "Ciudad requerida"),
  currency: z.string().min(3, "Divisa requerida"),
  description: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface Props {
  data: Partial<OnboardingData>;
  onUpdate: (d: Partial<OnboardingData>) => void;
  onNext: () => void;
  userId: string;
}

export default function StepShopInfo({ data, onUpdate, onNext }: Props) {
  const [loading, setLoading] = useState(false);
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [checkingSlug, setCheckingSlug] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      shopName: data.shopName || "",
      slug: data.slug || "",
      phone: data.phone || "",
      address: data.address || "",
      countryCode: data.countryCode || "",
      city: data.city || "",
      currency: data.currency || "",
      description: data.description || "",
    },
  });

  const shopName = watch("shopName");
  const slug = watch("slug");
  const countryCode = watch("countryCode");
  const cities = getCitiesForCountry(countryCode);
  const currency = watch("currency");
  const currencyOptions = Array.from(
    new Map(COUNTRIES.map((country) => [country.currency, { code: country.currency, symbol: country.symbol }])).values()
  );

  // Auto-generate slug from shop name
  useEffect(() => {
    if (shopName && !data.slug) {
      setValue("slug", slugify(shopName));
    }
  }, [shopName, setValue, data.slug]);

  useEffect(() => {
    if (countryCode && !currency) {
      setValue("currency", getCurrencyForCountry(countryCode).currency);
    }
  }, [countryCode, currency, setValue]);

  // Check slug availability
  useEffect(() => {
    if (!slug || slug.length < 3) {
      setSlugAvailable(null);
      return;
    }
    const isDemo = !process.env.NEXT_PUBLIC_SUPABASE_URL?.startsWith("http");
    if (isDemo) {
      setSlugAvailable(true);
      return;
    }
    const timer = setTimeout(async () => {
      setCheckingSlug(true);
      const supabase = createClient();
      const { data: existing } = await supabase
        .from("shops")
        .select("id")
        .eq("slug", slug)
        .single();
      setSlugAvailable(!existing);
      setCheckingSlug(false);
    }, 500);
    return () => clearTimeout(timer);
  }, [slug]);

  async function onSubmit(formData: FormData) {
    if (slugAvailable === false) return;
    setLoading(true);
    onUpdate({ ...formData, countryName: getCountryName(formData.countryCode) });
    onNext();
    setLoading(false);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3 mb-1">
          <div className="bg-primary/10 rounded-xl p-2.5">
            <Store className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle>Tu estudio de tatuajes</CardTitle>
            <CardDescription>Información básica de tu negocio</CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="shopName">Nombre de la estudio de tatuajes *</Label>
            <Input
              id="shopName"
              placeholder="Ej: Barber King Santiago"
              {...register("shopName")}
            />
            {errors.shopName && (
              <p className="text-xs text-destructive">{errors.shopName.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="slug">
              <Globe className="inline h-3.5 w-3.5 mr-1" />
              URL de tu página *
            </Label>
            <div className="flex items-center gap-0">
              <span className="h-11 px-3 flex items-center text-sm text-muted-foreground bg-muted rounded-l-xl border border-r-0 border-input whitespace-nowrap">
                {getAppBaseUrl().replace(/^https?:\/\//, "")}/
              </span>
              <Input
                id="slug"
                className="rounded-l-none"
                placeholder="tu-barberia"
                {...register("slug")}
                onChange={(e) => {
                  setValue("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                }}
              />
            </div>
            {errors.slug && (
              <p className="text-xs text-destructive">{errors.slug.message}</p>
            )}
            {!errors.slug && slug && slug.length >= 3 && (
              <p className={`text-xs ${slugAvailable === true ? "text-green-600" : slugAvailable === false ? "text-destructive" : "text-muted-foreground"}`}>
                {checkingSlug
                  ? "Verificando disponibilidad..."
                  : slugAvailable === true
                  ? "✓ Disponible"
                  : slugAvailable === false
                  ? "✗ Ya está en uso, elige otro"
                  : ""}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Teléfono / WhatsApp *</Label>
            <Input
              id="phone"
              type="tel"
              placeholder="+1 809-555-0100"
              {...register("phone")}
            />
            {errors.phone && (
              <p className="text-xs text-destructive">{errors.phone.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Dirección *</Label>
            <Input
              id="address"
              placeholder="Calle El Sol #45, Santiago, RD"
              {...register("address")}
            />
            {errors.address && (
              <p className="text-xs text-destructive">{errors.address.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="countryCode">País *</Label>
              <select
                id="countryCode"
                className="flex h-11 w-full rounded-xl border border-input bg-background px-4 py-2 text-sm"
                {...register("countryCode", {
                  onChange: (event) => {
                    const nextCities = getCitiesForCountry(event.target.value);
                    setValue("city", nextCities[0] || "");
                    setValue("currency", getCurrencyForCountry(event.target.value).currency);
                  },
                })}
              >
                <option value="">Selecciona un país</option>
                {COUNTRIES.map((country) => (
                  <option key={country.code} value={country.code}>
                    {country.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">Ciudad *</Label>
              <select
                id="city"
                className="flex h-11 w-full rounded-xl border border-input bg-background px-4 py-2 text-sm"
                disabled={!countryCode}
                {...register("city")}
              >
                <option value="">{countryCode ? "Selecciona una ciudad" : "Selecciona un país primero"}</option>
                {cities.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="currency">Divisa *</Label>
            <select
              id="currency"
              className="flex h-11 w-full rounded-xl border border-input bg-background px-4 py-2 text-sm"
              {...register("currency")}
            >
              <option value="">{countryCode ? "Selecciona una divisa" : "Selecciona un país primero"}</option>
              {currencyOptions.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.code} {item.symbol}
                </option>
              ))}
            </select>
            {countryCode && currency === getCurrencyForCountry(countryCode).currency && (
              <p className="text-xs text-muted-foreground">Divisa sugerida según el país elegido.</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descripción pública</Label>
            <textarea
              id="description"
              className="flex min-h-[84px] w-full rounded-xl border border-input bg-background px-4 py-3 text-sm"
              {...register("description")}
            />
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={loading || slugAvailable === false || checkingSlug}
          >
            {loading ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Guardando...</>
            ) : (
              "Continuar →"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
