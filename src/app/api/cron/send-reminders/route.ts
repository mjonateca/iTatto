import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/server";
import { buildReminderEmailHtml, normalizeReminderChannels } from "@/lib/notifications";

type BookingReminderRow = {
  id: string;
  date: string;
  start_time: string;
  status: string;
  client_id: string | null;
  shop_id: string;
  clients: { id?: string; name?: string | null; user_id?: string | null } | null;
  barbers: { display_name?: string | null } | null;
  services: { name?: string | null } | null;
  shops: { name?: string | null; slug?: string | null; reminder_channels?: unknown } | null;
};

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = await createAdminClient();
  const nowIso = new Date().toISOString();

  const { data: events } = await admin
    .from("notification_events")
    .select("id, booking_id, shop_id")
    .eq("channel", "email")
    .eq("type", "booking_reminder")
    .eq("status", "pending")
    .lte("scheduled_for", nowIso)
    .order("scheduled_for")
    .limit(100);

  if (!events || events.length === 0) {
    return NextResponse.json({ processed: 0, sent: 0, failed: 0, skipped: 0 });
  }

  const bookingIds = events.map((event) => event.booking_id).filter(Boolean) as string[];

  const { data: bookingsRaw } = await admin
    .from("bookings")
    .select("id, date, start_time, status, client_id, shop_id, clients(id, name, user_id), barbers(display_name), services(name), shops(name, slug, reminder_channels)")
    .in("id", bookingIds);

  const bookingMap = new Map<string, BookingReminderRow>(
    ((bookingsRaw || []) as BookingReminderRow[]).map((booking) => [booking.id, booking])
  );

  const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
  const fromAddress = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const event of events) {
    const booking = event.booking_id ? bookingMap.get(event.booking_id) : null;

    if (!booking) {
      await admin.from("notification_events").update({ status: "failed", error: "Reserva no encontrada" }).eq("id", event.id);
      failed += 1;
      continue;
    }

    if (booking.status !== "confirmed") {
      await admin.from("notification_events").update({ status: "skipped", error: "La reserva ya no está confirmada" }).eq("id", event.id);
      skipped += 1;
      continue;
    }

    if (!normalizeReminderChannels(booking.shops?.reminder_channels).includes("email")) {
      await admin.from("notification_events").update({ status: "skipped", error: "El correo está desactivado para esta estudio de tatuajes" }).eq("id", event.id);
      skipped += 1;
      continue;
    }

    if (!resend) {
      await admin.from("notification_events").update({ status: "failed", error: "RESEND_API_KEY no configurado" }).eq("id", event.id);
      failed += 1;
      continue;
    }

    const client = booking.clients;
    const shop = booking.shops;
    const barberName = booking.barbers?.display_name || "Tu tatuador";
    const serviceName = booking.services?.name || "Servicio";
    const clientName = client?.name || "Cliente";

    if (!client?.user_id) {
      await admin.from("notification_events").update({ status: "failed", error: "El cliente no tiene usuario asociado" }).eq("id", event.id);
      failed += 1;
      continue;
    }

    const { data: userData } = await admin.auth.admin.getUserById(client.user_id);
    const recipientEmail = userData?.user?.email || null;

    if (!recipientEmail) {
      await admin.from("notification_events").update({ status: "failed", error: "El cliente no tiene email registrado" }).eq("id", event.id);
      failed += 1;
      continue;
    }

    const html = buildReminderEmailHtml({
      clientName,
      shopName: shop?.name || "Tu estudio de tatuajes",
      barberName,
      serviceName,
      date: booking.date,
      startTime: booking.start_time,
      shopSlug: shop?.slug || "",
    });

    const result = await resend.emails.send({
      from: `${shop?.name || "iTatto"} <${fromAddress}>`,
      to: recipientEmail,
      subject: "Recordatorio de cita",
      html,
    });

    const success = !result.error;
    await admin.from("email_notifications").insert({
      shop_id: booking.shop_id,
      booking_id: booking.id,
      client_id: booking.client_id,
      type: "reminder",
      status: success ? "sent" : "failed",
      recipient_email: recipientEmail,
      recipient_name: clientName,
      sent_at: success ? new Date().toISOString() : null,
      error_message: result.error?.message || null,
    });

    await admin.from("notification_events").update({
      status: success ? "sent" : "failed",
      sent_at: success ? new Date().toISOString() : null,
      error: result.error?.message || null,
    }).eq("id", event.id);

    if (success) sent += 1;
    else failed += 1;
  }

  return NextResponse.json({ processed: events.length, sent, failed, skipped });
}
