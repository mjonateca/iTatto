import { NextResponse } from "next/server";
import { z } from "zod";
import { Resend } from "resend";
import { requireOwnedActiveShop } from "@/lib/server-authz";
import { createAdminClient } from "@/lib/supabase/server";
import { buildReminderEmailHtml, normalizeReminderChannels } from "@/lib/notifications";

export async function GET() {
  const context = await requireOwnedActiveShop();
  if (context.response) return context.response;

  const admin = await createAdminClient();
  const { data, error } = await admin
    .from("email_notifications")
    .select("*")
    .eq("shop_id", context.shop.id)
    .eq("status", "sent")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

const sendSchema = z.object({
  booking_id: z.string().uuid(),
  event_id: z.string().uuid().optional(),
  type: z.literal("reminder").default("reminder"),
});

const REMINDER_SUBJECT = "Recordatorio de cita";
export async function POST(request: Request) {
  const context = await requireOwnedActiveShop();
  if (context.response) return context.response;

  const parsed = sendSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const admin = await createAdminClient();

  if (parsed.data.event_id) {
    const { data: event } = await admin
      .from("notification_events")
      .select("id")
      .eq("id", parsed.data.event_id)
      .eq("booking_id", parsed.data.booking_id)
      .eq("shop_id", context.shop.id)
      .eq("channel", "email")
      .eq("status", "pending")
      .single();

    if (!event) return NextResponse.json({ error: "Aviso pendiente no encontrado" }, { status: 404 });
  }

  const { data: booking } = await admin
    .from("bookings")
    .select("id, date, start_time, shop_id, client_id, barbers(display_name), services(name)")
    .eq("id", parsed.data.booking_id)
    .eq("shop_id", context.shop.id)
    .single();

  if (!booking) return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
  const { data: shopData } = await admin
    .from("shops")
    .select("name, slug")
    .eq("id", context.shop.id)
    .single();

  const shopName = shopData?.name || "iTatto";
  const shopSlug = shopData?.slug || "";

  const { data: clientData } = await admin
    .from("clients")
    .select("id, name, user_id")
    .eq("id", booking.client_id)
    .single();

  let recipientEmail: string | null = null;
  const recipientName = clientData?.name || "Cliente";

  if (clientData?.user_id) {
    const { data: userData } = await admin.auth.admin.getUserById(clientData.user_id);
    recipientEmail = userData?.user?.email || null;
  }

  if (!recipientEmail) {
    return NextResponse.json({ error: "Este cliente no tiene email registrado" }, { status: 400 });
  }

  if (!normalizeReminderChannels((context.shop as { reminder_channels?: unknown }).reminder_channels).includes("email")) {
    return NextResponse.json({ error: "El correo no está activado para esta estudio de tatuajes" }, { status: 400 });
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "El recordatorio por email no está configurado todavía" }, { status: 503 });
  }

  let sentAt: string | null = null;

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const barberName = (booking.barbers as unknown as { display_name: string } | null)?.display_name || "Tu tatuador";
    const serviceName = (booking.services as unknown as { name: string } | null)?.name || "Servicio";

    const html = buildReminderEmailHtml({
      clientName: recipientName,
      shopName,
      barberName,
      serviceName,
      date: booking.date as string,
      startTime: booking.start_time as string,
      shopSlug,
    });

    const result = await resend.emails.send({
      from: `${shopName} <${process.env.RESEND_FROM_EMAIL || "no-reply@i-barber.com"}>`,
      to: recipientEmail,
      subject: REMINDER_SUBJECT,
      html,
    });

    if (result.error) throw new Error(result.error.message);
    sentAt = new Date().toISOString();
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: errorMessage }, { status: 502 });
  }

  const { data: notification, error: insertError } = await admin
    .from("email_notifications")
    .insert({
      shop_id: context.shop.id,
      booking_id: parsed.data.booking_id,
      client_id: booking.client_id,
      type: parsed.data.type,
      status: "sent",
      recipient_email: recipientEmail,
      recipient_name: recipientName,
      sent_at: sentAt,
      error_message: null,
    })
    .select()
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  if (parsed.data.event_id) {
    await admin
      .from("notification_events")
      .update({ status: "sent", sent_at: sentAt })
      .eq("id", parsed.data.event_id)
      .eq("shop_id", context.shop.id);
  }

  return NextResponse.json({ success: true, notification, recipientEmail, event_id: parsed.data.event_id || null });
}
