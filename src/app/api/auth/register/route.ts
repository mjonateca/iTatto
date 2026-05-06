import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import { getCountryName, getCurrencyForCountry } from "@/lib/locations";

const registerSchema = z.object({
  accountType: z.enum(["client", "barber", "barbershop"]),
  firstName: z.string().min(2),
  lastName: z.string().optional(),
  businessName: z.string().optional(),
  specialty: z.string().optional(),
  shopSlug: z.string().optional(),
  email: z.string().email(),
  phone: z.string().min(7),
  countryCode: z.string().min(2),
  city: z.string().min(2),
  address: z.string().optional(),
  description: z.string().optional(),
  password: z.string().min(6),
})
  .refine((data) => data.accountType !== "barbershop" || Boolean(data.businessName?.trim()), {
    path: ["businessName"],
  })
  .refine((data) => data.accountType !== "barbershop" || Boolean(data.address?.trim()), {
    path: ["address"],
  });

function cleanEmail(value: string) {
  return value.trim().toLowerCase();
}

function slugifyShopSlug(value?: string) {
  return value?.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "";
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const email = cleanEmail(data.email);
  const fullName =
    data.accountType === "barbershop"
      ? data.businessName?.trim() || "Estudio de tatuajes"
      : `${data.firstName.trim()} ${data.lastName?.trim() || ""}`.trim();

  const admin = await createAdminClient();
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password: data.password,
    email_confirm: true,
    user_metadata: {
      account_type: data.accountType,
      first_name: data.firstName.trim(),
      last_name: data.lastName?.trim() || "",
      business_name: data.businessName?.trim() || "",
      specialty: data.specialty?.trim() || "",
      shop_slug: slugifyShopSlug(data.shopSlug),
      phone: data.phone.trim(),
      country_code: data.countryCode,
      country_name: getCountryName(data.countryCode),
      currency: getCurrencyForCountry(data.countryCode).currency,
      city: data.city,
      address: data.address?.trim() || "",
      description: data.description?.trim() || "",
      full_name: fullName,
    },
  });

  if (error) {
    const message = error.message.toLowerCase();
    const userMessage = message.includes("already") || message.includes("registered")
      ? "Ese correo ya está registrado. Inicia sesión o usa otro correo."
      : message.includes("invalid")
        ? "Usa un correo válido."
        : error.message;

    return NextResponse.json({ error: userMessage }, { status: error.status || 400 });
  }

  return NextResponse.json({
    ok: true,
    user_id: created.user?.id,
    role: data.accountType === "barbershop" ? "shop_owner" : data.accountType,
  });
}
