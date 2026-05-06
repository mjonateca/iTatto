import { NextResponse } from "next/server";
import { requireOwnedActiveShop } from "@/lib/server-authz";

export async function GET() {
  const context = await requireOwnedActiveShop();
  if (context.response) return context.response;

  // reviews table has trigger that keeps barbers.rating updated automatically
  // join barbers to filter by shop_id
  const { data, error } = await context.supabase
    .from("reviews")
    .select("*, barbers!inner(id, display_name, shop_id)")
    .eq("barbers.shop_id", context.shop.id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}
