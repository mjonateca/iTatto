import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { slugify } from "@/lib/utils";

const APP_BUSINESS_TYPE = "tattoo";

const createShopSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(3).max(50).regex(/^[a-z0-9-]+$/),
  phone: z.string().optional(),
  address: z.string().optional(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createShopSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Verificar que el slug no esté tomado
  const { data: existing } = await supabase
    .from("shops")
    .select("id")
    .eq("slug", parsed.data.slug)
    .single();

  if (existing) {
    // Generar slug único
    const uniqueSlug = await generateUniqueSlug(supabase, slugify(parsed.data.name));
    parsed.data.slug = uniqueSlug;
  }

  const { data: shop, error } = await supabase
    .from("shops")
    .insert({
      ...parsed.data,
      owner_id: user.id,
      business_type: APP_BUSINESS_TYPE,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(shop, { status: 201 });
}

async function generateUniqueSlug(
  supabase: Awaited<ReturnType<typeof createClient>>,
  base: string
): Promise<string> {
  let candidate = base;
  let counter = 1;
  while (true) {
    const { data } = await supabase
      .from("shops")
      .select("id")
      .eq("slug", candidate)
      .single();
    if (!data) return candidate;
    candidate = `${base}-${counter++}`;
  }
}
