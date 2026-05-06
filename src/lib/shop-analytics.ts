import type { BookingStatus, PaymentStatus } from "@/types/database";

type BookingAnalyticsRow = {
  id: string;
  client_id: string;
  date: string;
  start_time: string;
  end_time: string;
  status: BookingStatus;
  payment_status?: PaymentStatus;
  services: { name: string; duration_min: number; price: number } | null;
  barbers: { display_name: string } | null;
};

function timeToMinutes(value: string) {
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
}

function weekdayLabel(value: string) {
  return ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"][new Date(`${value}T12:00:00`).getDay()];
}

function weekKey(value: string) {
  const date = new Date(`${value}T12:00:00`);
  const firstDay = new Date(date.getFullYear(), 0, 1);
  const days = Math.floor((date.getTime() - firstDay.getTime()) / 86400000);
  return `${date.getFullYear()}-W${String(Math.ceil((days + firstDay.getDay() + 1) / 7)).padStart(2, "0")}`;
}

function monthKey(value: string) {
  return value.slice(0, 7);
}

function aggregateMap(entries: Map<string, number>, key: string, delta = 1) {
  entries.set(key, (entries.get(key) || 0) + delta);
}

export function buildShopAnalytics(bookings: BookingAnalyticsRow[]) {
  const totalsByStatus = {
    total: bookings.length,
    confirmed: bookings.filter((booking) => booking.status === "confirmed").length,
    pending: bookings.filter((booking) => booking.status === "pending").length,
    cancelled: bookings.filter((booking) => booking.status === "cancelled").length,
    completed: bookings.filter((booking) => booking.status === "completed").length,
  };

  const paidBookings = bookings.filter((booking) => booking.payment_status === "paid");
  const completedBookings = bookings.filter((booking) => booking.status === "completed");
  const estimatedRevenue = bookings.reduce((sum, booking) => sum + Number(booking.services?.price || 0), 0);
  const realizedRevenue = paidBookings.reduce((sum, booking) => sum + Number(booking.services?.price || 0), 0);
  const avgServiceTime = bookings.length
    ? Math.round(bookings.reduce((sum, booking) => sum + Number(booking.services?.duration_min || 0), 0) / bookings.length)
    : 0;
  const avgTicket = bookings.length ? estimatedRevenue / bookings.length : 0;

  const servicesMap = new Map<string, { name: string; count: number; revenue: number }>();
  const barbersMap = new Map<string, { name: string; count: number; revenue: number; completed: number }>();
  const hourMap = new Map<string, number>();
  const weekdayMap = new Map<string, number>();
  const clientMap = new Map<string, number>();
  const daySeries = new Map<string, number>();
  const weekSeries = new Map<string, number>();
  const monthSeries = new Map<string, number>();

  for (const booking of bookings) {
    const serviceName = booking.services?.name || "Servicio";
    const service = servicesMap.get(serviceName) || { name: serviceName, count: 0, revenue: 0 };
    service.count += 1;
    service.revenue += Number(booking.services?.price || 0);
    servicesMap.set(serviceName, service);

    const barberName = booking.barbers?.display_name || "Artista";
    const barber = barbersMap.get(barberName) || { name: barberName, count: 0, revenue: 0, completed: 0 };
    barber.count += 1;
    barber.revenue += Number(booking.services?.price || 0);
    if (booking.status === "completed") barber.completed += 1;
    barbersMap.set(barberName, barber);

    aggregateMap(hourMap, booking.start_time.slice(0, 5));
    aggregateMap(weekdayMap, weekdayLabel(booking.date));
    aggregateMap(clientMap, booking.client_id);
    aggregateMap(daySeries, booking.date);
    aggregateMap(weekSeries, weekKey(booking.date));
    aggregateMap(monthSeries, monthKey(booking.date));
  }

  const recurrentClients = [...clientMap.values()].filter((count) => count > 1).length;

  const topServices = [...servicesMap.values()].sort((a, b) => b.count - a.count).slice(0, 5);
  const topBarbers = [...barbersMap.values()].sort((a, b) => b.count - a.count).slice(0, 5);
  const bestBarbers = [...barbersMap.values()]
    .map((barber) => ({
      ...barber,
      completionRate: barber.count ? barber.completed / barber.count : 0,
    }))
    .sort((a, b) => b.completionRate - a.completionRate || b.revenue - a.revenue)
    .slice(0, 5);
  const peakHours = [...hourMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([slot, count]) => ({ slot, count }));
  const peakWeekdays = [...weekdayMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7).map(([day, count]) => ({ day, count }));

  return {
    totalsByStatus,
    estimatedRevenue,
    realizedRevenue,
    avgServiceTime,
    avgTicket,
    recurrentClients,
    topServices,
    topBarbers,
    bestBarbers,
    peakHours,
    peakWeekdays,
    evolutions: {
      day: [...daySeries.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([label, value]) => ({ label, value })),
      week: [...weekSeries.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([label, value]) => ({ label, value })),
      month: [...monthSeries.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([label, value]) => ({ label, value })),
    },
    avgLeadMinutes: completedBookings.length
      ? Math.round(
          completedBookings.reduce((sum, booking) => sum + (timeToMinutes(booking.end_time) - timeToMinutes(booking.start_time)), 0) /
            completedBookings.length
        )
      : 0,
  };
}
