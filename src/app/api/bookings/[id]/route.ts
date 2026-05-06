import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import { getAuthenticatedContext, isSubscriptionAccessible } from "@/lib/server-authz";

const updateSchema = z.object({
  status: z.enum(["pending", "confirmed", "rescheduled", "completed", "no_show", "cancelled"]).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
  end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getAuthenticatedContext();
  if (context.response) return context.response;

  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 });
  }

  const admin = await createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select("id, barber_id, shop_id, date, start_time, end_time")
    .eq("id", id)
    .maybeSingle();

  if (!booking) {
    return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
  }

  const { data: shop } = await admin
    .from("shops")
    .select("id, owner_id")
    .eq("id", booking.shop_id)
    .maybeSingle();

  if (!shop || shop.owner_id !== context.user.id) {
    return NextResponse.json({ error: "No autorizado para gestionar esta reserva" }, { status: 403 });
  }

  const { data: subscription } = await admin
    .from("shop_subscriptions")
    .select("status, current_period_end")
    .eq("shop_id", booking.shop_id)
    .maybeSingle();

  if (!isSubscriptionAccessible(subscription?.status, subscription?.current_period_end)) {
    return NextResponse.json(
      { error: "Tu suscripción no está activa. Actualiza tu plan para seguir gestionando reservas." },
      { status: 402 }
    );
  }

  const nextDate = parsed.data.date || booking.date;
  const nextStart = parsed.data.start_time || booking.start_time;
  const nextEnd = parsed.data.end_time || booking.end_time;

  if (parsed.data.date || parsed.data.start_time || parsed.data.end_time) {
    const { data: conflict } = await admin
      .from("bookings")
      .select("id")
      .eq("barber_id", booking.barber_id)
      .eq("date", nextDate)
      .neq("id", id)
      .not("status", "in", '("cancelled","no_show")')
      .or(`and(start_time.lt.${nextEnd},end_time.gt.${nextStart})`)
      .limit(1)
      .maybeSingle();

    if (conflict) {
      return NextResponse.json({ error: "El horario ya está ocupado por otra reserva." }, { status: 409 });
    }
  }

  const patch: Record<string, string | null> = {
    ...parsed.data,
  };

  if (!patch.status && (parsed.data.date || parsed.data.start_time || parsed.data.end_time)) {
    patch.status = "rescheduled";
  }

  if (patch.status === "confirmed") {
    patch.confirmed_at = new Date().toISOString();
    patch.confirmed_by_user_id = context.user.id;
  }

  const { error } = await admin.from("bookings").update(patch).eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    message: patch.status === "confirmed" ? "Reserva confirmada correctamente." : "Reserva actualizada correctamente.",
  });
}
