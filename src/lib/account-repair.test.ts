import test from "node:test";
import assert from "node:assert/strict";

const { buildAccountSeed, determineAccountRole } = await import(
  new URL("./account-repair.ts", import.meta.url).href
);

test("defaults legacy accounts with unknown metadata to client role", () => {
  const role = determineAccountRole({
    profileRole: null,
    hasClient: false,
    hasBarber: false,
    hasShop: false,
    metadata: { role: "admin", name: "MJ Calvo" },
  });

  assert.equal(role, "client");
});

test("prefers existing business records over stale metadata", () => {
  const role = determineAccountRole({
    profileRole: null,
    hasClient: false,
    hasBarber: false,
    hasShop: true,
    metadata: { account_type: "client" },
  });

  assert.equal(role, "shop_owner");
});

test("builds profile and client seed data for legacy client accounts", () => {
  const seed = buildAccountSeed({
    userId: "user-1",
    email: "mjcalvo92@gmail.com",
    metadata: { role: "admin", name: "MJ Calvo" },
    role: "client",
  });

  assert.deepEqual(seed.profile, {
    user_id: "user-1",
    role: "client",
    first_name: "MJ",
    last_name: "Calvo",
    business_name: null,
    email: "mjcalvo92@gmail.com",
    phone: null,
    country_code: "DO",
    country_name: "República Dominicana",
    city: "Santo Domingo",
  });

  assert.deepEqual(seed.client, {
    user_id: "user-1",
    name: "MJ Calvo",
    first_name: "MJ",
    last_name: "Calvo",
    phone: null,
    whatsapp: null,
    country_code: "DO",
    country_name: "República Dominicana",
    city: "Santo Domingo",
  });
});
