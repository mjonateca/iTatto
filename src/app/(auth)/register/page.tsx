"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { COUNTRIES, getCurrencyForCountry, getCitiesForCountry } from "@/lib/locations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";

const registerSchema = z.object({
  accountType: z.enum(["client", "barber", "barbershop"]),
  firstName: z.string().min(2, "Nombre requerido"),
  lastName: z.string().optional(),
  businessName: z.string().optional(),
  specialty: z.string().optional(),
  shopSlug: z.string().optional(),
  email: z.string().email("Correo inválido"),
  phone: z.string().min(7, "Teléfono requerido"),
  countryCode: z.string().min(2, "País requerido"),
  currency: z.string().default("USD"),
  city: z.string().min(2, "Ciudad requerida"),
  address: z.string().optional(),
  description: z.string().optional(),
  password: z.string().min(6, "Mínimo 6 caracteres"),
  confirmPassword: z.string(),
})
  .refine((d) => d.password === d.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  })
  .refine((d) => d.accountType !== "barbershop" || Boolean(d.businessName?.trim()), {
    message: "Nombre comercial requerido",
    path: ["businessName"],
  })
  .refine((d) => d.accountType !== "barbershop" || Boolean(d.address?.trim()), {
    message: "Dirección requerida",
    path: ["address"],
  });

type RegisterForm = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      accountType: "client",
      countryCode: "",
      city: "",
    },
  });

  const accountType = watch("accountType");
  const countryCode = watch("countryCode");
  const cities = getCitiesForCountry(countryCode);

  async function onSubmit(data: RegisterForm) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl?.startsWith("http")) {
      router.push("/dashboard");
      return;
    }

    setLoading(true);
    const supabase = createClient();

    try {
      await supabase.auth.signOut();

      const registerResponse = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountType: data.accountType,
          firstName: data.firstName,
          lastName: data.lastName || "",
          businessName: data.businessName || "",
          specialty: data.specialty || "",
          shopSlug: data.shopSlug || "",
          email: data.email,
          phone: data.phone,
          countryCode: data.countryCode,
        currency: getCurrencyForCountry(data.countryCode).currency,
          city: data.city,
          address: data.address || "",
          description: data.description || "",
          password: data.password,
        }),
      });

      if (!registerResponse.ok) {
        const payload = await registerResponse.json().catch(() => ({ error: "No se pudo crear la cuenta" }));
        throw new Error(payload.error || "No se pudo crear la cuenta");
      }

      const { error: loginError } = await supabase.auth.signInWithPassword({
        email: data.email.trim().toLowerCase(),
        password: data.password,
      });

      if (loginError) throw loginError;

      router.push("/dashboard");
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      toast({
        variant: "destructive",
        title: "Error al registrarse",
        description:
          msg.includes("Invalid URL") || msg.includes("supabaseUrl")
            ? "Supabase no está configurado. Agrega las variables en .env.local."
            : msg.includes("email") && msg.includes("invalid")
              ? "Usa un correo real. Algunos dominios de prueba no son aceptados."
              : msg,
      });
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-xl">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Crea tu cuenta</CardTitle>
        <CardDescription>Elige cómo usarás iTatto.</CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="accountType">Tipo de cuenta</Label>
            <select
              id="accountType"
              className="flex h-11 w-full rounded-xl border border-input bg-background px-4 py-2 text-sm"
              {...register("accountType")}
            >
              <option value="client">Cliente</option>
              <option value="barber">Tatuador</option>
              <option value="barbershop">Estudio de tatuajes</option>
            </select>
          </div>

          {accountType === "barbershop" && (
            <div className="space-y-2">
              <Label htmlFor="businessName">Nombre comercial *</Label>
              <Input id="businessName" autoComplete="organization" {...register("businessName")} />
              {errors.businessName && (
                <p className="text-xs text-destructive">{errors.businessName.message}</p>
              )}
            </div>
          )}

          {accountType === "barber" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="specialty">Especialidad</Label>
                <Input id="specialty" placeholder="Fade, barba, diseño..." {...register("specialty")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="shopSlug">Estudio de tatuajes donde trabajas</Label>
                <Input id="shopSlug" placeholder="slug de la estudio de tatuajes, opcional" {...register("shopSlug")} />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="firstName">
                {accountType === "barbershop" ? "Contacto *" : "Nombre *"}
              </Label>
              <Input id="firstName" autoComplete="given-name" {...register("firstName")} />
              {errors.firstName && (
                <p className="text-xs text-destructive">{errors.firstName.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Apellidos</Label>
              <Input id="lastName" autoComplete="family-name" {...register("lastName")} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="email">Correo de acceso *</Label>
              <Input id="email" type="email" autoComplete="email" {...register("email")} />
              {errors.email && (
                <p className="text-xs text-destructive">{errors.email.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Teléfono / WhatsApp *</Label>
              <Input id="phone" type="tel" autoComplete="tel" {...register("phone")} />
              {errors.phone && (
                <p className="text-xs text-destructive">{errors.phone.message}</p>
              )}
            </div>
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
              {errors.city && <p className="text-xs text-destructive">{errors.city.message}</p>}
            </div>
          </div>

          {accountType === "barbershop" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="address">Dirección *</Label>
                <Input id="address" autoComplete="street-address" {...register("address")} />
                {errors.address && (
                  <p className="text-xs text-destructive">{errors.address.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descripción</Label>
                <textarea
                  id="description"
                  className="flex min-h-[84px] w-full rounded-xl border border-input bg-background px-4 py-3 text-sm"
                  placeholder="Especialidad, ambiente, zona o ventajas de tu estudio de tatuajes."
                  {...register("description")}
                />
              </div>
            </>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña *</Label>
              <Input id="password" type="password" autoComplete="new-password" {...register("password")} />
              {errors.password && (
                <p className="text-xs text-destructive">{errors.password.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar *</Label>
              <Input id="confirmPassword" type="password" autoComplete="new-password" {...register("confirmPassword")} />
              {errors.confirmPassword && (
                <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
              )}
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creando cuenta...
              </>
            ) : accountType === "barbershop" ? (
              "Registrar estudio de tatuajes"
            ) : accountType === "barber" ? (
              "Crear cuenta de tatuador"
            ) : (
              "Crear cuenta"
            )}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className="text-primary font-medium hover:underline">
            Inicia sesión
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
