import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnedActiveShop } from "@/lib/server-authz";
import { createAdminClient } from "@/lib/supabase/server";
import { buildWhatsAppReminderUrl } from "@/lib/notifications";

const requestSchema = z.object({
  event_id: z.string().uuid().optional(),
  booking_id: z.string().uuid().optional(),
}).refine((value) => value.event_id || value.booking_id, {
  message: "Datos inválidos",
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const context = await requireOwnedActiveShop();
  if (context.response) return context.response;

  const admin = await createAdminClient();

  const { data: event } = parsed.data.event_id
    ? await admin
        .from("notification_events")
        .select("id, booking_id, shop_id, channel, type, status")
        .eq("id", parsed.data.event_id)
        .eq("shop_id", context.shop.id)
        .eq("channel", "whatsapp")
        .single()
    : { data: null };

  const bookingId = event?.booking_id || parsed.data.booking_id;
  if (!bookingId) return NextResponse.json({ error: "Recordatorio no encontrado" }, { status: 404 });

  const { data: booking } = await admin
    .from("bookings")
    .select("id, date, start_time, client_phone, clients(name, phone, whatsapp), barbers(display_name), services(name)")
    .eq("id", bookingId)
    .eq("shop_id", context.shop.id)
    .single();

  if (!booking) {
    return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
  }

  const client = booking.clients as { name?: string | null; phone?: string | null; whatsapp?: string | null } | null;
  const barber = booking.barbers as { display_name?: string | null } | null;
  const service = booking.services as { name?: string | null } | null;

  const url = buildWhatsAppReminderUrl({
    phone: client?.whatsapp || client?.phone || booking.client_phone,
    clientName: client?.name || "Cliente",
    shopName: (context.shop as { name: string }).name,
    serviceName: service?.name || "Servicio",
    barberName: barber?.display_name || "Tu artista",
    date: booking.date as string,
    startTime: booking.start_time as string,
  });

  if (!url) {
    if (event?.id) {
      await admin
        .from("notification_events")
        .update({ status: "failed", error: "El cliente no tiene un número válido para WhatsApp" })
        .eq("id", event.id);
    }

    return NextResponse.json({ error: "El cliente no tiene un número válido para WhatsApp" }, { status: 400 });
  }

  if (event?.id) {
    await admin.from("notification_events").update({
      status: "sent",
      sent_at: new Date().toISOString(),
      error: null,
    }).eq("id", event.id);
  }

  await admin.from("bookings").update({
    whatsapp_reminder_sent: true,
  }).eq("id", booking.id);

  return NextResponse.json({ success: true, url, booking_id: booking.id, event_id: event?.id || null });
}
