import test from "node:test";
import assert from "node:assert/strict";

const {
  buildWhatsAppReminderUrl,
  getReminderChannelsLabel,
  isReminderEventDue,
  normalizeReminderChannels,
} = await import(new URL("./notifications.ts", import.meta.url).href);

test("normalizeReminderChannels keeps only supported unique channels", () => {
  assert.deepEqual(normalizeReminderChannels(["email", "whatsapp", "email", "sms"]), ["email", "whatsapp"]);
  assert.deepEqual(normalizeReminderChannels([]), []);
  assert.deepEqual(normalizeReminderChannels(null), ["email"]);
});

test("buildWhatsAppReminderUrl generates a WhatsApp Web link with prefilled text", () => {
  const url = buildWhatsAppReminderUrl({
    phone: "+1 (809) 555-0100",
    clientName: "Carlos",
    shopName: "Barber Studio",
    serviceName: "Tatuaje clásico",
    barberName: "Luis",
    date: "2026-05-04",
    startTime: "16:30:00",
  });

  assert.ok(url?.startsWith("https://web.whatsapp.com/send?phone=18095550100&text="));
  assert.ok(url?.includes("Carlos"));
  assert.ok(url?.includes("Barber%20Studio"));
});

test("isReminderEventDue only returns true for pending events already scheduled", () => {
  assert.equal(
    isReminderEventDue({
      status: "pending",
      scheduledFor: "2026-05-03T10:00:00.000Z",
      now: "2026-05-03T10:05:00.000Z",
    }),
    true
  );

  assert.equal(
    isReminderEventDue({
      status: "sent",
      scheduledFor: "2026-05-03T10:00:00.000Z",
      now: "2026-05-03T10:05:00.000Z",
    }),
    false
  );

  assert.equal(
    isReminderEventDue({
      status: "pending",
      scheduledFor: "2026-05-03T10:10:00.000Z",
      now: "2026-05-03T10:05:00.000Z",
    }),
    false
  );
});

test("getReminderChannelsLabel formats empty, single and dual channel states", () => {
  assert.equal(getReminderChannelsLabel([]), "Sin recordatorios");
  assert.equal(getReminderChannelsLabel(["email"]), "Correo");
  assert.equal(getReminderChannelsLabel(["whatsapp"]), "WhatsApp");
  assert.equal(getReminderChannelsLabel(["email", "whatsapp"]), "Correo y WhatsApp");
});
