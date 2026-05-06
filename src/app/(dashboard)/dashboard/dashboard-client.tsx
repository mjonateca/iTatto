"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { InputHTMLAttributes } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  CalendarDays,
  Camera,
  Clock,
  CreditCard,
  ExternalLink,
  ImageIcon,
  Loader2,
  Mail,
  Scissors,
  Send,
  Star,
  Trash2,
  TrendingUp,
  Upload,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { createClient } from "@/lib/supabase/client";
import { buildAppUrl, formatCurrency, formatTime, getCurrentDateInTimeZone, getCurrentTimeInTimeZone } from "@/lib/utils";
import { getTimeZoneForCountry } from "@/lib/locations";
import type {
  Barber,
  BarberRating,
  BookingStatus,
  EmailNotification,
  NotificationEvent,
  PendingEmailReminder,
  PendingWhatsappReminder,
  PaymentStatus,
  Service,
  Shop,
  ShopPaymentMethod,
  ShopSubscription,
  SubscriptionStatus,
} from "@/types/database";
import { getReminderChannelsLabel, normalizeReminderChannels, type ReminderChannel } from "@/lib/notifications";

export interface BookingWithRelations {
  id: string;
  client_id?: string | null;
  client_name?: string | null;
  client_phone?: string | null;
  notes?: string | null;
  date?: string;
  start_time: string;
  end_time: string;
  status: BookingStatus;
  payment_status: PaymentStatus;
  payment_required: boolean;
  payment_amount: number;
  payment_currency: string;
  whatsapp_reminder_sent?: boolean;
  clients: { name: string; phone: string | null; whatsapp: string | null } | null;
  barbers: { display_name: string } | null;
  services: { name: string; duration_min: number; price: number } | null;
}

type BarberWithServices = Barber & { barber_services?: Array<{ service_id: string }> };
type ClientSummary = {
  id: string;
  name: string;
  phone: string | null;
  whatsapp: string | null;
  city?: string | null;
  country_name?: string | null;
};

type ManualBookingFormState = {
  client_id: string;
  client_name: string;
  client_phone: string;
  barber_id: string;
  service_id: string;
  date: string;
  start_time: string;
  notes: string;
};

type OpeningHoursValue = Record<string, { open: string; close: string; closed: boolean }>;

type Analytics = {
  totalsByStatus: { total: number; confirmed: number; pending: number; cancelled: number; completed: number };
  estimatedRevenue: number;
  realizedRevenue: number;
  avgServiceTime: number;
  avgTicket: number;
  recurrentClients: number;
  topServices: Array<{ name: string; count: number; revenue: number }>;
  topBarbers: Array<{ name: string; count: number; revenue: number; completed: number }>;
  bestBarbers: Array<{ name: string; count: number; revenue: number; completed: number; completionRate: number }>;
  peakHours: Array<{ slot: string; count: number }>;
  peakWeekdays: Array<{ day: string; count: number }>;
  evolutions: { day: Array<{ label: string; value: number }>; week: Array<{ label: string; value: number }>; month: Array<{ label: string; value: number }> };
  avgLeadMinutes: number;
};

interface Props {
  shop: Shop;
  todayBookings: BookingWithRelations[];
  bookings: BookingWithRelations[];
  services: Service[];
  barbers: BarberWithServices[];
  clients: ClientSummary[];
  notificationEvents: NotificationEvent[];
  ratings: BarberRating[];
  emailNotifications: EmailNotification[];
  pendingEmailReminders: PendingEmailReminder[];
  pendingWhatsappReminders: PendingWhatsappReminder[];
  subscription: ShopSubscription | null;
  paymentMethods: ShopPaymentMethod[];
  analytics: Analytics;
  stats: { totalCompleted: number; upcomingConfirmed: number; expectedToday: number; expectedWeek: number };
  todayStr: string;
  initialTab?: string;
}

type TabId = "summary" | "bookings" | "services" | "barbers" | "clients" | "schedule" | "notifications" | "settings";

const STATUS_LABELS: Record<BookingStatus, string> = {
  pending: "Pendiente",
  confirmed: "Confirmada",
  rescheduled: "Reprogramada",
  completed: "Completada",
  no_show: "No se presentó",
  cancelled: "Cancelada",
};

const STATUS_COLORS: Record<BookingStatus, string> = {
  pending: "bg-amber-100 text-amber-700 border-amber-200",
  confirmed: "bg-emerald-100 text-emerald-700 border-emerald-200",
  rescheduled: "bg-blue-100 text-blue-700 border-blue-200",
  completed: "bg-primary/10 text-primary border-primary/20",
  no_show: "bg-red-100 text-red-700 border-red-200",
  cancelled: "bg-zinc-100 text-zinc-500 border-zinc-200",
};

const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: "Pendiente de pago",
  paid: "Pagada",
  failed: "Pago fallido",
  refunded: "Reembolsada",
};

const SUBSCRIPTION_LABELS: Record<SubscriptionStatus, string> = {
  trial: "Prueba gratis",
  active: "Activa",
  past_due: "Pago pendiente",
  cancelled: "Cancelada",
  expired: "Vencida",
};

const WEEK_DAYS = [
  { key: "lunes", label: "Lunes" },
  { key: "martes", label: "Martes" },
  { key: "miercoles", label: "Miércoles" },
  { key: "jueves", label: "Jueves" },
  { key: "viernes", label: "Viernes" },
  { key: "sabado", label: "Sábado" },
  { key: "domingo", label: "Domingo" },
] as const;

function defaultOpeningHours(): OpeningHoursValue {
  return {
    lunes: { open: "09:00", close: "19:00", closed: false },
    martes: { open: "09:00", close: "19:00", closed: false },
    miercoles: { open: "09:00", close: "19:00", closed: false },
    jueves: { open: "09:00", close: "19:00", closed: false },
    viernes: { open: "09:00", close: "19:00", closed: false },
    sabado: { open: "09:00", close: "17:00", closed: false },
    domingo: { open: "09:00", close: "13:00", closed: true },
  };
}

function normalizeOpeningHours(value: Shop["opening_hours"]): OpeningHoursValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaultOpeningHours();
  const fallback = defaultOpeningHours();
  const raw = value as Record<string, unknown>;
  const normalized: OpeningHoursValue = { ...fallback };
  for (const day of WEEK_DAYS) {
    const current = raw[day.key];
    if (current && typeof current === "object" && !Array.isArray(current)) {
      const dayValue = current as Record<string, unknown>;
      normalized[day.key] = {
        open: typeof dayValue.open === "string" ? dayValue.open : fallback[day.key].open,
        close: typeof dayValue.close === "string" ? dayValue.close : fallback[day.key].close,
        closed: typeof dayValue.closed === "boolean" ? dayValue.closed : fallback[day.key].closed,
      };
    }
  }
  return normalized;
}

function addMinutesToTime(value: string, minutesToAdd: number) {
  const [hours, minutes] = value.split(":").map(Number);
  const totalMinutes = (hours * 60) + minutes + minutesToAdd;
  const nextHours = Math.floor(totalMinutes / 60);
  const nextMinutes = totalMinutes % 60;
  return `${nextHours.toString().padStart(2, "0")}:${nextMinutes.toString().padStart(2, "0")}:00`;
}

