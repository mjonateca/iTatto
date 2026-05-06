import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

type CookiesToSet = Array<{ name: string; value: string; options?: Record<string, unknown> }>;

const APP_BUSINESS_TYPE = "tattoo";

function filterShopSelects<T extends { from: (relation: string) => unknown }>(supabase: T): T {
  return new Proxy(supabase, {
    get(target, prop, receiver) {
      if (prop !== "from") return Reflect.get(target, prop, receiver);

      return (relation: string) => {
        const query = target.from(relation);
        if (relation !== "shops") return query;

        return new Proxy(query as object, {
          get(queryTarget, queryProp, queryReceiver) {
            if (queryProp !== "select") return Reflect.get(queryTarget, queryProp, queryReceiver);

            return (...args: unknown[]) => {
              const selected = Reflect.apply(
                Reflect.get(queryTarget, "select", queryReceiver) as (...selectArgs: unknown[]) => unknown,
                queryTarget,
                args
              );

              return Reflect.apply(
                Reflect.get(selected as object, "eq") as (column: string, value: string) => unknown,
                selected,
                ["business_type", APP_BUSINESS_TYPE]
              );
            };
          },
        });
      };
    },
  });
}

export async function createClient() {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component — cookies set in middleware
          }
        },
      },
    }
  );

  return filterShopSelects(supabase) as typeof supabase;
}

export async function createAdminClient() {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: { getAll: () => [], setAll: () => {} },
    }
  );

  return filterShopSelects(supabase) as typeof supabase;
}
