import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnedActiveShop } from "@/lib/server-authz";
import { createAdminClient } from "@/lib/supabase/server";

const barberSchema = z.object({
  shop_id: z.string().uuid().optional(),
  display_name: z.string().min(2),
  bio: z.string().optional(),
  specialty: z.string().optional(),
  avatar_url: z.string().url().optional().or(z.literal("")),
  service_ids: z.array(z.string().uuid()).optional(),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const context = await requireOwnedActiveShop(searchParams.get("shop_id"));
  if (context.response) return context.response;

  const { data, error } = await context.supabase
    .from("barbers")
    .select("*, barber_services(service_id)")
    .eq("shop_id", context.shop.id)
    .order("display_name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const parsed = barberSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 });
  }

  const context = await requireOwnedActiveShop(parsed.data.shop_id);
  if (context.response) return context.response;
  const admin = await createAdminClient();

  let { data: barber, error } = await admin
    .from("barbers")
    .insert({
      user_id: context.user.id,
      shop_id: context.shop.id,
      display_name: parsed.data.display_name,
      bio: parsed.data.bio || null,
      specialty: parsed.data.specialty || null,
      avatar_url: parsed.data.avatar_url || null,
      is_independent: false,
      is_active: true,
    })
    .select()
    .single();

  if (error && /specialty|is_active/.test(error.message)) {
    const fallback = await admin
      .from("barbers")
      .insert({
        user_id: context.user.id,
        shop_id: context.shop.id,
        display_name: parsed.data.display_name,
        bio: parsed.data.bio || null,
        avatar_url: parsed.data.avatar_url || null,
        is_independent: false,
      })
      .select()
      .single();
    barber = fallback.data;
    error = fallback.error;
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (parsed.data.service_ids?.length) {
    await admin.from("barber_services").insert(
      parsed.data.service_ids.map((service_id) => ({
        barber_id: barber.id,
        service_id,
      }))
    );
  }

  return NextResponse.json(barber, { status: 201 });
}
