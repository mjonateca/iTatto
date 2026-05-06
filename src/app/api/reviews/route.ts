import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedContext } from "@/lib/server-authz";

const reviewSchema = z.object({
  booking_id: z.string().uuid(),
  barber_id: z.string().uuid(),
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().max(600).optional().nullable(),
});

export async function POST(request: Request) {
  const context = await getAuthenticatedContext();
  if (context.response) return context.response;

  const parsed = reviewSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 });
  }

  const client = context.account?.role === "client" ? context.account.client : null;

  if (!client) return NextResponse.json({ error: "Perfil de cliente no encontrado" }, { status: 404 });

  const { data: booking } = await context.supabase
    .from("bookings")
    .select("id, client_id, barber_id, status")
    .eq("id", parsed.data.booking_id)
    .eq("client_id", client.id)
    .eq("barber_id", parsed.data.barber_id)
    .single();

  if (!booking) return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
  if (booking.status !== "completed") {
    return NextResponse.json({ error: "Solo puedes evaluar tatuajes completados" }, { status: 409 });
  }

  const { data, error } = await context.supabase
    .from("reviews")
    .insert({
      booking_id: parsed.data.booking_id,
      client_id: client.id,
      barber_id: parsed.data.barber_id,
      rating: parsed.data.rating,
      comment: parsed.data.comment || null,
    })
    .select()
    .single();

  if (error) {
    const message = error.message.includes("duplicate")
      ? "Ya evaluaste esta reserva"
      : error.message;
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
