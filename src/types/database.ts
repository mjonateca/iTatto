export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type AccountRole = "client" | "barber" | "shop_owner";

export type BookingStatus =
  | "pending"
  | "confirmed"
  | "rescheduled"
  | "completed"
  | "no_show"
  | "cancelled";

export type DepositStatus = "none" | "paid" | "refunded";
export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";
export type SubscriptionStatus = "trial" | "active" | "past_due" | "cancelled" | "expired";
export type OnlinePaymentMode = "disabled" | "optional" | "required";
export type NotificationType =
  | "booking_confirmed"
  | "booking_reminder"
  | "booking_cancelled"
  | "booking_rescheduled";
export type NotificationStatus = "pending" | "sent" | "failed" | "skipped";

// --- Row types (what comes back from the DB) ---

export interface Shop {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  banner_url: string | null;
  maps_url: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  currency: string;
  currency_symbol: string;
  phone: string | null;
  whatsapp: string | null;
  country_code: string | null;
  country_name: string | null;
  city: string | null;
  description: string | null;
  is_active: boolean;
  reminder_channels: ("email" | "whatsapp")[];
  city_normalized?: string | null;
  opening_hours: Json;
  reminder_lead_minutes: number;
  deposit_required: boolean;
  deposit_amount: number;
  payments_enabled: boolean;
  online_payment_mode: OnlinePaymentMode;
  created_at: string;
}

