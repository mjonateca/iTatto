import "server-only";
import Stripe from "stripe";

let stripeClient: Stripe | null = null;

export function getStripePublishableKey() {
  return process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY || "";
}

export function isStripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY no está configurada");
  }

  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2026-04-22.dahlia",
    });
  }

  return stripeClient;
}

export function getAppBaseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

export function toStripeAmount(amount: number, currency = "usd") {
  const zeroDecimalCurrencies = new Set(["jpy", "krw"]);
  return zeroDecimalCurrencies.has(currency.toLowerCase())
    ? Math.round(amount)
    : Math.round(amount * 100);
}

export function fromStripeTimestamp(value: number | null | undefined) {
  return value ? new Date(value * 1000).toISOString() : null;
}

export function mapStripeSubscriptionStatus(status: Stripe.Subscription.Status) {
  switch (status) {
    case "trialing":
      return "trial" as const;
    case "active":
      return "active" as const;
    case "past_due":
    case "unpaid":
      return "past_due" as const;
    case "canceled":
      return "cancelled" as const;
    case "incomplete":
    case "incomplete_expired":
      return "expired" as const;
    case "paused":
      return "past_due" as const;
    default:
      return "expired" as const;
  }
}

export function mapStripePaymentStatus(status: Stripe.PaymentIntent.Status) {
  switch (status) {
    case "succeeded":
      return "paid" as const;
    case "canceled":
      return "failed" as const;
    case "processing":
    case "requires_action":
    case "requires_capture":
    case "requires_confirmation":
    case "requires_payment_method":
      return "pending" as const;
    default:
      return "failed" as const;
  }
}
