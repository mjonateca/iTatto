import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnedActiveShop } from "@/lib/server-authz";
import { normalizeMapsUrl } from "@/lib/utils";

const daySchema = z.object({
  open: z.string().regex(/^\d{2}:\d{2}$/),
  close: z.string().regex(/^\d{2}:\d{2}$/),
  closed: z.boolean(),
});

const shopSchema = z.object({
  opening_hours: z.record(daySchema).optional(),
  name: z.string().min(2).optional(),
  description: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  banner_url: z.string().url().nullable().optional(),
  currency: z.string().nullable().optional(),
  maps_url: z.string().nullable().optional(),
  reminder_channels: z.array(z.enum(["email", "whatsapp"])).optional(),
});

export async function PATCH(request: Request) {
  const parsed = shopSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 });
  }

  const context = await requireOwnedActiveShop();
  if (context.response) return context.response;

  const payload = {
    ...parsed.data,
    maps_url:
      typeof parsed.data.maps_url === "string"
        ? normalizeMapsUrl(parsed.data.maps_url)
        : parsed.data.maps_url,
  };

  const { data, error } = await context.supabase
    .from("shops")
    .update(payload)
    .eq("id", context.shop.id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
