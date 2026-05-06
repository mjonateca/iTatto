import type { User } from "@supabase/supabase-js";
import { getCitiesForCountry, getCountryName } from "./locations";
import type { AccountRole, Client, Profile } from "../types/database";

type Metadata = Record<string, unknown> | null | undefined;

type ExistingProfile = Pick<
  Profile,
  "role" | "first_name" | "last_name" | "business_name" | "email" | "phone" | "country_code" | "country_name" | "city"
>;

type ExistingClient = Pick<
  Client,
  "name" | "first_name" | "last_name" | "phone" | "whatsapp" | "country_code" | "country_name" | "city"
>;

type SeedInput = {
  userId: string;
  email: string | null | undefined;
  metadata: Metadata;
  role: AccountRole;
  profile?: Partial<ExistingProfile> | null;
  client?: Partial<ExistingClient> | null;
};

type ProfileSeed = {
  user_id: string;
  role: AccountRole;
  first_name: string | null;
  last_name: string | null;
  business_name: string | null;
  email: string | null;
  phone: string | null;
  country_code: string;
  country_name: string;
  city: string;
};

type ClientSeed = {
  user_id: string;
  name: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  whatsapp: string | null;
  country_code: string;
  country_name: string;
  city: string;
};

function readString(metadata: Metadata, ...keys: string[]) {
  for (const key of keys) {
    const value = metadata?.[key];
    if (typeof value === "string") {
      const clean = value.trim();
      if (clean) return clean;
    }
  }
  return null;
}

function pickString(...values: Array<string | null | undefined>) {
  for (const value of values) {
    if (typeof value === "string") {
      const clean = value.trim();
      if (clean) return clean;
    }
  }
  return null;
}

function splitName(name: string | null) {
  const compact = name?.trim().replace(/\s+/g, " ") || "";
  if (!compact) {
    return { firstName: null, lastName: null };
  }

  const [firstName, ...rest] = compact.split(" ");
  return {
    firstName: firstName || null,
    lastName: rest.join(" ").trim() || null,
  };
}

function normalizeRole(value: string | null | undefined): AccountRole | null {
  switch (value?.trim().toLowerCase()) {
    case "client":
      return "client";
    case "barber":
      return "barber";
    case "shop_owner":
    case "barbershop":
      return "shop_owner";
    default:
      return null;
  }
}

function fallbackNameFromEmail(email: string | null | undefined) {
  const localPart = email?.split("@")[0]?.trim();
  return localPart || "Cliente";
}

export function determineAccountRole({
  profileRole,
  hasClient,
  hasBarber,
  hasShop,
  metadata,
}: {
  profileRole: AccountRole | null | undefined;
  hasClient: boolean;
  hasBarber: boolean;
  hasShop: boolean;
  metadata: Metadata;
}) {
  return (
    profileRole ||
    (hasShop ? "shop_owner" : null) ||
    (hasBarber ? "barber" : null) ||
    (hasClient ? "client" : null) ||
    normalizeRole(readString(metadata, "account_type", "role")) ||
    "client"
  );
}

export function buildAccountSeed(input: SeedInput) {
  const existingProfile = input.profile || null;
  const existingClient = input.client || null;
  const fullName = pickString(
    readString(input.metadata, "full_name", "name"),
    fallbackNameFromEmail(input.email)
  );
  const split = splitName(fullName);
  const firstName = pickString(existingProfile?.first_name, readString(input.metadata, "first_name"), split.firstName);
  const lastName = pickString(existingProfile?.last_name, readString(input.metadata, "last_name"), split.lastName);
  const businessName =
    input.role === "shop_owner"
      ? pickString(existingProfile?.business_name, readString(input.metadata, "business_name"), fullName, "Estudio")
      : null;
  const phone = pickString(existingProfile?.phone, existingClient?.phone, readString(input.metadata, "phone"));
  const countryCode = (pickString(existingProfile?.country_code, existingClient?.country_code, readString(input.metadata, "country_code")) || "US").toUpperCase();
  const countryName = pickString(
    existingProfile?.country_name,
    existingClient?.country_name,
    readString(input.metadata, "country_name"),
    getCountryName(countryCode)
  ) || getCountryName(countryCode);
  const city = pickString(
    existingProfile?.city,
    existingClient?.city,
    readString(input.metadata, "city"),
    getCitiesForCountry(countryCode)[0] || null
  ) || "New York";
  const clientName = pickString(
    existingClient?.name,
    [firstName, lastName].filter(Boolean).join(" "),
    fullName,
    fallbackNameFromEmail(input.email)
  ) || "Cliente";

  const profile: ProfileSeed = {
    user_id: input.userId,
    role: input.role,
    first_name: firstName,
    last_name: lastName,
    business_name: businessName,
    email: input.email || existingProfile?.email || null,
    phone,
    country_code: countryCode,
    country_name: countryName,
    city,
  };

  const client: ClientSeed | null = input.role === "client"
    ? {
        user_id: input.userId,
        name: clientName,
        first_name: firstName,
        last_name: lastName,
        phone,
        whatsapp: pickString(existingClient?.whatsapp, phone),
        country_code: countryCode,
        country_name: countryName,
        city,
      }
    : null;

  return { profile, client };
}

export async function ensureAccountRecords(user: Pick<User, "id" | "email" | "user_metadata">) {
  const { createAdminClient } = await import("./supabase/server");
  const admin = await createAdminClient();

  const [{ data: profile }, { data: client }, { data: barber }, { data: shop }] = await Promise.all([
    admin.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
    admin.from("clients").select("*").eq("user_id", user.id).maybeSingle(),
    admin.from("barbers").select("id").eq("user_id", user.id).maybeSingle(),
    admin.from("shops").select("id").eq("owner_id", user.id).maybeSingle(),
  ]);

  const role = determineAccountRole({
    profileRole: profile?.role,
    hasClient: Boolean(client),
    hasBarber: Boolean(barber),
    hasShop: Boolean(shop),
    metadata: user.user_metadata as Metadata,
  });

  const seed = buildAccountSeed({
    userId: user.id,
    email: user.email,
    metadata: user.user_metadata as Metadata,
    role,
    profile,
    client,
  });

  const { data: ensuredProfile, error: profileError } = await admin
    .from("profiles")
    .upsert(seed.profile, { onConflict: "user_id" })
    .select("*")
    .single();

  if (profileError) {
    throw profileError;
  }

  let ensuredClient = client || null;
  if (seed.client) {
    const { data: upsertedClient, error: clientError } = await admin
      .from("clients")
      .upsert(seed.client, { onConflict: "user_id" })
      .select("*")
      .single();

    if (clientError) {
      throw clientError;
    }

    ensuredClient = upsertedClient;
  }

  return {
    role,
    profile: ensuredProfile as Profile,
    client: ensuredClient as Client | null,
    hasBarber: Boolean(barber),
    hasShop: Boolean(shop),
  };
}
