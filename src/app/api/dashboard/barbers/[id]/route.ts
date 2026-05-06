import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedContext, isSubscriptionAccessible } from "@/lib/server-authz";
import { createAdminClient } from "@/lib/supabase/server";

const updateSchema = z.object({
  display_name: z.string().min(2).optional(),
  bio: z.string().nullable().optional(),
  specialty: z.string().nullable().optional(),
  avatar_url: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
  service_ids: z.array(z.string().uuid()).optional(),
});

async function assertBarberOwner(id: string) {
  const context = await getAuthenticatedContext();
  if (context.response) return { ...context, barber: null };

  const { data: barber } = await context.supabase
    .from("barbers")
    .select("id, shop_id, shops!inner(owner_id)")
    .eq("id", id)
    .single();

  const barberShop = barber?.shops as unknown as { owner_id: string } | Array<{ owner_id: string }> | null;
  const ownerId = Array.isArray(barberShop) ? barberShop[0]?.owner_id : barberShop?.owner_id;
  if (!barber || ownerId !== context.user.id) {
    return {
      ...context,
      barber: null,
      response: NextResponse.json({ error: "No autorizado" }, { status: 403 }),
    };
  }

  return { ...context, barber, response: null };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 });
  }

  const context = await assertBarberOwner(id);
  if (context.response) return context.response;
  const admin = await createAdminClient();

  const { data: subscription } = await context.supabase
    .from("shop_subscriptions")
    .select("status, current_period_end")
    .eq("shop_id", context.barber.shop_id)
    .maybeSingle();

  if (!isSubscriptionAccessible(subscription?.status, subscription?.current_period_end)) {
    return NextResponse.json({ error: "Tu suscripción no está activa." }, { status: 402 });
  }

  const { service_ids, ...patch } = parsed.data;
  const { data, error } = await admin
    .from("barbers")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (service_ids) {
    await admin.from("barber_services").delete().eq("barber_id", id);
    if (service_ids.length) {
      await admin.from("barber_services").insert(
        service_ids.map((service_id) => ({ barber_id: id, service_id }))
      );
    }
  }

  return NextResponse.json(data);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await assertBarberOwner(id);
  if (context.response) return context.response;
  const admin = await createAdminClient();

  const { data: subscription } = await context.supabase
    .from("shop_subscriptions")
    .select("status, current_period_end")
    .eq("shop_id", context.barber.shop_id)
    .maybeSingle();

  if (!isSubscriptionAccessible(subscription?.status, subscription?.current_period_end)) {
    return NextResponse.json({ error: "Tu suscripción no está activa." }, { status: 402 });
  }

  const { error } = await admin.from("barbers").update({ is_active: false }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
