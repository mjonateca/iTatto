import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";

const availabilitySchema = z.object({
  barber_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = availabilitySchema.safeParse({
    barber_id: searchParams.get("barber_id"),
    date: searchParams.get("date"),
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const admin = await createAdminClient();
  const { data: barber } = await admin
    .from("barbers")
    .select("id, is_active")
    .eq("id", parsed.data.barber_id)
    .maybeSingle();

  if (!barber?.is_active) {
    return NextResponse.json({ error: "Tatuador no disponible" }, { status: 404 });
  }

  const [{ data: bookings }, { data: blocks }] = await Promise.all([
    admin
      .from("bookings")
      .select("start_time, end_time")
      .eq("barber_id", parsed.data.barber_id)
      .eq("date", parsed.data.date)
      .not("status", "in", '("cancelled","no_show")'),
    admin
      .from("barber_time_blocks")
      .select("start_time, end_time")
      .eq("barber_id", parsed.data.barber_id)
      .eq("date", parsed.data.date),
  ]);

  const intervals = [
    ...(bookings || []),
    ...(blocks || []),
  ].map((item) => ({
    start: item.start_time?.slice(0, 5) || "00:00",
    end: item.end_time?.slice(0, 5) || "23:59",
  }));

  return NextResponse.json({ intervals });
}
