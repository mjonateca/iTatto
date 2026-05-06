import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireOwnedActiveShop } from "@/lib/server-authz";

const BUCKET = "shop-images";
const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await requireOwnedActiveShop();
  if (context.response) return context.response;

  // Verify barber belongs to this shop
  const { data: barber } = await context.supabase
    .from("barbers").select("id").eq("id", id).eq("shop_id", context.shop.id).single();
  if (!barber) return NextResponse.json({ error: "Tatuador no encontrado" }, { status: 404 });

  const formData = await request.formData().catch(() => null);
  if (!formData) return NextResponse.json({ error: "Payload inválido" }, { status: 400 });

  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No se recibió archivo" }, { status: 400 });
  if (!ALLOWED_TYPES.includes(file.type)) return NextResponse.json({ error: "Formato no permitido" }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: "Imagen supera 5 MB" }, { status: 400 });

  const ext = file.type === "image/webp" ? "webp" : file.type === "image/png" ? "png" : "jpg";
  const path = `${context.shop.id}/barbers/${id}-${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const admin = await createAdminClient();
  await admin.storage.createBucket(BUCKET, { public: true }).catch(() => {});

  const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, buffer, { contentType: file.type, upsert: true });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: urlData } = admin.storage.from(BUCKET).getPublicUrl(path);

  // Update barber avatar_url
  const { error: updateError } = await admin.from("barbers").update({ avatar_url: urlData.publicUrl }).eq("id", id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ url: urlData.publicUrl });
}
