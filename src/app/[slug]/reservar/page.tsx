import { notFound, redirect } from "next/navigation";
import { ensureAccountRecords } from "@/lib/account-repair";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { IS_DEMO, demoShop, demoBarbers, demoServices, demoClient } from "@/lib/demo-data";
import type { AccountRole } from "@/types/database";
import BookingRoleNotice from "./booking-role-notice";
import BookingFlow from "./booking-flow";

const APP_BUSINESS_TYPE = "tattoo";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ barber?: string }>;
}

export const metadata = { title: "Reservar cita" };

export default async function ReservarPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { barber: preselectedBarber } = await searchParams;
  const bookingPath = `/${slug}/reservar${preselectedBarber ? `?barber=${preselectedBarber}` : ""}`;

  if (IS_DEMO) {
    const shop = {
      ...demoShop,
      slug,
      barbers: demoBarbers,
      services: demoServices,
    };
    return (
      <BookingFlow
        shop={shop as Parameters<typeof BookingFlow>[0]["shop"]}
        client={demoClient}
        preselectedBarberId={preselectedBarber}
      />
    );
  }

  const supabase = await createClient();
  const { data: shop } = await supabase
    .from("shops")
    .select("*, barbers(*, barber_services(service_id)), services(*)")
    .eq("slug", slug)
    .eq("business_type", APP_BUSINESS_TYPE)
    .eq("services.is_active", true)
    .single();

  if (!shop) notFound();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?redirect=${encodeURIComponent(bookingPath)}`);
  }

  const account = await ensureAccountRecords(user);
  const profile = account.profile;

  if (account.role !== "client") {
    return (
      <BookingRoleNotice
        role={account.role as AccountRole}
        shopSlug={slug}
      />
    );
  }

  let client = account.client;

  if (!client) {
    const admin = await createAdminClient();
    const fullName =
      `${profile.first_name || ""} ${profile.last_name || ""}`.trim() ||
      user.user_metadata?.full_name ||
      user.email ||
      "Cliente";

    const { data: newClient } = await admin
      .from("clients")
      .insert({
        user_id: user.id,
        name: fullName,
        first_name: profile.first_name,
        last_name: profile.last_name,
        phone: profile.phone,
        whatsapp: profile.phone,
        country_code: profile.country_code,
        country_name: profile.country_name,
        city: profile.city,
      })
      .select().single();
    client = newClient;
  }

  if (!client) {
    redirect("/login");
  }

  return (
    <BookingFlow
      shop={shop}
      client={client!}
      preselectedBarberId={preselectedBarber}
    />
  );
}
