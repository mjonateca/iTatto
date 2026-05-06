import { NextResponse } from "next/server";
import { requireOwnedShop } from "@/lib/server-authz";
import { ensureShopStripeCustomer, ensureShopSubscription, getPlatformBillingSettings } from "@/lib/billing";
import { getAppBaseUrl, getStripe, isStripeConfigured, toStripeAmount } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST() {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Stripe no está configurado todavía." }, { status: 503 });
  }

  const context = await requireOwnedShop();
  if (context.response) return context.response;

  const shopQuery = await context.supabase
    .from("shops")
    .select("id, name, owner_id")
    .eq("id", context.shop.id)
    .single();

  if (shopQuery.error || !shopQuery.data) {
    return NextResponse.json({ error: "Estudio de tatuajes no encontrada" }, { status: 404 });
  }

  const shop = shopQuery.data;
  const subscription = await ensureShopSubscription(shop);
  const customerId = await ensureShopStripeCustomer(shop, context.user.email);
  const settings = await getPlatformBillingSettings();
  const stripe = getStripe();
  const baseUrl = getAppBaseUrl();

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    success_url: `${baseUrl}/dashboard?tab=settings&billing=success`,
    cancel_url: `${baseUrl}/dashboard?tab=settings&billing=cancelled`,
    payment_method_collection: "always",
    subscription_data: {
      trial_period_days: settings?.trial_days || 30,
      metadata: {
        shop_id: shop.id,
        shop_name: shop.name,
      },
    },
    metadata: {
      shop_id: shop.id,
      owner_id: shop.owner_id,
      flow: "shop_subscription",
    },
    line_items: settings?.stripe_price_id
      ? [{ price: settings.stripe_price_id, quantity: 1 }]
      : [
          {
            price_data: {
              currency: (settings?.currency || subscription.currency || "USD").toLowerCase(),
              unit_amount: toStripeAmount(Number(settings?.monthly_price || subscription.monthly_price || 20), settings?.currency || subscription.currency || "USD"),
              recurring: { interval: "month" },
              product_data: {
                name: "iTatto Pro",
                description: `Suscripción mensual para ${shop.name}`,
              },
            },
            quantity: 1,
          },
        ],
  });

  return NextResponse.json({ url: session.url });
}
