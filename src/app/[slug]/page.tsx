import { notFound } from "next/navigation";
import { ensureAccountRecords } from "@/lib/account-repair";
import { createClient } from "@/lib/supabase/server";
import { IS_DEMO, demoShop, demoBarbers, demoServices } from "@/lib/demo-data";
import type { Metadata } from "next";
import type { AccountRole } from "@/types/database";
import ShopPublicView from "./shop-public-view";

const APP_BUSINESS_TYPE = "tattoo";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  if (IS_DEMO) return { title: `${demoShop.name} — Demo` };

  const supabase = await createClient();
  const { data: shop } = await supabase
    .from("shops")
    .select("name, address")
    .eq("slug", slug)
    .eq("business_type", APP_BUSINESS_TYPE)
    .single();

  if (!shop) return { title: "Estudio no encontrada" };
  return {
    title: shop.name,
    description: `Reserva tu cita en ${shop.name}${shop.address ? ` · ${shop.address}` : ""}`,
  };
}

export default async function ShopPage({ params }: Props) {
  const { slug } = await params;

  if (IS_DEMO) {
    const shop = {
      ...demoShop,
      slug,
      barbers: demoBarbers.map((b) => ({ ...b, barber_services: [] })),
      services: demoServices,
    };
    return <ShopPublicView shop={shop as Parameters<typeof ShopPublicView>[0]["shop"]} />;
  }

  const supabase = await createClient();
  const [{ data: shop }, { data: auth }] = await Promise.all([
    supabase
      .from("shops")
      .select("*, barbers(*, barber_services(service_id)), services(*)")
      .eq("slug", slug)
      .eq("business_type", APP_BUSINESS_TYPE)
      .eq("services.is_active", true)
      .single(),
    supabase.auth.getUser(),
  ]);

  if (!shop) notFound();

  let viewerRole: AccountRole | null = null;
  if (auth.user) {
    const account = await ensureAccountRecords(auth.user);
    viewerRole = account.role;
  }

  return <ShopPublicView shop={shop} viewerRole={viewerRole} />;
}
