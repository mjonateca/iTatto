import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function formatCurrency(
  amount: number,
  currency = "USD"
): string {
  return new Intl.NumberFormat("es", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
  }).format(amount);
}

export function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, "0")} ${period}`;
}

function getDatePartsInTimeZone(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const getPart = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return {
    year: getPart("year"),
    month: getPart("month"),
    day: getPart("day"),
    hour: getPart("hour"),
    minute: getPart("minute"),
  };
}

export function parseDateOnly(value: string): Date {
  return new Date(`${value}T12:00:00`);
}

export function getCurrentDateInTimeZone(timeZone: string, now = new Date()): string {
  const { year, month, day } = getDatePartsInTimeZone(now, timeZone);
  return `${year}-${month}-${day}`;
}

export function getCurrentTimeInTimeZone(timeZone: string, now = new Date()): string {
  const { hour, minute } = getDatePartsInTimeZone(now, timeZone);
  return `${hour}:${minute}`;
}

export function addDaysToDateString(value: string, days: number): string {
  const date = parseDateOnly(value);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function formatLongDateInTimeZone(timeZone: string, now = new Date(), locale = "es-DO"): string {
  const formatted = new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(now);
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

export function getAppBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://i-barber.com").replace(/\/+$/, "");
}

export function buildAppUrl(path = "/"): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getAppBaseUrl()}${normalizedPath}`;
}

export function normalizeMapsUrl(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;

  const iframeSrc = raw.match(/src=["']([^"']+)["']/i)?.[1]?.trim();
  const candidate = iframeSrc || raw;

  try {
    const url = new URL(candidate);
    const host = url.hostname.replace(/^www\./, "");

    if (host.includes("google.") || host.includes("goo.gl")) {
      if (url.pathname.includes("/maps/embed") || url.pathname.includes("/embed")) {
        return url.toString();
      }

      const query = url.searchParams.get("q") || url.searchParams.get("query");
      if (query) {
        return `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed&hl=es`;
      }

      const coords = candidate.match(/@([-\d.]+),([-\d.]+)/);
      if (coords) {
        return `https://www.google.com/maps?q=${coords[1]},${coords[2]}&output=embed&hl=es`;
      }

      const place = url.pathname.match(/\/place\/([^/]+)/);
      if (place) {
        return `https://www.google.com/maps?q=${encodeURIComponent(decodeURIComponent(place[1]).replace(/\+/g, " "))}&output=embed&hl=es`;
      }
    }
  } catch {
    return null;
  }

  return candidate;
}

export function buildMapsEmbedUrl(
  value: string | null | undefined,
  fallbackQuery?: string | null
): string | null {
  const normalized = normalizeMapsUrl(value);

  if (normalized) {
    try {
      const url = new URL(normalized);
      if (url.pathname.includes("/maps/embed") || url.pathname.includes("/embed")) {
        return url.toString();
      }

      const query = url.searchParams.get("q") || url.searchParams.get("query");
      if (query) {
        return `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed&hl=es`;
      }

      const coords = normalized.match(/@([-\d.]+),([-\d.]+)/);
      if (coords) {
        return `https://www.google.com/maps?q=${coords[1]},${coords[2]}&output=embed&hl=es`;
      }
    } catch {
      return fallbackQuery
        ? `https://www.google.com/maps?q=${encodeURIComponent(fallbackQuery)}&output=embed&hl=es`
        : null;
    }
  }

  if (!fallbackQuery) return null;
  return `https://www.google.com/maps?q=${encodeURIComponent(fallbackQuery)}&output=embed&hl=es`;
}
