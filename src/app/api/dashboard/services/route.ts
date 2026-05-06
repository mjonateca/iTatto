import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnedActiveShop } from "@/lib/server-authz";

const serviceSchema = z.object({
  shop_id: z.string().uuid().optional(),
  name: z.string().min(2),
  duration_min: z.coerce.number().int().min(5).max(480),
  price: z.coerce.number().min(0),
  description: z.string().optional(),
  category: z.string().optional(),
  is_visible: z.boolean().optional(),
  is_active: z.boolean().optional(),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const context = await requireOwnedActiveShop(searchParams.get("shop_id"));
  if (context.response) return context.response;

  const { data, error } = await context.supabase
    .from("services")
    .select("*")
    .eq("shop_id", context.shop.id)
    .order("sort_order")
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = serviceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 });
  }

  const context = await requireOwnedActiveShop(parsed.data.shop_id);
  if (context.response) return context.response;

  const { data: shop } = await context.supabase
    .from("shops")
    .select("currency")
    .eq("id", context.shop.id)
    .maybeSingle();

  const serviceCurrency = shop?.currency || "USD";

  let { data, error } = await context.supabase
    .from("services")
    .insert({
      shop_id: context.shop.id,
      name: parsed.data.name,
      duration_min: parsed.data.duration_min,
      price: parsed.data.price,
      currency: serviceCurrency,
      description: parsed.data.description || null,
      category: parsed.data.category || null,
      is_visible: parsed.data.is_visible ?? true,
      is_active: parsed.data.is_active ?? true,
    })
    .select()
    .single();

  if (error && /description|category|is_visible/.test(error.message)) {
    const fallback = await context.supabase
      .from("services")
      .insert({
        shop_id: context.shop.id,
        name: parsed.data.name,
        duration_min: parsed.data.duration_min,
        price: parsed.data.price,
        currency: serviceCurrency,
      })
      .select()
      .single();
    data = fallback.data;
    error = fallback.error;
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
