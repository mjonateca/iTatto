import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureAccountRecords } from "@/lib/account-repair";
import type { SubscriptionStatus } from "@/types/database";

export async function getAuthenticatedContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      supabase,
      user: null,
      account: null,
      response: NextResponse.json({ error: "No autorizado" }, { status: 401 }),
    };
  }

  const account = await ensureAccountRecords(user);
  return { supabase, user, account, response: null };
}

export async function requireOwnedShop(shopId?: string | null) {
  const context = await getAuthenticatedContext();
  if (context.response) return { ...context, shop: null };

  let query = context.supabase
    .from("shops")
    .select("id, owner_id, name, slug, reminder_channels, reminder_lead_minutes")
    .eq("owner_id", context.user.id);

  if (shopId) query = query.eq("id", shopId);

  const { data: shop, error } = await query.single();

  if (error || !shop) {
    return {
      ...context,
      shop: null,
      response: NextResponse.json({ error: "No autorizado" }, { status: 403 }),
    };
  }

  return { ...context, shop, response: null };
}

export async function requireOwnedActiveShop(shopId?: string | null) {
  const context = await requireOwnedShop(shopId);
  if (context.response) return { ...context, subscription: null };

  const { data: subscription } = await context.supabase
    .from("shop_subscriptions")
    .select("status, current_period_end")
    .eq("shop_id", context.shop.id)
    .maybeSingle();

  if (!isSubscriptionAccessible(subscription?.status, subscription?.current_period_end)) {
    return {
      ...context,
      subscription,
      response: NextResponse.json(
        { error: "Tu suscripción no está activa. Actualiza tu plan para seguir gestionando la estudio de tatuajes." },
        { status: 402 }
      ),
    };
  }

  return { ...context, subscription, response: null };
}

export function isSubscriptionAccessible(
  status: SubscriptionStatus | null | undefined,
  currentPeriodEnd?: string | null
) {
  if (status === "trial" || status === "active") return true;
  if (status === "past_due" && currentPeriodEnd) {
    return new Date(currentPeriodEnd).getTime() >= Date.now();
  }
  return false;
}
