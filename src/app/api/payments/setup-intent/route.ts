import { NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/server-authz";
import { ensureClientStripeCustomer } from "@/lib/billing";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST() {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Stripe no está configurado todavía." }, { status: 503 });
  }

  const context = await getAuthenticatedContext();
  if (context.response) return context.response;

  if (context.account?.role !== "client" || !context.account.client) {
    return NextResponse.json({ error: "Solo clientes pueden guardar tarjetas." }, { status: 403 });
  }

  const customerId = await ensureClientStripeCustomer(context.account.client, context.user.email);
  const stripe = getStripe();
  const setupIntent = await stripe.setupIntents.create({
    customer: customerId,
    automatic_payment_methods: { enabled: true },
    metadata: {
      role: "client",
      client_id: context.account.client.id,
      user_id: context.user.id,
    },
  });

  return NextResponse.json({ clientSecret: setupIntent.client_secret });
}
