import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/server";
import { buildAppUrl } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";

function buildReviewEmailHtml({
  clientName,
  shopName,
  barberName,
  serviceName,
  date,
  shopSlug,
}: {
  clientName: string;
  shopName: string;
  barberName: string;
  serviceName: string;
  date: string;
  shopSlug: string;
}) {
  const formattedDate = format(new Date(date + "T12:00:00"), "EEEE d 'de' MMMM yyyy", { locale: es });
  const dashboardUrl = buildAppUrl("/dashboard?tab=bookings");

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
        <tr><td style="background:#0d9488;padding:28px 32px;text-align:center">
          <p style="margin:0;font-size:32px">⭐</p>
          <h1 style="margin:8px 0 0;color:#fff;font-size:20px;font-weight:700">¿Qué tal tu visita?</h1>
          <p style="margin:4px 0 0;color:rgba(255,255,255,.8);font-size:14px">${shopName}</p>
        </td></tr>
        <tr><td style="padding:28px 32px">
          <p style="margin:0 0 16px;color:#374151;font-size:15px">Hola <strong>${clientName}</strong>,</p>
          <p style="margin:0 0 20px;color:#374151;font-size:15px">
            Tu cita del <strong>${formattedDate}</strong> con <strong>${barberName}</strong> (${serviceName}) ha finalizado.
            Nos encantaría saber tu opinión.
          </p>
          <table width="100%" style="background:#f9fafb;border-radius:8px;padding:16px" cellpadding="0" cellspacing="0">
            <tr><td style="padding:6px 0"><span style="color:#6b7280;font-size:13px">Artista</span><br><strong style="color:#111827;font-size:15px">${barberName}</strong></td></tr>
            <tr><td style="padding:6px 0"><span style="color:#6b7280;font-size:13px">Servicio</span><br><strong style="color:#111827;font-size:15px">${serviceName}</strong></td></tr>
            <tr><td style="padding:6px 0"><span style="color:#6b7280;font-size:13px">Fecha</span><br><strong style="color:#111827;font-size:15px">${formattedDate}</strong></td></tr>
          </table>
          <div style="text-align:center;margin-top:24px">
            <a href="${dashboardUrl}" style="background:#0d9488;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">
              Dejar mi reseña
            </a>
          </div>
          <p style="margin:20px 0 0;color:#6b7280;font-size:13px;text-align:center">
            Tu opinión ayuda a otros clientes y mejora nuestro servicio.
          </p>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #f3f4f6;text-align:center">
          <p style="margin:0;color:#9ca3af;font-size:12px">Powered by <a href="${buildAppUrl()}" style="color:#0d9488;text-decoration:none">iTatto</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = await createAdminClient();
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const timeStr = now.toTimeString().slice(0, 5);

  // Bookings from past days
  const { data: pastData } = await admin
    .from("bookings")
    .update({ status: "completed" })
    .in("status", ["confirmed", "pending"])
    .lt("date", todayStr)
    .select("id");

  // Today's bookings whose end_time has passed
  const { data: todayData } = await admin
    .from("bookings")
    .update({ status: "completed" })
    .in("status", ["confirmed", "pending"])
    .eq("date", todayStr)
    .lt("end_time", timeStr)
    .select("id");

  const completedIds = [
    ...(pastData || []).map((b: { id: string }) => b.id),
    ...(todayData || []).map((b: { id: string }) => b.id),
  ];

  const total = completedIds.length;
  console.log(`[cron] Completed ${total} bookings`);

  // Send review request emails for newly completed bookings
  let emailsSent = 0;
  let emailsFailed = 0;

  if (total > 0 && process.env.RESEND_API_KEY) {
    const { data: bookings } = await admin
      .from("bookings")
      .select(`
        id, date, start_time, shop_id, client_id,
        barbers(display_name),
        services(name),
        shops(name, slug)
      `)
      .in("id", completedIds);

    if (bookings && bookings.length > 0) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const fromAddress = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

      for (const booking of bookings) {
        try {
          const { data: clientData } = await admin
            .from("clients")
            .select("id, name, user_id")
            .eq("id", booking.client_id)
            .single();

          if (!clientData?.user_id) continue;

          const { data: userData } = await admin.auth.admin.getUserById(clientData.user_id);
          const recipientEmail = userData?.user?.email;
          if (!recipientEmail) continue;

          const clientName = clientData.name || "Cliente";
          const barberName =
            (booking.barbers as unknown as { display_name: string } | null)?.display_name || "Tu artista";
          const serviceName = (booking.services as unknown as { name: string } | null)?.name || "Servicio";
          const shopObj = booking.shops as unknown as { name: string; slug: string } | null;
          const shopName = shopObj?.name || "La estudio";
          const shopSlug = shopObj?.slug || "";

          const html = buildReviewEmailHtml({
            clientName,
            shopName,
            barberName,
            serviceName,
            date: booking.date as string,
            shopSlug,
          });

          const result = await resend.emails.send({
            from: `${shopName} <${fromAddress}>`,
            to: recipientEmail,
            subject: `¿Cómo estuvo tu visita a ${shopName}?`,
            html,
          });

          const success = !result.error;

          await admin.from("email_notifications").insert({
            shop_id: booking.shop_id,
            booking_id: booking.id,
            client_id: booking.client_id,
            type: "review_request",
            status: success ? "sent" : "failed",
            recipient_email: recipientEmail,
            recipient_name: clientName,
            sent_at: success ? new Date().toISOString() : null,
            error_message: result.error?.message || null,
          });

          if (success) emailsSent++;
          else emailsFailed++;
        } catch (err) {
          console.error(`[cron] Error sending review email for booking ${booking.id}:`, err);
          emailsFailed++;
        }
      }
    }
  }

  console.log(`[cron] Review emails: ${emailsSent} sent, ${emailsFailed} failed`);
  return NextResponse.json({ completed: total, emailsSent, emailsFailed });
}
