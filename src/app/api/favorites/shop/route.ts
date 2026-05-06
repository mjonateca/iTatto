import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedContext } from "@/lib/server-authz";
import { createAdminClient } from "@/lib/supabase/server";

const schema = z.object({ shop_id: z.string().uuid() });

async function getClient(context: Awaited<ReturnType<typeof getAuthenticatedContext>>) {
  if (!context.user || context.account?.role !== "client") return null;
  return context.account.client;
}

export async function POST(request: Request) {
  const context = await getAuthenticatedContext();
  if (context.response) return context.response;

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const client = await getClient(context);
  if (!client) return NextResponse.json({ error: "Perfil de cliente no encontrado" }, { status: 404 });
  const admin = await createAdminClient();

  const { error } = await admin
    .from("favorite_shops")
    .upsert({ client_id: client.id, shop_id: parsed.data.shop_id });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const context = await getAuthenticatedContext();
  if (context.response) return context.response;

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const client = await getClient(context);
  if (!client) return NextResponse.json({ error: "Perfil de cliente no encontrado" }, { status: 404 });
  const admin = await createAdminClient();

  const { error } = await admin
    .from("favorite_shops")
    .delete()
    .eq("client_id", client.id)
    .eq("shop_id", parsed.data.shop_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
