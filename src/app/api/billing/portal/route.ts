import { NextResponse } from "next/server";
import { requireOwnedShop } from "@/lib/server-authz";
import { getAppBaseUrl, getStripe, isStripeConfigured } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST() {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Stripe no está configurado todavía." }, { status: 503 });
  }

  const context = await requireOwnedShop();
  if (context.response) return context.response;

  const { data: subscription } = await context.supabase
    .from("shop_subscriptions")
    .select("stripe_customer_id")
    .eq("shop_id", context.shop.id)
    .maybeSingle();

  if (!subscription?.stripe_customer_id) {
    return NextResponse.json({ error: "Esta estudio de tatuajes todavía no tiene cliente de billing." }, { status: 400 });
  }

  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: subscription.stripe_customer_id,
    return_url: `${getAppBaseUrl()}/dashboard?tab=settings`,
  });

  return NextResponse.json({ url: session.url });
}
