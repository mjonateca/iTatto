import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedContext } from "@/lib/server-authz";

const profileSchema = z.object({
  display_name: z.string().min(2).optional(),
  bio: z.string().optional().nullable(),
  specialty: z.string().optional().nullable(),
  avatar_url: z.string().url().optional().or(z.literal("")).nullable(),
});

export async function PATCH(request: Request) {
  const context = await getAuthenticatedContext();
  if (context.response) return context.response;

  const parsed = profileSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 });
  }

  const patch = {
    ...parsed.data,
    avatar_url: parsed.data.avatar_url || null,
    bio: parsed.data.bio || null,
    specialty: parsed.data.specialty || null,
  };

  const { data, error } = await context.supabase
    .from("barbers")
    .update(patch)
    .eq("user_id", context.user.id)
    .select("*, shops(*)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