export interface Barber {
  id: string;
  user_id: string;
  shop_id: string | null;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  portfolio_urls: string[];
  rating: number;
  is_independent: boolean;
  specialty: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Service {
  id: string;
  shop_id: string;
  name: string;
  duration_min: number;
  price: number;
  currency: string;
  is_active: boolean;
  description: string | null;
  category: string | null;
  is_visible: boolean;
  sort_order: number;
  created_at: string;
}

export interface BarberService {
  barber_id: string;
  service_id: string;
}

export interface Booking {
  id: string;
  client_id: string | null;
  client_name: string | null;
  client_phone: string | null;
  notes: string | null;
  barber_id: string;
  shop_id: string;
  service_id: string;
  date: string;
  start_time: string;
  end_time: string;
  status: BookingStatus;
  deposit_status: DepositStatus;
  deposit_amount: number;
  payment_status: PaymentStatus;
  payment_required: boolean;
  payment_amount: number;
  payment_currency: string;
  paid_at: string | null;
  confirmed_at: string | null;
  confirmed_by_user_id: string | null;
  whatsapp_reminder_sent: boolean;
  created_at: string;
}

export interface Client {
  id: string;
  user_id: string;
  name: string;
  phone: string | null;
  whatsapp: string | null;
  first_name: string | null;
  last_name: string | null;
  country_code: string | null;
  country_name: string | null;
  city: string | null;
  city_normalized?: string | null;
  created_at: string;
}

export interface Profile {
  id: string;
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
  city_normalized?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Country {
  code: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

export interface City {
  id: string;
  country_code: string;
  name: string;
  normalized_name?: string;
  lat: number | null;
  lng: number | null;
  is_active: boolean;
  created_at: string;
}

export interface BarberAvailability {
  id: string;
  barber_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
  created_at: string;
}

export interface BarberTimeBlock {
  id: string;
  barber_id: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  reason: string | null;
  created_at: string;
}

export interface NotificationEvent {
  id: string;
  booking_id: string | null;
  shop_id: string | null;
  client_id: string | null;
  channel: "email" | "whatsapp";
  type: NotificationType;
  status: NotificationStatus;
  scheduled_for: string | null;
  sent_at: string | null;
  error: string | null;
  payload: Json;
  created_at: string;
}

export interface NotificationTemplate {
  id: string;
  shop_id: string | null;
  type: NotificationType;
  channel: "email" | "whatsapp";
  is_active: boolean;
  send_offset_minutes: number | null;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface Review {
  id: string;
  booking_id: string;
  client_id: string;
  barber_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

export interface PlatformBillingSettings {
  id: number;
  trial_days: number;
  monthly_price: number;
  currency: string;
  stripe_price_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShopSubscription {
  id: string;
  shop_id: string;
  status: SubscriptionStatus;
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  monthly_price: number;
  currency: string;
  last_payment_error: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
}

export interface ShopPaymentMethod {
  id: string;
  shop_id: string;
  stripe_customer_id: string | null;
  stripe_payment_method_id: string;
  brand: string | null;
  last4: string | null;
  exp_month: number | null;
  exp_year: number | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface ClientPaymentMethod {
  id: string;
  client_id: string;
  stripe_customer_id: string | null;
  stripe_payment_method_id: string;
  brand: string | null;
  last4: string | null;
  exp_month: number | null;
  exp_year: number | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface BookingPayment {
  id: string;
  booking_id: string;
  shop_id: string;
  client_id: string;
  provider: string;
  stripe_customer_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_payment_method_id: string | null;
  amount: number;
  currency: string;
  status: PaymentStatus;
  failure_reason: string | null;
  refunded_amount: number;
  metadata: Json;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

// --- Insert types ---

export type ShopInsert = Omit<Shop, "id" | "created_at">;
export type BarberInsert = Omit<Barber, "id" | "created_at">;
export interface BarberRating {
  id: string;
  barber_id: string;
  client_id: string;
  booking_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  barbers?: { id: string; display_name: string; shop_id: string } | null;
}

export interface EmailNotification {
  id: string;
  shop_id: string;
  booking_id: string | null;
  client_id: string | null;
  type: string;
  status: string;
  recipient_email: string | null;
  recipient_name: string | null;
  sent_at: string | null;
  error_message: string | null;
  created_at: string;
}

export interface PendingWhatsappReminder {
  event_id: string;
  booking_id: string;
  scheduled_for: string | null;
  client_name: string;
  client_phone: string | null;
  client_whatsapp: string | null;
  service_name: string;
  barber_name: string;
  date: string;
  start_time: string;
}

export interface PendingEmailReminder {
  event_id: string;
  booking_id: string;
  scheduled_for: string | null;
  client_name: string;
  service_name: string;
  barber_name: string;
  date: string;
  start_time: string;
}


export type ServiceInsert = Omit<Service, "id" | "created_at">;
export type BookingInsert = Omit<Booking, "id" | "created_at">;
export type ClientInsert = Omit<Client, "id" | "created_at">;
export type ReviewInsert = Omit<Review, "id" | "created_at">;
export type ProfileInsert = Omit<Profile, "id" | "created_at" | "updated_at">;
export type CountryInsert = Omit<Country, "created_at">;
export type CityInsert = Omit<City, "id" | "created_at" | "normalized_name">;
export type BarberAvailabilityInsert = Omit<BarberAvailability, "id" | "created_at">;
export type BarberTimeBlockInsert = Omit<BarberTimeBlock, "id" | "created_at">;
export type NotificationEventInsert = Omit<NotificationEvent, "id" | "created_at">;
export type NotificationTemplateInsert = Omit<NotificationTemplate, "id" | "created_at" | "updated_at">;
export type PlatformBillingSettingsInsert = Omit<PlatformBillingSettings, "created_at" | "updated_at">;
export type ShopSubscriptionInsert = Omit<ShopSubscription, "id" | "created_at" | "updated_at">;
export type ShopPaymentMethodInsert = Omit<ShopPaymentMethod, "id" | "created_at" | "updated_at">;
export type ClientPaymentMethodInsert = Omit<ClientPaymentMethod, "id" | "created_at" | "updated_at">;
export type BookingPaymentInsert = Omit<BookingPayment, "id" | "created_at" | "updated_at">;

// --- Supabase Database type (for typed client) ---

export interface Database {
  public: {
    Tables: {
      shops: {
        Row: Shop;
        Insert: ShopInsert;
        Update: Partial<ShopInsert>;
      };
      barbers: {
        Row: Barber;
        Insert: BarberInsert;
        Update: Partial<BarberInsert>;
      };
      services: {
        Row: Service;
        Insert: ServiceInsert;
        Update: Partial<ServiceInsert>;
      };
      barber_services: {
        Row: BarberService;
        Insert: BarberService;
        Update: Partial<BarberService>;
      };
      bookings: {
        Row: Booking;
        Insert: BookingInsert;
        Update: Partial<BookingInsert>;
      };
      clients: {
        Row: Client;
        Insert: ClientInsert;
        Update: Partial<ClientInsert>;
      };
      reviews: {
        Row: Review;
        Insert: ReviewInsert;
        Update: Partial<ReviewInsert>;
      };
      profiles: {
        Row: Profile;
        Insert: ProfileInsert;
        Update: Partial<ProfileInsert>;
      };
      countries: {
        Row: Country;
        Insert: CountryInsert;
        Update: Partial<CountryInsert>;
      };
      cities: {
        Row: City;
        Insert: CityInsert;
        Update: Partial<CityInsert>;
      };
      barber_availability: {
        Row: BarberAvailability;
        Insert: BarberAvailabilityInsert;
        Update: Partial<BarberAvailabilityInsert>;
      };
      barber_time_blocks: {
        Row: BarberTimeBlock;
        Insert: BarberTimeBlockInsert;
        Update: Partial<BarberTimeBlockInsert>;
      };
      notification_events: {
        Row: NotificationEvent;
        Insert: NotificationEventInsert;
        Update: Partial<NotificationEventInsert>;
      };
      notification_templates: {
        Row: NotificationTemplate;
        Insert: NotificationTemplateInsert;
        Update: Partial<NotificationTemplateInsert>;
      };
      platform_billing_settings: {
        Row: PlatformBillingSettings;
        Insert: PlatformBillingSettingsInsert;
        Update: Partial<PlatformBillingSettingsInsert>;
      };
      shop_subscriptions: {
        Row: ShopSubscription;
        Insert: ShopSubscriptionInsert;
        Update: Partial<ShopSubscriptionInsert>;
      };
      shop_payment_methods: {
        Row: ShopPaymentMethod;
        Insert: ShopPaymentMethodInsert;
        Update: Partial<ShopPaymentMethodInsert>;
      };
      client_payment_methods: {
        Row: ClientPaymentMethod;
        Insert: ClientPaymentMethodInsert;
        Update: Partial<ClientPaymentMethodInsert>;
      };
      booking_payments: {
        Row: BookingPayment;
        Insert: BookingPaymentInsert;
        Update: Partial<BookingPaymentInsert>;
      };
    };
  };
}

export interface OpeningHours {
  [day: string]: {
    open: string;
    close: string;
    closed: boolean;
  };
}
