import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureAccountRecords } from "@/lib/account-repair";
import { isSubscriptionAccessible } from "@/lib/server-authz";
import { createAdminClient, createClient } from "@/lib/supabase/server";

const createBookingSchema = z.object({
  barber_id: z.string().uuid(),
  shop_id: z.string().uuid(),
  service_id: z.string().uuid(),
  client_id: z.string().uuid().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  manual: z.boolean().optional(),
  client_name: z.string().optional(),
  client_phone: z.string().optional(),
  notes: z.string().optional(),
});

type OpeningHoursValue = Record<string, { open: string; close: string; closed: boolean }>;

function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function addMinutesToTime(value: string, minutesToAdd: number) {
  const total = timeToMinutes(value) + minutesToAdd;
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:00`;
}

function weekdayKey(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"][date.getDay()];
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const admin = await createAdminClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const rawBody = await request.json();
  const isManual = rawBody.manual === true;

  const account = await ensureAccountRecords(user);
  if (!isManual && account.role !== "client") {
    return NextResponse.json({ error: "Solo una cuenta cliente puede crear reservas" }, { status: 403 });
  }

  if (isManual && !["shop_owner", "barber"].includes(account.role)) {
    return NextResponse.json({ error: "Solo la estudio de tatuajes o un tatuador pueden crear reservas manuales" }, { status: 403 });
  }

  const client = account.client;
  if (!isManual && !client) {
    return NextResponse.json({ error: "Perfil de cliente no encontrado" }, { status: 404 });
  }

  const parsed = createBookingSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 });
  }

  const [{ data: shop }, { data: barber }, { data: service }, { data: subscription }] = await Promise.all([
    admin
      .from("shops")
      .select("id, owner_id, is_active, opening_hours, payments_enabled, online_payment_mode, deposit_required, deposit_amount, currency")
      .eq("id", parsed.data.shop_id)
      .maybeSingle(),
    admin.from("barbers").select("id, user_id, shop_id, is_active").eq("id", parsed.data.barber_id).maybeSingle(),
    admin.from("services").select("id, shop_id, is_active, is_visible, price, currency, duration_min").eq("id", parsed.data.service_id).maybeSingle(),
    admin.from("shop_subscriptions").select("status, current_period_end").eq("shop_id", parsed.data.shop_id).maybeSingle(),
  ]);

  if (!shop?.is_active) {
    return NextResponse.json({ error: "Estudio de tatuajes no disponible" }, { status: 404 });
  }

  if (!isSubscriptionAccessible(subscription?.status, subscription?.current_period_end)) {
    return NextResponse.json(
      { error: "La estudio de tatuajes tiene la suscripción vencida y no puede recibir nuevas reservas." },
      { status: 409 }
    );
  }

  if (!barber?.is_active || barber.shop_id !== parsed.data.shop_id) {
    return NextResponse.json({ error: "Tatuador no disponible en esta estudio de tatuajes" }, { status: 409 });
  }

  if (!service?.is_active || service.is_visible === false || service.shop_id !== parsed.data.shop_id) {
    return NextResponse.json({ error: "Servicio no disponible en esta estudio de tatuajes" }, { status: 409 });
  }

  if (isManual) {
    const ownsShop = account.role === "shop_owner" && shop.owner_id === user.id;
    const ownsBarberAgenda = account.role === "barber" && barber?.user_id === user.id;
    if (!ownsShop && !ownsBarberAgenda) {
      return NextResponse.json({ error: "No autorizado para crear reservas en esta agenda" }, { status: 403 });
    }
  }

  const selectedManualClient = isManual && parsed.data.client_id
    ? await admin.from("clients").select("id, name, phone").eq("id", parsed.data.client_id).maybeSingle()
    : { data: null };

  if (isManual && parsed.data.client_id && !selectedManualClient.data) {
    return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
  }

  const { data: assignedServices } = await admin
    .from("barber_services")
    .select("service_id")
    .eq("barber_id", parsed.data.barber_id);

  const hasExplicitAssignments = Boolean(assignedServices?.length);
  const compatible = !hasExplicitAssignments || assignedServices?.some((item) => item.service_id === parsed.data.service_id);
  if (!compatible) {
    return NextResponse.json({ error: "El tatuador seleccionado no ofrece ese servicio" }, { status: 409 });
  }

  const normalizedEndTime = addMinutesToTime(parsed.data.start_time, Number(service.duration_min || 0));

  const openingHours = (shop.opening_hours || {}) as OpeningHoursValue;
  const daySchedule = openingHours[weekdayKey(parsed.data.date)];
  if (daySchedule?.closed) {
    return NextResponse.json({ error: "La estudio de tatuajes está cerrada ese día" }, { status: 409 });
  }

  if (
    daySchedule &&
    (timeToMinutes(parsed.data.start_time.slice(0, 5)) < timeToMinutes(daySchedule.open) ||
      timeToMinutes(normalizedEndTime.slice(0, 5)) > timeToMinutes(daySchedule.close))
  ) {
    return NextResponse.json({ error: "La hora elegida está fuera del horario de la estudio de tatuajes" }, { status: 409 });
  }

  const { data: conflict } = await admin
    .from("bookings")
    .select("id")
    .eq("barber_id", parsed.data.barber_id)
    .eq("date", parsed.data.date)
    .not("status", "in", '("cancelled","no_show")')
    .or(`and(start_time.lt.${normalizedEndTime},end_time.gt.${parsed.data.start_time})`)
    .limit(1)
    .maybeSingle();

  if (conflict) {
    return NextResponse.json({ error: "El horario ya no está disponible" }, { status: 409 });
  }

  const paymentAmount = Number(shop.deposit_required && Number(shop.deposit_amount) > 0 ? shop.deposit_amount : service.price || 0);
  const paymentRequired = Boolean(shop.payments_enabled && shop.online_payment_mode === "required");
  const bookingPayload = {
    barber_id: parsed.data.barber_id,
    shop_id: parsed.data.shop_id,
    service_id: parsed.data.service_id,
    date: parsed.data.date,
    start_time: parsed.data.start_time,
  };

  const { data: booking, error } = await admin
    .from("bookings")
    .insert({
      client_id: isManual ? selectedManualClient.data?.id || null : client!.id,
      client_name: isManual && !selectedManualClient.data ? (parsed.data.client_name ?? null) : null,
      client_phone: isManual && !selectedManualClient.data ? (parsed.data.client_phone ?? null) : null,
      notes: parsed.data.notes ?? null,
      ...bookingPayload,
      end_time: normalizedEndTime,
      status: "confirmed",
      deposit_status: "none",
      deposit_amount: 0,
      payment_status: "pending",
      payment_required: paymentRequired,
      payment_amount: paymentAmount,
      payment_currency: service.currency || shop.currency || "USD",
    })
    .select()
    .single();

  if (error) {
    const message = error.message.includes("no_overlap") ? "El horario ya no está disponible" : error.message;
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json(booking, { status: 201 });
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const shopId = searchParams.get("shop_id");
  const date = searchParams.get("date");
  const status = searchParams.get("status");
  const barberId = searchParams.get("barber_id");

  if (!shopId) {
    return NextResponse.json({ error: "shop_id requerido" }, { status: 400 });
  }

  const { data: shop } = await supabase.from("shops").select("id").eq("id", shopId).eq("owner_id", user.id).single();
  if (!shop) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  let query = supabase
    .from("bookings")
    .select("*, clients(name, phone, whatsapp), barbers(display_name), services(name, duration_min, price)")
    .eq("shop_id", shopId)
    .order("date")
    .order("start_time");

  if (date) query = query.eq("date", date);
  if (status) query = query.eq("status", status);
  if (barberId) query = query.eq("barber_id", barberId);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
