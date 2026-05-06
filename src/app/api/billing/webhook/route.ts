import { headers } from "next/headers";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/server";
import {
  syncBookingPaymentFromStripe,
  syncClientPaymentMethod,
  syncShopPaymentMethod,
  syncShopSubscriptionFromStripe,
} from "@/lib/billing";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.text();
  const signature = (await headers()).get("stripe-signature");

  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Firma de webhook no configurada" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Webhook inválido" }, { status: 400 });
  }

  const admin = await createAdminClient();

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await syncShopSubscriptionFromStripe(event.data.object as Stripe.Subscription);
        break;
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
        if (customerId) {
          await admin
            .from("shop_subscriptions")
            .update({
              status: "past_due",
              last_payment_error: invoice.last_finalization_error?.message || invoice.confirmation_secret?.type || "Pago fallido",
            })
            .eq("stripe_customer_id", customerId);
        }
        break;
      }
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
        if (customerId) {
          await admin
            .from("shop_subscriptions")
            .update({
              status: invoice.billing_reason === "subscription_create" ? "trial" : "active",
              last_payment_error: null,
            })
            .eq("stripe_customer_id", customerId);
        }
        break;
      }
      case "setup_intent.succeeded": {
        const setupIntent = event.data.object as Stripe.SetupIntent;
        if (!setupIntent.payment_method) break;
        const metadata = setupIntent.metadata || {};
        const paymentMethod = await getStripe().paymentMethods.retrieve(
          typeof setupIntent.payment_method === "string" ? setupIntent.payment_method : setupIntent.payment_method.id
        );
        const customerId = typeof setupIntent.customer === "string" ? setupIntent.customer : setupIntent.customer?.id || null;

        if (metadata.role === "client" && metadata.client_id && customerId) {
          await syncClientPaymentMethod(metadata.client_id, customerId, paymentMethod);
        }

        if (metadata.role === "shop_owner" && metadata.shop_id && customerId) {
          await syncShopPaymentMethod(metadata.shop_id, customerId, paymentMethod);
        }
        break;
      }
      case "payment_intent.succeeded":
      case "payment_intent.payment_failed":
      case "payment_intent.canceled":
        await syncBookingPaymentFromStripe(event.data.object as Stripe.PaymentIntent);
        break;
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        if (typeof charge.payment_intent === "string") {
          await admin
            .from("booking_payments")
            .update({
              status: "refunded",
              refunded_amount: charge.amount_refunded / 100,
            })
            .eq("stripe_payment_intent_id", charge.payment_intent);
        }
        break;
      }
      default:
        break;
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error procesando webhook" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