function subscriptionTone(status?: SubscriptionStatus | null) {
  switch (status) {
    case "active": case "trial": return "text-emerald-600";
    case "past_due": return "text-amber-600";
    default: return "text-destructive";
  }
}

function StarDisplay({ rating, size = "sm" }: { rating: number; size?: "sm" | "md" }) {
  const sz = size === "md" ? "h-5 w-5" : "h-3.5 w-3.5";
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`${sz} ${i <= Math.round(rating) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
      ))}
    </div>
  );
}

export default function DashboardClient({
  shop,
  todayBookings,
  bookings: initialBookings,
  services: initialServices,
  barbers: initialBarbers,
  clients,
  ratings,
  emailNotifications: initialEmailNotifications,
  pendingEmailReminders: initialPendingEmailReminders,
  pendingWhatsappReminders: initialPendingWhatsappReminders,
  subscription,
  paymentMethods,
  analytics,
  stats,
  todayStr,
  initialTab = "summary",
}: Props) {
  const searchParams = useSearchParams();
  const currentTab = (searchParams.get("tab") || initialTab) as TabId;
  const [bookings, setBookings] = useState(initialBookings);
  const [services, setServices] = useState(initialServices);
  const [barbers, setBarbers] = useState(initialBarbers);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deletingServiceId, setDeletingServiceId] = useState<string | null>(null);
  const [shopState, setShopState] = useState(shop);
  const [openingHours, setOpeningHours] = useState<OpeningHoursValue>(() => normalizeOpeningHours(shop.opening_hours));
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [billingAction, setBillingAction] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [bannerPreview, setBannerPreview] = useState<string | null>(shop.banner_url || null);
  const [uploadingBarberPhoto, setUploadingBarberPhoto] = useState<string | null>(null);
  const [emailNotifications, setEmailNotifications] = useState(initialEmailNotifications);
  const [pendingEmailReminders, setPendingEmailReminders] = useState(initialPendingEmailReminders);
  const [pendingWhatsappReminders, setPendingWhatsappReminders] = useState(initialPendingWhatsappReminders);
  const [openingWhatsAppId, setOpeningWhatsAppId] = useState<string | null>(null);
  const [sendingEmailBookingId, setSendingEmailBookingId] = useState<string | null>(null);
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [creatingManualBooking, setCreatingManualBooking] = useState(false);
  const [showManualBookingForm, setShowManualBookingForm] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [reminderChannels, setReminderChannels] = useState<ReminderChannel[]>(() => normalizeReminderChannels(shop.reminder_channels));
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const shopTimeZone = useMemo(() => getTimeZoneForCountry(shopState.country_code || ""), [shopState.country_code]);
  const todayDateInput = useMemo(() => getCurrentDateInTimeZone(shopTimeZone), [shopTimeZone]);
  const [manualBookingForm, setManualBookingForm] = useState<ManualBookingFormState>({
    client_id: "",
    client_name: "",
    client_phone: "",
    barber_id: "",
    service_id: "",
    date: todayDateInput,
    start_time: "",
    notes: "",
  });

  useEffect(() => {
    setManualBookingForm((current) => ({
      ...current,
      date: current.date || todayDateInput,
    }));
  }, [todayDateInput]);

  const clientItems = useMemo(
    () =>
      clients
        .filter((c) => !clientSearch || c.name.toLowerCase().includes(clientSearch.toLowerCase()))
        .map((client) => ({
          title: client.name,
          detail: `${client.phone || client.whatsapp || "Sin teléfono"}${client.city ? ` · ${client.city}` : ""}`,
        })),
    [clients, clientSearch]
  );

  const todayTimeline = useMemo(
    () => [...todayBookings].sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [todayBookings]
  );

  const activeBarbers = useMemo(
    () => barbers.filter((barber) => barber.is_active !== false),
    [barbers]
  );

  const activeServices = useMemo(
    () => services.filter((service) => service.is_active),
    [services]
  );
  const reminderEmailsSentByBooking = useMemo(
    () =>
      new Set(
        emailNotifications
          .filter((notification) => notification.type === "reminder" && notification.status === "sent" && notification.booking_id)
          .map((notification) => notification.booking_id as string)
      ),
    [emailNotifications]
  );
  const todayEmailNotifications = useMemo(
    () =>
      emailNotifications.filter(
        (notification) => getCurrentDateInTimeZone(shopTimeZone, new Date(notification.created_at)) === todayDateInput
      ),
    [emailNotifications, shopTimeZone, todayDateInput]
  );
  const isEmailEnabled = reminderChannels.includes("email");
  const isWhatsAppEnabled = reminderChannels.includes("whatsapp");

  function isReminderEligible(booking: BookingWithRelations) {
    if (booking.status !== "confirmed" || !booking.date) return false;

    const today = getCurrentDateInTimeZone(shopTimeZone);
    if (booking.date > today) return true;
    if (booking.date < today) return false;

    const currentTime = getCurrentTimeInTimeZone(shopTimeZone);
    return booking.start_time.slice(0, 5) > currentTime;
  }

  // Ratings grouped by barber_id
  const ratingsByBarber = useMemo(() => {
    const map: Record<string, BarberRating[]> = {};
    for (const r of ratings) {
      if (!map[r.barber_id]) map[r.barber_id] = [];
      map[r.barber_id].push(r);
    }
    return map;
  }, [ratings]);

  function updateDay(day: keyof OpeningHoursValue, field: "open" | "close" | "closed", value: string | boolean) {
    setOpeningHours((current) => ({ ...current, [day]: { ...current[day], [field]: value } }));
  }

  async function updateBooking(bookingId: string, status: BookingStatus) {
    setUpdatingId(bookingId);
    const response = await fetch(`/api/bookings/${bookingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const payload = await response.json().catch(() => ({ error: "Error inesperado" }));
    if (!response.ok) {
      toast({ variant: "destructive", title: "No se actualizó la reserva", description: payload.error });
    } else {
      setBookings((prev) => prev.map((b) => (b.id === bookingId ? { ...b, status } : b)));
      toast({ title: STATUS_LABELS[status] });
    }
    setUpdatingId(null);
  }

  async function createService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/dashboard/services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shop_id: shopState.id,
        name: form.get("name"),
        category: form.get("category"),
        description: form.get("description"),
        duration_min: Number(form.get("duration_min")),
        price: Number(form.get("price")),
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { toast({ variant: "destructive", title: "No se creó el servicio", description: payload.error }); return; }
    setServices((prev) => [...prev, payload]);
    event.currentTarget.reset();
    toast({ title: "Servicio creado" });
  }

  async function toggleService(service: Service) {
    const response = await fetch(`/api/dashboard/services/${service.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !service.is_active, is_visible: !service.is_active }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      toast({ variant: "destructive", title: "Error", description: payload.error });
      return;
    }
    setServices((prev) => prev.map((item) => item.id === service.id ? { ...item, is_active: !item.is_active, is_visible: !item.is_active } : item));
  }

  async function deleteService(service: Service) {
    if (!window.confirm(`¿Eliminar "${service.name}"? Esta acción no se puede deshacer.`)) return;
    setDeletingServiceId(service.id);
    const response = await fetch(`/api/dashboard/services/${service.id}`, { method: "DELETE" });
    setDeletingServiceId(null);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      toast({ variant: "destructive", title: "No se eliminó el servicio", description: payload.error });
      return;
    }
    setServices((prev) => prev.filter((s) => s.id !== service.id));
    toast({ title: "Servicio eliminado" });
  }

  async function createBarber(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const serviceIds = form.getAll("service_ids").map(String);
    const response = await fetch("/api/dashboard/barbers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shop_id: shopState.id, display_name: form.get("display_name"), specialty: form.get("specialty"), bio: form.get("bio"), service_ids: serviceIds }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { toast({ variant: "destructive", title: "No se creó el artista", description: payload.error }); return; }
    setBarbers((prev) => [...prev, { ...payload, barber_services: serviceIds.map((id) => ({ service_id: id })) }]);
    event.currentTarget.reset();
    toast({ title: "Artista creado" });
  }

  async function toggleBarber(barber: BarberWithServices) {
    const response = await fetch(`/api/dashboard/barbers/${barber.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !barber.is_active }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      toast({ variant: "destructive", title: "Error", description: payload.error });
      return;
    }
    setBarbers((prev) => prev.map((item) => (item.id === barber.id ? { ...item, is_active: !item.is_active } : item)));
  }

  async function uploadBarberPhoto(barberId: string, file: File) {
    if (file.size > 5 * 1024 * 1024) { toast({ variant: "destructive", title: "Imagen demasiado grande", description: "Máx. 5 MB" }); return; }
    setUploadingBarberPhoto(barberId);
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`/api/dashboard/barbers/${barberId}/upload-photo`, { method: "POST", body: formData });
    const payload = await res.json().catch(() => ({}));
    setUploadingBarberPhoto(null);
    if (!res.ok) { toast({ variant: "destructive", title: "Error al subir foto", description: payload.error }); return; }
    setBarbers((prev) => prev.map((b) => b.id === barberId ? { ...b, avatar_url: payload.url } : b));
    toast({ title: "Foto actualizada" });
  }

  async function saveSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingSchedule(true);
    const invalidDay = WEEK_DAYS.find(({ key }) => { const day = openingHours[key]; return !day.closed && day.open >= day.close; });
    if (invalidDay) {
      toast({ variant: "destructive", title: "Horario inválido", description: `Revisa ${invalidDay.label}` });
      setSavingSchedule(false);
      return;
    }
    const response = await fetch("/api/dashboard/shop", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ opening_hours: openingHours }) });
    const payload = await response.json().catch(() => ({}));
    setSavingSchedule(false);
    if (!response.ok) { toast({ variant: "destructive", title: "No se guardó el horario", description: payload.error }); return; }
    setShopState(payload);
    toast({ title: "Horario actualizado" });
  }

  async function saveShopInfo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingSettings(true);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/dashboard/shop", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: form.get("address"), phone: form.get("phone"), description: form.get("description"), maps_url: form.get("maps_url") || null }),
    });
    const payload = await response.json().catch(() => ({}));
    setSavingSettings(false);
    if (!response.ok) { toast({ variant: "destructive", title: "Error", description: payload.error }); return; }
    setShopState(payload);
    toast({ title: "Ajustes guardados" });
  }

  async function handleBannerChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast({ variant: "destructive", title: "Imagen demasiado grande", description: "Máx. 5 MB" }); return; }
    setBannerPreview(URL.createObjectURL(file));
    setUploadingBanner(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", "banner");
    const res = await fetch("/api/dashboard/shop/upload-image", { method: "POST", body: formData });
    const payload = await res.json().catch(() => ({}));
    setUploadingBanner(false);
    if (!res.ok) { toast({ variant: "destructive", title: "Error al subir imagen", description: payload.error }); setBannerPreview(shop.banner_url || null); return; }
    const patchRes = await fetch("/api/dashboard/shop", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ banner_url: payload.url }) });
    if (patchRes.ok) { const p = await patchRes.json().catch(() => ({})); setShopState(p); setBannerPreview(payload.url); toast({ title: "Banner actualizado" }); }
  }

  async function removeBanner() {
    const res = await fetch("/api/dashboard/shop", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ banner_url: null }) });
    if (res.ok) { const p = await res.json().catch(() => ({})); setShopState(p); setBannerPreview(null); toast({ title: "Banner eliminado" }); }
  }

  async function saveReminderChannels(nextChannels: ReminderChannel[]) {
    const normalized = normalizeReminderChannels(nextChannels, []);
    const response = await fetch("/api/dashboard/shop", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reminder_channels: normalized }),
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      toast({ variant: "destructive", title: "No se guardó la configuración", description: payload.error });
      return;
    }

    setReminderChannels(normalized);
    setShopState(payload);
    toast({ title: "Canales de recordatorio actualizados" });
  }

  async function toggleReminderChannel(channel: ReminderChannel) {
    const current = normalizeReminderChannels(reminderChannels, []);
    const next = current.includes(channel) ? current.filter((item) => item !== channel) : [...current, channel];
    await saveReminderChannels(next);
  }

  function updateManualBookingField<Key extends keyof ManualBookingFormState>(field: Key, value: ManualBookingFormState[Key]) {
    setManualBookingForm((current) => ({ ...current, [field]: value }));
  }

  function handleManualBookingClientSelect(clientId: string) {
    const selectedClient = clients.find((client) => client.id === clientId);
    setManualBookingForm((current) => ({
      ...current,
      client_id: clientId,
      client_name: selectedClient?.name || current.client_name,
      client_phone: selectedClient?.phone || selectedClient?.whatsapp || current.client_phone,
    }));
  }

  async function sendEmailReminder(bookingId: string, eventId?: string) {
    setSendingEmailBookingId(bookingId);
    const response = await fetch("/api/dashboard/email-notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ booking_id: bookingId, event_id: eventId, type: "reminder" }),
    });
    const payload = await response.json().catch(() => ({}));
    setSendingEmailBookingId(null);

    if (!response.ok) {
      toast({ variant: "destructive", title: "No se pudo enviar el correo", description: payload.error });
      return;
    }

    if (payload.notification) {
      setEmailNotifications((prev) => [payload.notification, ...prev]);
    }
    if (payload.event_id) {
      setPendingEmailReminders((prev) => prev.filter((reminder) => reminder.event_id !== payload.event_id));
    }
    toast({ title: "Correo enviado", description: payload.recipientEmail || "Recordatorio enviado al cliente." });
  }

  async function updateAccountPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") || "");
    const confirmPassword = String(formData.get("confirm_password") || "");

    if (password.length < 6) {
      toast({ variant: "destructive", title: "Contraseña muy corta", description: "Usa al menos 6 caracteres." });
      return;
    }

    if (password !== confirmPassword) {
      toast({ variant: "destructive", title: "Las contraseñas no coinciden" });
      return;
    }

    setUpdatingPassword(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setUpdatingPassword(false);

    if (error) {
      toast({ variant: "destructive", title: "No se pudo cambiar la contraseña", description: error.message });
      return;
    }

    event.currentTarget.reset();
    toast({ title: "Contraseña actualizada" });
  }

  async function openWhatsAppReminder(eventOrBookingId: string, mode: "event" | "booking" = "event") {
    setOpeningWhatsAppId(eventOrBookingId);
    const response = await fetch("/api/dashboard/whatsapp-reminders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mode === "event" ? { event_id: eventOrBookingId } : { booking_id: eventOrBookingId }),
    });
    const payload = await response.json().catch(() => ({}));
    setOpeningWhatsAppId(null);

    if (!response.ok || !payload.url) {
      toast({ variant: "destructive", title: "No se pudo abrir WhatsApp", description: payload.error });
      return;
    }

    window.open(payload.url, "_blank", "noopener,noreferrer");
    setPendingWhatsappReminders((prev) =>
      prev.filter((reminder) => reminder.event_id !== payload.event_id && reminder.booking_id !== payload.booking_id)
    );
    setBookings((prev) =>
      prev.map((booking) => (booking.id === payload.booking_id ? { ...booking, whatsapp_reminder_sent: true } : booking))
    );
    toast({ title: "WhatsApp Web abierto", description: "Solo revisa el mensaje y pulsa Enter." });
  }

  async function createManualBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { barber_id: barberId, service_id: serviceId, date, start_time: startTime, client_id: clientId } = manualBookingForm;
    const clientName = manualBookingForm.client_name.trim();
    const clientPhone = manualBookingForm.client_phone.trim();
    const notes = manualBookingForm.notes.trim();

    const selectedService = services.find((service) => service.id === serviceId);
    if (!selectedService) {
      toast({ variant: "destructive", title: "Servicio inválido" });
      return;
    }

    if (!barberId || !date || !startTime || !clientName) {
      toast({ variant: "destructive", title: "Faltan datos", description: "Completa cliente, artista, servicio, fecha y hora." });
      return;
    }

    setCreatingManualBooking(true);
    const response = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        manual: true,
        shop_id: shopState.id,
        barber_id: barberId,
        service_id: serviceId,
        date,
        start_time: startTime,
        end_time: addMinutesToTime(startTime, selectedService.duration_min),
        client_id: clientId || undefined,
        client_name: clientName,
        client_phone: clientPhone || null,
        notes: notes || null,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    setCreatingManualBooking(false);

    if (!response.ok) {
      toast({ variant: "destructive", title: "No se pudo crear la reserva", description: payload.error });
      return;
    }

    setBookings((prev) =>
      [...prev, {
        ...payload,
        clients: clientId ? { name: clientName, phone: clientPhone || null, whatsapp: clientPhone || null } : null,
        barbers: activeBarbers.find((barber) => barber.id === barberId)
          ? { display_name: activeBarbers.find((barber) => barber.id === barberId)!.display_name }
          : null,
        services: {
          name: selectedService.name,
          duration_min: selectedService.duration_min,
          price: selectedService.price,
        },
      }].sort((a, b) => `${a.date || ""}${a.start_time}`.localeCompare(`${b.date || ""}${b.start_time}`))
    );

    setManualBookingForm({
      client_id: "",
      client_name: "",
      client_phone: "",
      barber_id: "",
      service_id: "",
      date: todayDateInput,
      start_time: "",
      notes: "",
    });
    setShowManualBookingForm(false);
    toast({ title: "Reserva manual creado" });
  }

  async function openBillingCheckout() {
    setBillingAction("checkout");
    const response = await fetch("/api/billing/checkout", { method: "POST" });
    const payload = await response.json().catch(() => ({}));
    setBillingAction(null);
    if (!response.ok || !payload.url) { toast({ variant: "destructive", title: "Error", description: payload.error }); return; }
    window.location.href = payload.url;
  }

  async function openBillingPortal() {
    setBillingAction("portal");
    const response = await fetch("/api/billing/portal", { method: "POST" });
    const payload = await response.json().catch(() => ({}));
    setBillingAction(null);
    if (!response.ok || !payload.url) { toast({ variant: "destructive", title: "Error", description: payload.error }); return; }
    window.location.href = payload.url;
  }

  return (
    <div className="max-w-6xl p-4 md:p-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{shopState.name}</h1>
          <p className="text-sm text-muted-foreground capitalize">{shopState.city ? `${shopState.city} · ` : ""}{todayStr}</p>
          {subscription && (
            <span className={`mt-1.5 inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${subscriptionTone(subscription.status)}`}>
              {SUBSCRIPTION_LABELS[subscription.status]}
              {subscription.trial_ends_at ? ` · hasta ${new Date(subscription.trial_ends_at).toLocaleDateString()}` : ""}
            </span>
          )}
        </div>
        <Link href={`/${shopState.slug}`} target="_blank" className="inline-flex items-center gap-1.5 self-start rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/10 transition-colors">
          Ver página pública <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* ── SUMMARY ── */}
      {currentTab === "summary" && (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Ingresos cobrados" value={formatCurrency(analytics.realizedRevenue, shopState.currency)} sub={`Estimado: ${formatCurrency(analytics.estimatedRevenue, shopState.currency)}`} icon={CreditCard} color="teal" />
            <KpiCard label="Citas hoy" value={todayBookings.length} sub={`Confirmadas: ${todayBookings.filter((b) => b.status === "confirmed").length}`} icon={CalendarDays} color="gold" />
            <KpiCard label="Esperado esta semana" value={formatCurrency(stats.expectedWeek, shopState.currency)} sub={`Hoy: ${formatCurrency(stats.expectedToday, shopState.currency)}`} icon={TrendingUp} color="teal" />
            <KpiCard label="Ticket medio" value={formatCurrency(analytics.avgTicket, shopState.currency)} sub={`${analytics.avgServiceTime} min por servicio`} icon={Star} color="gold" />
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              { label: "Total", value: analytics.totalsByStatus.total, color: "bg-zinc-100 text-zinc-700" },
              { label: "Confirmadas", value: analytics.totalsByStatus.confirmed, color: "bg-emerald-100 text-emerald-700" },
              { label: "Pendientes", value: analytics.totalsByStatus.pending, color: "bg-amber-100 text-amber-700" },
              { label: "Completadas", value: analytics.totalsByStatus.completed, color: "bg-primary/10 text-primary" },
              { label: "Canceladas", value: analytics.totalsByStatus.cancelled, color: "bg-red-100 text-red-700" },
            ].map((item) => (
              <span key={item.label} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${item.color}`}>
                {item.label} <span className="font-bold">{item.value}</span>
              </span>
            ))}
          </div>

          <Card className="shadow-none">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-4 w-4 text-primary" /> Agenda de hoy
                <span className="ml-auto text-sm font-normal text-muted-foreground">{todayBookings.length} citas</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {todayTimeline.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">No hay citas para hoy.</p>
              ) : (
                <div className="space-y-2">
                  {todayTimeline.map((booking) => (
                    <div key={booking.id} className="flex items-center gap-3 rounded-xl border bg-muted/20 p-3">
                      <div className="w-14 text-right font-mono text-sm font-semibold text-primary">{formatTime(booking.start_time.slice(0, 5))}</div>
                      <div className="h-full w-px bg-border" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{booking.clients?.name || "Cliente"}</p>
                        <p className="text-xs text-muted-foreground truncate">{booking.services?.name} · {booking.barbers?.display_name}</p>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[booking.status]}`}>{STATUS_LABELS[booking.status]}</span>
                      {booking.payment_amount > 0 && <span className="shrink-0 text-sm font-semibold text-primary">{formatCurrency(booking.payment_amount, booking.payment_currency)}</span>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <BarChart title="Servicios más solicitados" icon={Scissors} items={analytics.topServices.slice(0, 5).map((item) => ({ label: item.name, value: item.count, sub: formatCurrency(item.revenue, shopState.currency) }))} emptyText="Sin datos todavía." />
            <BarChart title="Artistas con más reservas" icon={UserRound} items={analytics.topBarbers.slice(0, 5).map((item) => ({ label: item.name, value: item.count, sub: formatCurrency(item.revenue, shopState.currency) }))} emptyText="Sin datos todavía." />
            <BarChart title="Franjas con más demanda" icon={Clock} items={analytics.peakHours.slice(0, 5).map((item) => ({ label: item.slot, value: item.count, sub: `${item.count} reservas` }))} emptyText="Sin datos todavía." />
            <BarChart title="Días con más demanda" icon={CalendarDays} items={analytics.peakWeekdays.slice(0, 7).map((item) => ({ label: item.day, value: item.count, sub: `${item.count} reservas` }))} emptyText="Sin datos todavía." />
          </div>

          {analytics.evolutions.month.length > 0 && (
            <Card className="shadow-none">
              <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><TrendingUp className="h-4 w-4 text-primary" /> Evolución mensual</CardTitle></CardHeader>
              <CardContent><MiniLineChart data={analytics.evolutions.month.slice(-6)} /></CardContent>
            </Card>
          )}

          <Card className="shadow-none">
            <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><CreditCard className="h-4 w-4 text-primary" /> Suscripción</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {subscription ? (
                <>
                  <div className="rounded-xl border bg-muted/20 p-4">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{SUBSCRIPTION_LABELS[subscription.status]}</p>
                      <p className="font-bold text-primary">{formatCurrency(subscription.monthly_price, subscription.currency)}/mes</p>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">Próximo tatuaje: {subscription.current_period_end ? new Date(subscription.current_period_end).toLocaleDateString() : "Pendiente"}</p>
                    {subscription.last_payment_error && <p className="mt-2 rounded-lg bg-destructive/10 p-2 text-sm text-destructive">{subscription.last_payment_error}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={openBillingCheckout}>{billingAction === "checkout" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Activar / renovar plan"}</Button>
                    <Button variant="outline" onClick={openBillingPortal}>{billingAction === "portal" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Gestionar método de pago"}</Button>
                  </div>
                  {paymentMethods.length > 0 && (
                    <div className="space-y-2">
                      {paymentMethods.map((pm) => (
                        <div key={pm.id} className="flex items-center gap-3 rounded-lg border p-3 text-sm">
                          <CreditCard className="h-4 w-4 text-muted-foreground" />
                          <span>{pm.brand?.toUpperCase() || "Tarjeta"} ···· {pm.last4 || "****"}</span>
                          {pm.is_default && <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">Predeterminada</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">La suscripción se está preparando.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── BOOKINGS ── */}
      {currentTab === "bookings" && (
        <div className="space-y-6">
          <Card className="shadow-none">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle>Reservas próximas</CardTitle>
              <Button
                type="button"
                variant={showManualBookingForm ? "default" : "outline"}
                size="sm"
                onClick={() => setShowManualBookingForm((current) => !current)}
              >
                {showManualBookingForm ? "Ocultar formulario" : "Crear reserva manual"}
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {showManualBookingForm && (
                <form onSubmit={createManualBooking} className="space-y-4 rounded-xl border bg-muted/20 p-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="manual-client-id">Cliente existente</Label>
                      <select
                        id="manual-client-id"
                        className="flex h-11 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                        value={manualBookingForm.client_id}
                        onChange={(event) => handleManualBookingClientSelect(event.target.value)}
                      >
                        <option value="">Selecciona uno si ya existe</option>
                        {clients.map((client) => (
                          <option key={client.id} value={client.id}>
                            {client.name} · {client.phone || client.whatsapp || "Sin teléfono"}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="manual-client-phone">Teléfono del cliente</Label>
                      <Input
                        id="manual-client-phone"
                        value={manualBookingForm.client_phone}
                        onChange={(event) => updateManualBookingField("client_phone", event.target.value)}
                        placeholder="+1 809 000 0000"
                      />
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="manual-client-name">Nombre del cliente</Label>
                      <Input
                        id="manual-client-name"
                        value={manualBookingForm.client_name}
                        onChange={(event) => updateManualBookingField("client_name", event.target.value)}
                        placeholder="Ej: Carlos Peña"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="manual-barber">Artista</Label>
                      <select
                        id="manual-barber"
                        className="flex h-11 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                        value={manualBookingForm.barber_id}
                        onChange={(event) => updateManualBookingField("barber_id", event.target.value)}
                        required
                      >
                        <option value="">Selecciona un artista</option>
                        {activeBarbers.map((barber) => (
                          <option key={barber.id} value={barber.id}>{barber.display_name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="manual-service">Servicio</Label>
                      <select
                        id="manual-service"
                        className="flex h-11 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                        value={manualBookingForm.service_id}
                        onChange={(event) => updateManualBookingField("service_id", event.target.value)}
                        required
                      >
                        <option value="">Selecciona un servicio</option>
                        {activeServices.map((service) => (
                          <option key={service.id} value={service.id}>
                            {service.name} · {service.duration_min} min
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-1">
                        <Label htmlFor="manual-date">Fecha</Label>
                        <Input
                          id="manual-date"
                          type="date"
                          min={todayDateInput}
                          value={manualBookingForm.date}
                          onChange={(event) => updateManualBookingField("date", event.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="manual-start-time">Hora de inicio</Label>
                        <Input
                          id="manual-start-time"
                          type="time"
                          value={manualBookingForm.start_time}
                          onChange={(event) => updateManualBookingField("start_time", event.target.value)}
                          required
                        />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="manual-notes">Notas</Label>
                    <textarea
                      id="manual-notes"
                      value={manualBookingForm.notes}
                      onChange={(event) => updateManualBookingField("notes", event.target.value)}
                      placeholder="Observaciones internas de la reserva..."
                      className="min-h-[90px] w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <Button type="submit" disabled={creatingManualBooking || activeBarbers.length === 0 || activeServices.length === 0}>
                    {creatingManualBooking ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creando...</> : "Guardar reserva manual"}
                  </Button>
                </form>
              )}

              {bookings.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No hay reservas próximas.</p>
              ) : (
                bookings.map((booking) => (
                  <div key={booking.id} className="rounded-xl border bg-card p-4 space-y-3">
                    <div className="flex flex-wrap items-start gap-2 justify-between">
                      <div>
                        <p className="font-semibold">{booking.clients?.name || booking.client_name || "Cliente"}</p>
                        <p className="text-sm text-muted-foreground mt-0.5">{booking.date} · {formatTime(booking.start_time.slice(0, 5))}–{formatTime(booking.end_time.slice(0, 5))}</p>
                        <p className="text-sm text-muted-foreground">{booking.services?.name} · {booking.barbers?.display_name}</p>
                        {booking.client_phone && <p className="text-xs text-muted-foreground mt-1">{booking.client_phone}</p>}
                        {booking.notes && <p className="text-xs text-muted-foreground mt-1">{booking.notes}</p>}
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[booking.status]}`}>{STATUS_LABELS[booking.status]}</span>
                        {booking.payment_amount > 0 && <span className="text-sm font-bold text-primary">{formatCurrency(booking.payment_amount, booking.payment_currency)}</span>}
                        <span className="text-xs text-muted-foreground">{PAYMENT_STATUS_LABELS[booking.payment_status]}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                      {(["confirmed", "completed", "cancelled"] as BookingStatus[]).map((status) => (
                        <Button key={status} size="sm" variant={booking.status === status ? "default" : "outline"} disabled={updatingId === booking.id} onClick={() => updateBooking(booking.id, status)} className="text-xs h-7">
                          {updatingId === booking.id ? <Loader2 className="h-3 w-3 animate-spin" /> : STATUS_LABELS[status]}
                        </Button>
                      ))}
                      {isReminderEligible(booking) && isEmailEnabled && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          disabled={sendingEmailBookingId === booking.id}
                          onClick={() => sendEmailReminder(booking.id)}
                        >
                          {sendingEmailBookingId === booking.id ? <Loader2 className="h-3 w-3 animate-spin" /> : reminderEmailsSentByBooking.has(booking.id) ? "Reenviar correo" : "Enviar correo"}
                        </Button>
                      )}
                      {isReminderEligible(booking) && isWhatsAppEnabled && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          disabled={openingWhatsAppId === booking.id}
                          onClick={() => openWhatsAppReminder(booking.id, "booking")}
                        >
                          {openingWhatsAppId === booking.id ? <Loader2 className="h-3 w-3 animate-spin" /> : booking.whatsapp_reminder_sent ? "Reabrir WhatsApp" : "Enviar WhatsApp"}
                        </Button>
                      )}
                      <div className="ml-auto flex flex-wrap items-center gap-2">
                        {reminderEmailsSentByBooking.has(booking.id) && (
                          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                            Correo enviado
                          </span>
                        )}
                        {booking.whatsapp_reminder_sent && (
                          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                            WhatsApp enviado
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── SERVICES ── */}
      {currentTab === "services" && (
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <Card className="shadow-none">
            <CardHeader><CardTitle>Servicios ({services.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {services.map((service) => (
                <div key={service.id} className={`flex items-center gap-4 rounded-xl border p-4 transition-opacity ${!service.is_active ? "opacity-50" : ""}`}>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                    <Scissors className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{service.name}</p>
                    <div className="flex flex-wrap gap-2 mt-1">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{service.category || "General"}</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{service.duration_min} min</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0 flex flex-col items-end gap-1.5">
                    <p className="font-bold text-primary">{formatCurrency(service.price, service.currency)}</p>
                    <div className="flex gap-1.5">
                      <Button variant="outline" size="sm" onClick={() => toggleService(service)} className="h-7 text-xs">
                        {service.is_active ? "Desactivar" : "Activar"}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => deleteService(service)} disabled={deletingServiceId === service.id} className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10">
                        {deletingServiceId === service.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
          <CreateServiceForm onSubmit={createService} />
        </div>
      )}

      {/* ── BARBERS ── */}
      {currentTab === "barbers" && (
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <Card className="shadow-none">
            <CardHeader><CardTitle>Artistas ({barbers.length})</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {barbers.map((barber) => {
                const barberStats = analytics.topBarbers.find((b) => b.name === barber.display_name);
                const bestStat = analytics.bestBarbers.find((b) => b.name === barber.display_name);
                const barberRatings = ratingsByBarber[barber.id] || [];
                const avgRating = barberRatings.length > 0 ? barberRatings.reduce((s, r) => s + r.rating, 0) / barberRatings.length : null;
                const isUploading = uploadingBarberPhoto === barber.id;
                return (
                  <div key={barber.id} className={`rounded-xl border p-4 space-y-3 transition-opacity ${!barber.is_active ? "opacity-60" : ""}`}>
                    <div className="flex items-start gap-4">
                      {/* Avatar con upload */}
                      <label className="relative cursor-pointer shrink-0 group">
                        <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadBarberPhoto(barber.id, f); }} />
                        <div className="relative h-14 w-14 rounded-full overflow-hidden bg-primary/10 flex items-center justify-center">
                          {barber.avatar_url ? (
                            <img src={barber.avatar_url} alt={barber.display_name} className="h-full w-full object-cover" />
                          ) : (
                            <span className="text-xl font-bold text-primary">{barber.display_name.charAt(0).toUpperCase()}</span>
                          )}
                          {isUploading ? (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                              <Loader2 className="h-5 w-5 animate-spin text-white" />
                            </div>
                          ) : (
                            <div className="absolute inset-0 hidden group-hover:flex items-center justify-center bg-black/50 rounded-full">
                              <Camera className="h-5 w-5 text-white" />
                            </div>
                          )}
                        </div>
                      </label>

                      <div className="flex-1 min-w-0">
                        <p className="font-semibold">{barber.display_name}</p>
                        <p className="text-xs text-muted-foreground">{barber.specialty || "Sin especialidad"}</p>
                        {/* Estrellas */}
                        {avgRating !== null ? (
                          <div className="mt-1.5 flex items-center gap-2">
                            <StarDisplay rating={avgRating} />
                            <span className="text-xs text-muted-foreground font-medium">{avgRating.toFixed(1)} · {barberRatings.length} {barberRatings.length === 1 ? "valoración" : "valoraciones"}</span>
                          </div>
                        ) : (
                          <p className="mt-1.5 text-xs text-muted-foreground/60">Sin valoraciones aún</p>
                        )}
                        <div className="flex flex-wrap gap-3 mt-1.5">
                          <span className="text-xs text-muted-foreground">{barber.barber_services?.length || 0} servicios</span>
                          {barberStats && <span className="text-xs text-muted-foreground">{barberStats.count} reservas</span>}
                          {bestStat && <span className="text-xs text-emerald-600">{Math.round(bestStat.completionRate * 100)}% completadas</span>}
                          {barberStats && <span className="text-xs font-semibold text-primary">{formatCurrency(barberStats.revenue, shopState.currency)}</span>}
                        </div>
                      </div>

                      <Button variant="outline" size="sm" onClick={() => toggleBarber(barber)} className="shrink-0 h-7 text-xs self-start">
                        {barber.is_active ? "Desactivar" : "Activar"}
                      </Button>
                    </div>

                    {/* Valoraciones individuales */}
                    {barberRatings.length > 0 && (
                      <div className="space-y-1.5 border-t pt-3">
                        <p className="text-xs font-medium text-muted-foreground">Últimas valoraciones</p>
                        {barberRatings.slice(0, 3).map((r) => (
                          <div key={r.id} className="flex items-start gap-2 rounded-lg bg-muted/30 px-3 py-2">
                            <StarDisplay rating={r.rating} />
                            {r.comment && <p className="text-xs text-muted-foreground flex-1">{r.comment}</p>}
                            <span className="text-xs text-muted-foreground/50 shrink-0">{new Date(r.created_at).toLocaleDateString()}</span>
                          </div>
                        ))}
                        {barberRatings.length > 3 && <p className="text-xs text-muted-foreground/60">{barberRatings.length - 3} valoraciones más...</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
          <CreateBarberForm services={services.filter((s) => s.is_active)} onSubmit={createBarber} />
        </div>
      )}

      {/* ── CLIENTS ── */}
      {currentTab === "clients" && (
        <Card className="shadow-none">
          <CardHeader><CardTitle>Clientes ({clients.length})</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Users className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar cliente..." value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} className="pl-9" />
            </div>
            {clientItems.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{clientSearch ? "Sin resultados." : "Aún no hay clientes con reservas."}</p>
            ) : (
              clientItems.map((item, i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl border p-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">{item.title.charAt(0).toUpperCase()}</div>
                  <div>
                    <p className="font-medium">{item.title}</p>
                    <p className="text-xs text-muted-foreground">{item.detail}</p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      {/* ── SCHEDULE ── */}
      {currentTab === "schedule" && (
        <Card className="shadow-none">
          <CardHeader><CardTitle>Horario de funcionamiento</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={saveSchedule} className="space-y-3">
              {WEEK_DAYS.map(({ key, label }) => (
                <div key={key} className={`grid gap-3 rounded-xl border p-4 transition-opacity md:grid-cols-[140px_1fr_1fr_auto] md:items-center ${openingHours[key].closed ? "opacity-60" : ""}`}>
                  <div className="font-medium">{label}</div>
                  <div className="space-y-1">
                    <Label htmlFor={`${key}-open`} className="text-xs text-muted-foreground">Abre</Label>
                    <Input id={`${key}-open`} type="time" value={openingHours[key].open} onChange={(e) => updateDay(key, "open", e.target.value)} disabled={openingHours[key].closed} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`${key}-close`} className="text-xs text-muted-foreground">Cierra</Label>
                    <Input id={`${key}-close`} type="time" value={openingHours[key].close} onChange={(e) => updateDay(key, "close", e.target.value)} disabled={openingHours[key].closed} />
                  </div>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={openingHours[key].closed} onChange={(e) => updateDay(key, "closed", e.target.checked)} className="h-4 w-4 accent-primary" />
                    Cerrado
                  </label>
                </div>
              ))}
              <Button type="submit" disabled={savingSchedule}>
                {savingSchedule ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Guardando...</> : "Guardar horario"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* ── NOTIFICATIONS ── */}
      {currentTab === "notifications" && (
        <div className="space-y-6">
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-primary" /> Canales de recordatorio
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              <p className="text-xs text-muted-foreground">
                Correo sale automático una vez al día en Vercel Hobby. WhatsApp queda manual desde el dashboard.
              </p>
              <div className="flex flex-wrap gap-2">
                {(["email", "whatsapp"] as ReminderChannel[]).map((channel) => {
                  const isActive = reminderChannels.includes(channel);
                  return (
                    <Button
                      key={channel}
                      type="button"
                      variant={isActive ? "default" : "outline"}
                      size="sm"
                      className="gap-2"
                      onClick={() => toggleReminderChannel(channel)}
                    >
                      {channel === "email" ? "Correo" : "WhatsApp"}
                    </Button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Activo ahora: <span className="font-medium">{getReminderChannelsLabel(reminderChannels)}</span>
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-none">
            <CardHeader><CardTitle className="text-base">WhatsApp pendientes</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {pendingWhatsappReminders.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay recordatorios pendientes para WhatsApp.</p>
              ) : (
                pendingWhatsappReminders.map((reminder) => (
                  <div key={reminder.event_id} className="flex items-center gap-3 rounded-xl border p-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{reminder.client_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {reminder.date} · {formatTime(reminder.start_time.slice(0, 5))} · {reminder.service_name}
                      </p>
                      <p className="text-xs text-muted-foreground">{reminder.client_whatsapp || reminder.client_phone || "Sin teléfono"}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1 shrink-0"
                      disabled={openingWhatsAppId === reminder.event_id}
                      onClick={() => openWhatsAppReminder(reminder.event_id)}
                    >
                      {openingWhatsAppId === reminder.event_id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Send className="h-3 w-3" /> Abrir WhatsApp Web</>}
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="shadow-none">
            <CardHeader><CardTitle className="text-base">Correos pendientes</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {!isEmailEnabled ? (
                <p className="text-sm text-muted-foreground">Activa el canal Correo para enviar recordatorios por email.</p>
              ) : pendingEmailReminders.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay recordatorios pendientes para correo.</p>
              ) : (
                pendingEmailReminders.map((reminder) => (
                  <div key={reminder.event_id} className="flex items-center gap-3 rounded-xl border p-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{reminder.client_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {reminder.date} · {formatTime(reminder.start_time.slice(0, 5))} · {reminder.service_name}
                      </p>
                      <p className="text-xs text-muted-foreground">Artista: {reminder.barber_name}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1 shrink-0"
                      disabled={sendingEmailBookingId === reminder.booking_id}
                      onClick={() => sendEmailReminder(reminder.booking_id, reminder.event_id)}
                    >
                      {sendingEmailBookingId === reminder.booking_id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Mail className="h-3 w-3" /> Enviar correo</>}
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="shadow-none">
            <CardHeader><CardTitle className="text-base">Correos enviados hoy</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {todayEmailNotifications.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No hay correos enviados hoy.</p>
              ) : (
                todayEmailNotifications.map((notif) => (
                  <div key={notif.id} className="flex items-center gap-3 rounded-xl border p-3">
                    <div className={`h-2 w-2 shrink-0 rounded-full ${notif.status === "sent" ? "bg-emerald-500" : notif.status === "failed" ? "bg-red-500" : "bg-amber-400"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium capitalize">{notif.type === "reminder" ? "Recordatorio" : notif.type}</p>
                      {notif.recipient_email && <p className="text-xs text-muted-foreground truncate">{notif.recipient_name ? `${notif.recipient_name} — ` : ""}{notif.recipient_email}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${notif.status === "sent" ? "bg-emerald-100 text-emerald-700" : notif.status === "failed" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{notif.status === "sent" ? "Enviado" : notif.status === "failed" ? "Error" : "Pendiente"}</span>
                      <p className="mt-0.5 text-xs text-muted-foreground">{new Date(notif.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── SETTINGS ── */}
      {currentTab === "settings" && (
        <div className="space-y-6 max-w-2xl">
          <Card className="shadow-none overflow-hidden">
            <div className="relative h-40 bg-gradient-to-r from-primary/20 to-accent/20 flex items-center justify-center"
              style={bannerPreview ? { backgroundImage: `url(${bannerPreview})`, backgroundSize: "cover", backgroundPosition: "center" } : {}}>
              {!bannerPreview && <div className="text-center"><ImageIcon aria-hidden="true" className="mx-auto h-8 w-8 text-muted-foreground/40" /><p className="mt-1 text-xs text-muted-foreground">Sin banner</p></div>}
              {uploadingBanner && <div className="absolute inset-0 flex items-center justify-center bg-black/40"><Loader2 className="h-8 w-8 animate-spin text-white" /></div>}
              <div className="absolute bottom-3 right-3 flex gap-2">
                <button type="button" onClick={() => bannerInputRef.current?.click()} className="flex items-center gap-1.5 rounded-lg bg-black/60 px-3 py-1.5 text-xs font-medium text-white hover:bg-black/80 transition-colors">
                  <Upload className="h-3.5 w-3.5" />{bannerPreview ? "Cambiar banner" : "Subir banner"}
                </button>
                {bannerPreview && (
                  <button type="button" onClick={removeBanner} className="flex items-center gap-1 rounded-lg bg-red-600/80 px-2 py-1.5 text-xs font-medium text-white hover:bg-red-700">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
            <input ref={bannerInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleBannerChange} />
            <CardContent className="pt-3 pb-3">
              <p className="text-xs text-muted-foreground">Foto de portada · JPG, PNG o WebP · Máx. 5 MB · Recomendado: 1200×400 px</p>
            </CardContent>
          </Card>

          <Card className="shadow-none">
            <CardHeader><CardTitle>Información de el estudio</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={saveShopInfo} className="space-y-4">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Nombre</Label>
                  <p className="rounded-lg border bg-muted/30 px-3 py-2 text-sm font-medium">{shopState.name}</p>
                </div>
                <Field name="address" label="Dirección" defaultValue={shopState.address || ""} placeholder="Calle, número, ciudad" />
                <div className="space-y-1">
                  <Label htmlFor="maps_url" className="text-sm">Enlace o iframe de Google Maps</Label>
                  <Input id="maps_url" name="maps_url" defaultValue={shopState.maps_url || ""} placeholder="Pega la URL o el src del iframe de Google Maps" />
                  <p className="text-xs text-muted-foreground">Puedes pegar la URL normal, el enlace compartido o el <code>src</code> del iframe. iTatto lo normaliza al guardar.</p>
                </div>
                <Field name="phone" label="Teléfono" defaultValue={shopState.phone || ""} placeholder="+1 809 000 0000" />
                <div className="space-y-1">
                  <Label htmlFor="description">Descripción pública</Label>
                  <textarea id="description" name="description" defaultValue={shopState.description || ""} placeholder="Breve descripción..." className="min-h-[100px] w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
                <Button type="submit" disabled={savingSettings}>
                  {savingSettings ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Guardando...</> : "Guardar cambios"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="shadow-none">
            <CardHeader><CardTitle>Detalles de la cuenta</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <InfoRow label="URL pública" value={buildAppUrl(`/${shopState.slug}`)} />
              <InfoRow label="Ciudad" value={shopState.city ? `${shopState.city}, ${shopState.country_name}` : "No especificada"} />
              <InfoRow label="Pagos online" value={shopState.payments_enabled ? `Sí · modo ${shopState.online_payment_mode}` : "No activados"} />
            </CardContent>
          </Card>

          <Card className="shadow-none">
            <CardHeader><CardTitle>Contraseña</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={updateAccountPassword} className="space-y-4">
                <Field name="password" label="Contraseña nueva" type="password" autoComplete="new-password" required />
                <Field name="confirm_password" label="Confirmar contraseña" type="password" autoComplete="new-password" required />
                <Button type="submit" disabled={updatingPassword}>
                  {updatingPassword ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Guardando...</> : "Cambiar contraseña"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      <Toaster />
    </div>
  );
}

// ── SUB-COMPONENTS ─────────────────────────────

function KpiCard({ label, value, sub, icon: Icon, color }: { label: string; value: number | string; sub: string; icon: typeof Clock; color: "teal" | "gold" }) {
  return (
    <Card className="shadow-none">
      <CardContent className="p-4">
        <div className={`w-fit rounded-xl p-2.5 ${color === "teal" ? "bg-primary/10" : "bg-accent/20"}`}>
          <Icon className={`h-5 w-5 ${color === "teal" ? "text-primary" : "text-accent-foreground"}`} />
        </div>
        <p className="mt-3 text-2xl font-bold tracking-tight">{value}</p>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-1 text-xs text-muted-foreground/70">{sub}</p>
      </CardContent>
    </Card>
  );
}

function BarChart({ title, icon: Icon, items, emptyText }: { title: string; icon: typeof Clock; items: Array<{ label: string; value: number; sub: string }>; emptyText: string }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <Card className="shadow-none">
      <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Icon className="h-4 w-4 text-primary" />{title}</CardTitle></CardHeader>
      <CardContent className="space-y-2.5">
        {items.length === 0 ? <p className="text-sm text-muted-foreground">{emptyText}</p> : items.map((item) => (
          <div key={item.label} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium truncate mr-2">{item.label}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{item.sub}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary/70 transition-all" style={{ width: `${Math.round((item.value / max) * 100)}%` }} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function MiniLineChart({ data }: { data: Array<{ label: string; value: number }> }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex items-end gap-2 h-24">
      {data.map((item) => (
        <div key={item.label} className="flex flex-1 flex-col items-center gap-1">
          <div className="w-full flex items-end justify-center" style={{ height: "72px" }}>
            <div className="w-full max-w-[40px] rounded-t-md bg-primary/70 transition-all" style={{ height: `${Math.max(4, Math.round((item.value / max) * 72))}px` }} />
          </div>
          <p className="text-[10px] text-muted-foreground truncate w-full text-center">{item.label}</p>
          <p className="text-xs font-medium">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border bg-muted/20 px-3 py-2.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function CreateServiceForm({ onSubmit }: { onSubmit: (e: FormEvent<HTMLFormElement>) => void }) {
  return (
    <Card className="shadow-none">
      <CardHeader><CardTitle className="text-base">Nuevo servicio</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-3">
          <Field name="name" label="Nombre" required placeholder="Tatuaje de cabello" />
          <Field name="category" label="Categoría" placeholder="Tatuaje, Barba, Combo..." />
          <div className="grid grid-cols-2 gap-3">
            <Field name="duration_min" label="Duración (min)" type="number" defaultValue="30" required />
            <Field name="price" label="Precio" type="number" defaultValue="500" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="description">Descripción</Label>
            <textarea id="description" name="description" placeholder="Opcional..." className="min-h-[76px] w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <Button type="submit" className="w-full">Crear servicio</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function CreateBarberForm({ services, onSubmit }: { services: Service[]; onSubmit: (e: FormEvent<HTMLFormElement>) => void }) {
  return (
    <Card className="shadow-none">
      <CardHeader><CardTitle className="text-base">Nuevo artista</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-3">
          <Field name="display_name" label="Nombre público" required placeholder="Ej: Miguel" />
          <Field name="specialty" label="Especialidad" placeholder="Ej: Tatuajes clásicos" />
          <div className="space-y-1">
            <Label htmlFor="bio">Bio</Label>
            <textarea id="bio" name="bio" placeholder="Breve descripción..." className="min-h-[76px] w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          {services.length > 0 && (
            <div className="space-y-2">
              <Label>Servicios asignados</Label>
              <div className="space-y-2 rounded-xl border p-3 max-h-40 overflow-y-auto">
                {services.map((service) => (
                  <label key={service.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" name="service_ids" value={service.id} className="h-4 w-4 accent-primary" />
                    {service.name}
                  </label>
                ))}
              </div>
            </div>
          )}
          <Button type="submit" className="w-full">Crear artista</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Field({ label, ...props }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-1">
      <Label htmlFor={props.name}>{label}</Label>
      <Input id={props.name} {...props} />
    </div>
  );
}
