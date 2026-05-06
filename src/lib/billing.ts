import "server-only";
import type Stripe from "stripe";
import type { Client, Shop, ShopSubscription } from "@/types/database";
import { createAdminClient } from "@/lib/supabase/server";
import { fromStripeTimestamp, getStripe, mapStripePaymentStatus, mapStripeSubscriptionStatus } from "@/lib/stripe";

export async function getPlatformBillingSettings() {
  const admin = await createAdminClient();
  const { data } = await admin.from("platform_billing_settings").select("*").eq("id", 1).maybeSingle();
  return data;
}

export async function ensureShopSubscription(shop: Pick<Shop, "id" | "name" | "owner_id">) {
  const admin = await createAdminClient();
  const { data: existing } = await admin
    .from("shop_subscriptions")
    .select("*")
    .eq("shop_id", shop.id)
    .maybeSingle();

  if (existing) return existing as ShopSubscription;

  const settings = await getPlatformBillingSettings();
  const { data, error } = await admin
    .from("shop_subscriptions")
    .insert({
      shop_id: shop.id,
      status: "trial",
      trial_ends_at: new Date(Date.now() + (settings?.trial_days || 30) * 86400000).toISOString(),
      monthly_price: settings?.monthly_price || 20,
      currency: settings?.currency || "USD",
      metadata: { source: "server-ensure" },
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as ShopSubscription;
}

export async function ensureShopStripeCustomer(
  shop: Pick<Shop, "id" | "name" | "owner_id">,
  ownerEmail?: string | null
) {
  const admin = await createAdminClient();
  const subscription = await ensureShopSubscription(shop);

  if (subscription.stripe_customer_id) {
    return subscription.stripe_customer_id;
  }

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    name: shop.name,
    email: ownerEmail || undefined,
    metadata: {
      shop_id: shop.id,
      owner_id: shop.owner_id,
      role: "shop_owner",
    },
  });

  await admin
    .from("shop_subscriptions")
    .update({ stripe_customer_id: customer.id })
    .eq("shop_id", shop.id);

  return customer.id;
}

export async function ensureClientStripeCustomer(client: Pick<Client, "id" | "user_id" | "name">, email?: string | null) {
  const admin = await createAdminClient();
  const { data: existing } = await admin
    .from("client_payment_methods")
    .select("stripe_customer_id")
    .eq("client_id", client.id)
    .not("stripe_customer_id", "is", null)
    .limit(1)
    .maybeSingle();

  if (existing?.stripe_customer_id) {
    return existing.stripe_customer_id;
  }

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    name: client.name,
    email: email || undefined,
    metadata: {
      client_id: client.id,
      user_id: client.user_id,
      role: "client",
    },
  });

  return customer.id;
}

function normalizeCard(paymentMethod: Stripe.PaymentMethod) {
  return {
    brand: paymentMethod.card?.brand || null,
    last4: paymentMethod.card?.last4 || null,
    exp_month: paymentMethod.card?.exp_month || null,
    exp_year: paymentMethod.card?.exp_year || null,
  };
}

export async function syncShopPaymentMethod(shopId: string, customerId: string, paymentMethod: Stripe.PaymentMethod) {
  const admin = await createAdminClient();

  await admin.from("shop_payment_methods").update({ is_default: false }).eq("shop_id", shopId);
  const { error } = await admin.from("shop_payment_methods").upsert(
    {
      shop_id: shopId,
      stripe_customer_id: customerId,
      stripe_payment_method_id: paymentMethod.id,
      is_default: true,
      ...normalizeCard(paymentMethod),
    },
    { onConflict: "stripe_payment_method_id" }
  );

  if (error) throw error;
}

export async function syncClientPaymentMethod(clientId: string, customerId: string, paymentMethod: Stripe.PaymentMethod) {
  const admin = await createAdminClient();

  await admin.from("client_payment_methods").update({ is_default: false }).eq("client_id", clientId);
  const { error } = await admin.from("client_payment_methods").upsert(
    {
      client_id: clientId,
      stripe_customer_id: customerId,
      stripe_payment_method_id: paymentMethod.id,
      is_default: true,
      ...normalizeCard(paymentMethod),
    },
    { onConflict: "stripe_payment_method_id" }
  );

  if (error) throw error;
}

export async function syncShopSubscriptionFromStripe(subscription: Stripe.Subscription) {
  const admin = await createAdminClient();
  const shopId = subscription.metadata.shop_id;
  if (!shopId) return;

  const price = subscription.items.data[0]?.price;
  await admin
    .from("shop_subscriptions")
    .update({
      status: mapStripeSubscriptionStatus(subscription.status),
      stripe_customer_id: typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
      stripe_subscription_id: subscription.id,
      stripe_price_id: price?.id || null,
      monthly_price: (price?.unit_amount || 0) / 100 || undefined,
      currency: price?.currency?.toUpperCase() || "USD",
      trial_ends_at: fromStripeTimestamp(subscription.trial_end),
      current_period_start: fromStripeTimestamp(subscription.items.data[0]?.current_period_start),
      current_period_end: fromStripeTimestamp(subscription.items.data[0]?.current_period_end),
      cancel_at_period_end: subscription.cancel_at_period_end,
      last_payment_error: null,
      metadata: subscription.metadata,
    })
    .eq("shop_id", shopId);
}

export async function syncBookingPaymentFromStripe(paymentIntent: Stripe.PaymentIntent) {
  const admin = await createAdminClient();
  const bookingId = paymentIntent.metadata.booking_id;
  const shopId = paymentIntent.metadata.shop_id;
  const clientId = paymentIntent.metadata.client_id;
  if (!bookingId || !shopId || !clientId) return;

  const status = mapStripePaymentStatus(paymentIntent.status);
  const paidAt = status === "paid" ? new Date().toISOString() : null;

  await admin.from("booking_payments").upsert(
    {
      booking_id: bookingId,
      shop_id: shopId,
      client_id: clientId,
      provider: "stripe",
      stripe_customer_id: typeof paymentIntent.customer === "string" ? paymentIntent.customer : paymentIntent.customer?.id || null,
      stripe_payment_intent_id: paymentIntent.id,
      stripe_payment_method_id:
        typeof paymentIntent.payment_method === "string" ? paymentIntent.payment_method : paymentIntent.payment_method?.id || null,
      amount: paymentIntent.amount / 100,
      currency: paymentIntent.currency.toUpperCase(),
      status,
      failure_reason: paymentIntent.last_payment_error?.message || null,
      refunded_amount: paymentIntent.amount_received < paymentIntent.amount ? (paymentIntent.amount - paymentIntent.amount_received) / 100 : 0,
      metadata: paymentIntent.metadata,
      paid_at: paidAt,
    },
    { onConflict: "booking_id" }
  );

  await admin
    .from("bookings")
    .update({
      payment_status: status,
      paid_at: paidAt,
      payment_amount: paymentIntent.amount / 100,
      payment_currency: paymentIntent.currency.toUpperCase(),
    })
    .eq("id", bookingId);
}
