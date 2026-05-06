import { format } from "date-fns";
import { es } from "date-fns/locale";
import { buildAppUrl } from "@/lib/utils";

export const REMINDER_CHANNELS = ["email", "whatsapp"] as const;

export type ReminderChannel = (typeof REMINDER_CHANNELS)[number];

export function normalizeReminderChannels(
  value: unknown,
  fallback: ReminderChannel[] = ["email"]
): ReminderChannel[] {
  if (!Array.isArray(value)) return [...fallback];

  const channels = value.filter((item): item is ReminderChannel =>
    typeof item === "string" && REMINDER_CHANNELS.includes(item as ReminderChannel)
  );

  return Array.from(new Set(channels));
}

export function getReminderChannelsLabel(channels: ReminderChannel[]) {
  const normalized = normalizeReminderChannels(channels, []);
  if (normalized.length === 0) return "Sin recordatorios";
  if (normalized.length === 2) return "Correo y WhatsApp";
  return normalized[0] === "email" ? "Correo" : "WhatsApp";
}

export function buildReminderEmailHtml({
  clientName,
  shopName,
  barberName,
  serviceName,
  date,
  startTime,
  shopSlug,
}: {
  clientName: string;
  shopName: string;
  barberName: string;
  serviceName: string;
  date: string;
  startTime: string;
  shopSlug: string;
}) {
  const formattedDate = format(new Date(`${date}T12:00:00`), "EEEE d 'de' MMMM yyyy", { locale: es });
  const formattedTime = startTime.slice(0, 5);
  const bookingUrl = buildAppUrl(`/${shopSlug}`);

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
        <tr><td style="background:#0d9488;padding:28px 32px;text-align:center">
          <p style="margin:0;font-size:32px">⏰</p>
          <h1 style="margin:8px 0 0;color:#fff;font-size:20px;font-weight:700">Recordatorio de cita</h1>
          <p style="margin:4px 0 0;color:rgba(255,255,255,.8);font-size:14px">${shopName}</p>
        </td></tr>
        <tr><td style="padding:28px 32px">
          <p style="margin:0 0 20px;color:#374151;font-size:15px">Hola <strong>${clientName}</strong>,</p>
          <p style="margin:0 0 20px;color:#374151;font-size:15px">Te recordamos que tienes una cita próximamente:</p>
          <table width="100%" style="background:#f9fafb;border-radius:8px;padding:16px" cellpadding="0" cellspacing="0">
            <tr><td style="padding:6px 0"><span style="color:#6b7280;font-size:13px">Artista</span><br><strong style="color:#111827;font-size:15px">${barberName}</strong></td></tr>
            <tr><td style="padding:6px 0"><span style="color:#6b7280;font-size:13px">Servicio</span><br><strong style="color:#111827;font-size:15px">${serviceName}</strong></td></tr>
            <tr><td style="padding:6px 0"><span style="color:#6b7280;font-size:13px">Fecha</span><br><strong style="color:#111827;font-size:15px">${formattedDate}</strong></td></tr>
            <tr><td style="padding:6px 0"><span style="color:#6b7280;font-size:13px">Hora</span><br><strong style="color:#111827;font-size:15px">${formattedTime}</strong></td></tr>
          </table>
          <div style="text-align:center;margin-top:24px">
            <a href="${bookingUrl}" style="background:#0d9488;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Ver mi reserva</a>
          </div>
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

export function buildWhatsAppReminderText({
  clientName,
  shopName,
  serviceName,
  barberName,
  date,
  startTime,
}: {
  clientName: string;
  shopName: string;
  serviceName: string;
  barberName: string;
  date: string;
  startTime: string;
}) {
  const formattedDate = format(new Date(`${date}T12:00:00`), "EEEE d 'de' MMMM yyyy", { locale: es });
  const formattedTime = startTime.slice(0, 5);

  return `Hola ${clientName}, te recordamos tu cita en ${shopName}.\n\nServicio: ${serviceName}\nArtista: ${barberName}\nFecha: ${formattedDate}\nHora: ${formattedTime}\n\nSi necesitas reprogramar, respóndenos por aquí.`;
}

export function normalizeWhatsappPhone(phone: string | null | undefined) {
  const digits = (phone || "").replace(/\D/g, "");
  return digits.length >= 10 ? digits : null;
}

export function buildWhatsAppReminderUrl(input: {
  phone: string | null | undefined;
  clientName: string;
  shopName: string;
  serviceName: string;
  barberName: string;
  date: string;
  startTime: string;
}) {
  const normalizedPhone = normalizeWhatsappPhone(input.phone);
  if (!normalizedPhone) return null;

  const text = buildWhatsAppReminderText(input);
  return `https://web.whatsapp.com/send?phone=${normalizedPhone}&text=${encodeURIComponent(text)}`;
}

export function isReminderEventDue({
  status,
  scheduledFor,
  now,
}: {
  status: string;
  scheduledFor: string | null;
  now?: string | Date;
}) {
  if (status !== "pending" || !scheduledFor) return false;

  const scheduledAt = new Date(scheduledFor).getTime();
  const current = now ? new Date(now).getTime() : Date.now();
  return !Number.isNaN(scheduledAt) && scheduledAt <= current;
}
