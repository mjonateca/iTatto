import { NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/server-authz";
import { createAdminClient } from "@/lib/supabase/server";
import { ensureClientStripeCustomer } from "@/lib/billing";
import { getStripe, isStripeConfigured, toStripeAmount } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Stripe no está configurado todavía." }, { status: 503 });
  }

  const { id } = await params;
  const context = await getAuthenticatedContext();
  if (context.response) return context.response;

  if (context.account?.role !== "client" || !context.account.client) {
    return NextResponse.json({ error: "Solo clientes pueden pagar reservas." }, { status: 403 });
  }

  const admin = await createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select(`
      id,
      client_id,
      shop_id,
      service_id,
      payment_status,
      payment_amount,
      payment_currency,
      payment_required,
      services(name, price, currency),
      shops(name, payments_enabled, online_payment_mode, currency)
    `)
    .eq("id", id)
    .maybeSingle();

  if (!booking || booking.client_id !== context.account.client.id) {
    return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
  }

  const bookingShop = Array.isArray(booking.shops) ? booking.shops[0] : booking.shops;
  if (!bookingShop?.payments_enabled) {
    return NextResponse.json({ error: "Esta estudio de tatuajes todavía no tiene pagos online activos." }, { status: 409 });
  }

  if (booking.payment_status === "paid") {
    return NextResponse.json({ error: "Esta reserva ya está pagada." }, { status: 409 });
  }

  const service = Array.isArray(booking.services) ? booking.services[0] : booking.services;
  const amount = Number(booking.payment_amount || service?.price || 0);
  const currency = String(booking.payment_currency || service?.currency || bookingShop?.currency || "USD");
  const customerId = await ensureClientStripeCustomer(context.account.client, context.user.email);

  const existingPayment = await admin
    .from("booking_payments")
    .select("stripe_payment_intent_id, status")
    .eq("booking_id", booking.id)
    .maybeSingle();

  const stripe = getStripe();
  if (existingPayment.data?.stripe_payment_intent_id && existingPayment.data.status !== "failed") {
    const currentIntent = await stripe.paymentIntents.retrieve(existingPayment.data.stripe_payment_intent_id);
    if (currentIntent.client_secret && currentIntent.status !== "succeeded" && currentIntent.status !== "canceled") {
      return NextResponse.json({ clientSecret: currentIntent.client_secret });
    }
  }

  const paymentIntent = await stripe.paymentIntents.create({
    amount: toStripeAmount(amount, currency),
    currency: currency.toLowerCase(),
    customer: customerId,
    automatic_payment_methods: { enabled: true },
    metadata: {
      booking_id: booking.id,
      shop_id: booking.shop_id,
      client_id: context.account.client.id,
      flow: "booking_payment",
      payment_required: String(booking.payment_required),
    },
  });

  await admin.from("booking_payments").upsert(
    {
      booking_id: booking.id,
      shop_id: booking.shop_id,
      client_id: context.account.client.id,
      provider: "stripe",
      stripe_customer_id: customerId,
      stripe_payment_intent_id: paymentIntent.id,
      amount,
      currency,
      status: "pending",
      metadata: paymentIntent.metadata,
    },
    { onConflict: "booking_id" }
  );

  return NextResponse.json({ clientSecret: paymentIntent.client_secret });
}
