import Link from "next/link";
import {
  MapPin,
  PenTool,
  Search,
  CalendarCheck,
  Star,
  ArrowRight,
  CheckCircle2,
  Zap,
  Shield,
  Clock,
  Users,
  TrendingUp,
  ChevronRight,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { IS_DEMO, demoShop } from "@/lib/demo-data";
import { COUNTRIES, getCitiesForCountry } from "@/lib/locations";
import { Button } from "@/components/ui/button";

const APP_BUSINESS_TYPE = "tattoo";

interface Props {
  searchParams: Promise<{ country?: string; city?: string }>;
}

type ListedShop = {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  country_code: string | null;
  country_name: string | null;
  city: string | null;
  description: string | null;
  is_active?: boolean | null;
};

export default async function HomePage({ searchParams }: Props) {
  const params = await searchParams;
  const selectedCountry = params.country || "";
  const selectedCity = params.city || "";
  const cities = selectedCountry ? getCitiesForCountry(selectedCountry) : [];

  let shops: ListedShop[] = [];

  if (IS_DEMO) {
    shops = [{ ...demoShop }];
  } else {
    const supabase = await createClient();
    const { data } = await supabase
      .from("shops")
      .select("*")
      .eq("business_type", APP_BUSINESS_TYPE)
      .order("city", { ascending: true })
      .order("name", { ascending: true })
      .limit(48);

    const all = (data || []) as ListedShop[];
    const active = all.filter((shop) => shop.is_active !== false);
    if (selectedCountry) {
      const countryMatches = active.filter(
        (shop) => !shop.country_code || shop.country_code === selectedCountry
      );
      if (selectedCity) {
        shops = [
          ...countryMatches.filter((shop) => shop.city?.toLowerCase() === selectedCity.toLowerCase()),
          ...countryMatches.filter((shop) => shop.city?.toLowerCase() !== selectedCity.toLowerCase()),
        ];
      } else {
        shops = countryMatches;
      }
    } else {
      shops = active;
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* NAVBAR */}
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/90 backdrop-blur-lg shadow-sm">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div
              className="rounded-xl p-2 shadow-md group-hover:shadow-lg transition-shadow"
              style={{
                background:
                  "linear-gradient(135deg, hsl(220,9%,18%), hsl(220,8%,28%))",
              }}
            >
              <PenTool className="h-5 w-5 text-white" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-lg font-black tracking-tight text-foreground">
                iTatto
              </span>
              <span className="text-[10px] text-muted-foreground font-medium tracking-wide hidden sm:block">
                Agenda online para tatuajes
              </span>
            </div>
          </Link>
          <nav className="flex items-center gap-2">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="font-medium text-muted-foreground hover:text-foreground"
            >
              <Link href="/login">Iniciar sesión</Link>
            </Button>
            <Button
              asChild
              size="sm"
              className="font-bold px-4 shadow-md border-0"
              style={{
                background:
                  "linear-gradient(135deg, hsl(220,9%,20%), hsl(220,8%,30%))",
              }}
            >
              <Link href="/register">Crear cuenta</Link>
            </Button>
          </nav>
        </div>
      </header>

      {/* HERO */}
      <section
        className="relative overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, hsl(220,12%,8%) 0%, hsl(220,10%,14%) 40%, hsl(200,55%,12%) 100%)",
        }}
      >
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(hsl(0,0%,100%) 1px, transparent 1px), linear-gradient(90deg, hsl(0,0%,100%) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        <div
          className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full opacity-25 blur-3xl pointer-events-none"
          style={{ background: "hsl(44, 94%, 55%)" }}
        />
        <div
          className="absolute -bottom-24 -left-24 w-80 h-80 rounded-full opacity-15 blur-3xl pointer-events-none"
          style={{ background: "hsl(220, 8%, 46%)" }}
        />

        <div className="relative max-w-6xl mx-auto px-4 pt-16 pb-20 md:pt-24 md:pb-32">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            {/* Left */}
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-xs font-bold text-white/90 mb-6 backdrop-blur-sm">
                <Zap className="h-3.5 w-3.5 text-amber-400" />
                Descubre estudios de tatuaje
              </div>

              <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-white leading-[1.08] tracking-tight mb-5">
                Tu estudio<br />
                favorito,{" "}
                <span style={{ color: "hsl(44, 94%, 60%)" }}>
                  a un clic
                </span>
              </h1>

              <p className="text-white/65 text-lg mb-8 leading-relaxed max-w-md">
                Encuentra estudios por país y ciudad, elige tu artista y reserva en segundos. Sin llamadas, sin esperas.
              </p>

              <div className="flex flex-wrap gap-x-5 gap-y-2 mb-10">
                {[
                  "Sin comisiones",
                  "Confirmación instantánea",
                  "100% gratis para clientes",
                ].map((text) => (
                  <div key={text} className="flex items-center gap-1.5 text-white/65 text-sm">
                    <CheckCircle2 className="h-4 w-4 flex-shrink-0" style={{ color: "hsl(44, 94%, 60%)" }} />
                    {text}
                  </div>
                ))}
              </div>

              <div className="bg-white/8 backdrop-blur-xl border border-white/15 rounded-2xl p-4 shadow-2xl">
                <p className="text-white/50 text-[10px] font-bold uppercase tracking-widest mb-3 ml-1">
                  Busca por país y ciudad
                </p>
                <form className="flex flex-col sm:flex-row gap-2.5">
                  <select
                    name="country"
                    defaultValue={selectedCountry}
                    className="flex-1 h-11 rounded-xl border border-white/15 bg-white/10 px-3.5 text-sm text-white appearance-none focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                    style={{ colorScheme: "dark" }}
                  >
                    <option value="" className="bg-slate-900 text-white">Todos los países</option>
                    {COUNTRIES.map((country) => (
                      <option key={country.code} value={country.code} className="bg-slate-900 text-white">
                        {country.name}
                      </option>
                    ))}
                  </select>
                  <select
                    name="city"
                    defaultValue={selectedCity}
                    className="flex-1 h-11 rounded-xl border border-white/15 bg-white/10 px-3.5 text-sm text-white appearance-none focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                    style={{ colorScheme: "dark" }}
                  >
                    <option value="" className="bg-slate-900 text-white">
                      {selectedCountry ? "Todas las ciudades" : "Selecciona un país primero"}
                    </option>
                    {cities.map((city) => (
                      <option key={city} value={city} className="bg-slate-900 text-white">{city}</option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="h-11 px-6 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-95 shadow-lg flex-shrink-0"
                    style={{ background: "hsl(44, 94%, 52%)", color: "#0d1117" }}
                  >
                    <Search className="h-4 w-4" />
                    Buscar
                  </button>
                </form>
              </div>
            </div>

            {/* Right preview card */}
            <div className="hidden md:flex items-center justify-center">
              <div className="relative w-full max-w-sm">
                <div className="rounded-2xl border border-white/15 bg-white/8 backdrop-blur-xl p-6 shadow-2xl">
                  <div className="flex items-center gap-3 mb-5">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-black text-lg shadow-lg"
                      style={{ background: "linear-gradient(135deg, hsl(220,9%,18%), hsl(220,8%,32%))" }}
                    >
                      I
                    </div>
                    <div>
                      <p className="text-white font-bold text-sm">Estudio Tattoo Premium</p>
                      <p className="text-white/50 text-xs flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> tu próxima cita
                      </p>
                    </div>
                    <div className="ml-auto flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Abierto
                    </div>
                  </div>
                  <div className="space-y-2.5 mb-5">
                    {[
                      { name: "Tatuaje pequeño", price: "$350", time: "30 min" },
                      { name: "Diseño personalizado", price: "$550", time: "45 min" },
                      { name: "Sesión completa", price: "$750", time: "60 min" },
                    ].map((s) => (
                      <div key={s.name} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3.5 py-2.5">
                        <span className="text-white/85 text-sm font-medium">{s.name}</span>
                        <div className="text-right">
                          <p className="text-xs font-bold" style={{ color: "hsl(44,94%,60%)" }}>{s.price}</p>
                          <p className="text-white/40 text-[10px] flex items-center gap-0.5 justify-end">
                            <Clock className="h-2.5 w-2.5" /> {s.time}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div
                    className="w-full py-2.5 rounded-xl text-center font-bold text-sm shadow-md cursor-pointer"
                    style={{ background: "hsl(44,94%,52%)", color: "#0d1117" }}
                  >
                    Reservar cita →
                  </div>
                </div>
                {/* Floating badge */}
                <div className="absolute -bottom-5 -left-5 bg-white rounded-xl px-4 py-2.5 shadow-xl border border-border flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                    <CalendarCheck className="h-4 w-4 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800">Reserva confirmada</p>
                    <p className="text-[10px] text-slate-500">Hoy · 3:00 PM</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* STATS */}
      <section className="border-b bg-card">
        <div className="max-w-6xl mx-auto px-4 py-5 grid grid-cols-3 divide-x divide-border">
          {[
            { icon: PenTool, value: shops.length > 0 ? `${shops.length}+` : "10+", label: "Estudios activos" },
            { icon: Users, value: "500+", label: "Clientes atendidos" },
            { icon: Clock, value: "24/7", label: "Reservas online" },
          ].map(({ icon: Icon, value, label }) => (
            <div key={label} className="text-center px-4 py-1">
              <div className="flex items-center justify-center gap-2 mb-0.5">
                <Icon className="h-4 w-4" style={{ color: "hsl(220,9%,22%)" }} />
                <p className="text-2xl md:text-3xl font-black" style={{ color: "hsl(220,9%,22%)" }}>
                  {value}
                </p>
              </div>
              <p className="text-xs text-muted-foreground font-medium">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CÓMO FUNCIONA */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "hsl(220,9%,22%)" }}>
              Proceso simple
            </p>
            <h2 className="text-3xl md:text-4xl font-black text-foreground">¿Cómo funciona?</h2>
            <p className="text-muted-foreground mt-3 max-w-md mx-auto">
              Reserva tu próximo tatuaje en menos de 2 minutos
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {[
              { step: "01", icon: Search, title: "Busca tu estudio", desc: "Filtra por ciudad y encuentra el estudio perfecta cerca de ti." },
              { step: "02", icon: CalendarCheck, title: "Elige artista y hora", desc: "Selecciona tu artista favorito y el horario disponible que más te convenga." },
              { step: "03", icon: Star, title: "Disfruta tu tatuaje", desc: "Recibe confirmación al instante y llega a tu cita sin esperas." },
            ].map(({ step, icon: Icon, title, desc }) => (
              <div key={step} className="relative rounded-2xl border bg-card p-7 hover:border-primary/30 hover:shadow-lg transition-all duration-300 group">
                <div className="flex items-start justify-between mb-5">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center shadow-sm"
                    style={{ background: "hsl(220,12%,94%)", color: "hsl(220,9%,22%)" }}
                  >
                    <Icon className="h-6 w-6" />
                  </div>
                  <span className="text-5xl font-black select-none opacity-8 group-hover:opacity-15 transition-opacity" style={{ color: "hsl(220,9%,22%)" }}>
                    {step}
                  </span>
                </div>
                <h3 className="font-bold text-lg mb-2 text-foreground">{title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{desc}</p>
                <div className="mt-4 flex items-center gap-1 text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "hsl(220,9%,22%)" }}>
                  Empezar <ChevronRight className="h-3.5 w-3.5" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* LISTINGS */}
      <section className="py-14 px-4" style={{ background: "hsl(220,12%,97%)" }}>
        <div className="max-w-6xl mx-auto">
          <div className="flex items-end justify-between gap-4 mb-10">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "hsl(220,9%,22%)" }}>
                Disponibles ahora
              </p>
              <h2 className="text-2xl font-black text-foreground">
                {selectedCity
                  ? `Estudios en ${selectedCity}`
                  : selectedCountry
                    ? `Estudios en ${COUNTRIES.find((country) => country.code === selectedCountry)?.name || "tu país"}`
                    : "Estudios disponibles"}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {shops.length > 0
                  ? `${shops.length} establecimiento${shops.length > 1 ? "s" : ""} verificado${shops.length > 1 ? "s" : ""}`
                  : "Sin establecimientos en esta búsqueda todavía"}
              </p>
            </div>
            <Link
              href="/register"
              className="hidden sm:flex items-center gap-1.5 text-sm font-bold hover:underline underline-offset-4 transition-colors"
              style={{ color: "hsl(220,9%,22%)" }}
            >
              Registrar mi estudio <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {shops.length === 0 ? (
            <div className="rounded-2xl border bg-card p-14 text-center shadow-sm">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: "hsl(220,12%,92%)" }}>
                <PenTool className="h-8 w-8" style={{ color: "hsl(220,9%,22%)" }} />
              </div>
              <p className="font-bold text-lg mb-1">No hay estudios activos aquí</p>
              <p className="text-sm text-muted-foreground mb-5">Prueba con otro país, otra ciudad o regresa pronto.</p>
              <Link href="/register" className="inline-flex items-center gap-1.5 text-sm font-bold hover:underline underline-offset-4" style={{ color: "hsl(220,9%,22%)" }}>
                ¿Tienes un estudio? Regístralo gratis →
              </Link>
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {shops.map((shop) => {
                const initials = shop.name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
                return (
                  <Link
                    key={shop.id}
                    href={`/${shop.slug}`}
                    className="group rounded-2xl border bg-card overflow-hidden hover:border-primary/40 hover:shadow-xl transition-all duration-300 flex flex-col"
                  >
                    {/* Card header */}
                    <div
                      className="h-28 relative overflow-hidden flex-shrink-0"
                      style={{ background: "linear-gradient(135deg, hsl(174,72%,18%) 0%, hsl(174,60%,28%) 50%, hsl(200,55%,22%) 100%)" }}
                    >
                      <div
                        className="absolute inset-0 opacity-[0.08]"
                        style={{
                          backgroundImage: "linear-gradient(hsl(0,0%,100%) 1px, transparent 1px), linear-gradient(90deg, hsl(0,0%,100%) 1px, transparent 1px)",
                          backgroundSize: "20px 20px",
                        }}
                      />
                      <div className="absolute bottom-0 left-5 translate-y-1/2">
                        <div
                          className="w-14 h-14 rounded-xl border-2 border-white flex items-center justify-center text-lg font-black text-white shadow-lg"
                          style={{ background: "linear-gradient(135deg, hsl(220,9%,16%), hsl(220,8%,26%))" }}
                        >
                          {initials}
                        </div>
                      </div>
                      <div className="absolute top-3 right-3 flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 backdrop-blur-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Activa
                      </div>
                    </div>

                    {/* Card body */}
                    <div className="p-5 pt-9 flex flex-col flex-1">
                      <div className="mb-3">
                        <h3 className="font-bold text-base text-foreground group-hover:text-primary transition-colors leading-tight">{shop.name}</h3>
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                          <MapPin className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate">{shop.city || "Ciudad"}{shop.country_name ? ` · ${shop.country_name}` : ""}</span>
                        </p>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed flex-1">
                        {shop.description || shop.address || "Agenda disponible para reservas online."}
                      </p>
                      <div className="mt-4 pt-4 border-t flex items-center justify-between">
                        <span className="text-xs font-semibold text-primary flex items-center gap-1">
                          Ver disponibilidad
                          <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
                        </span>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                          <span className="font-medium">Nuevo</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* WHY IBARBER */}
      <section className="py-20 px-4 bg-card">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "hsl(220,9%,22%)" }}>
              Por qué iTatto
            </p>
            <h2 className="text-3xl md:text-4xl font-black text-foreground">Todo lo que necesitas</h2>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {[
              { icon: Zap, title: "Reserva en segundos", desc: "Sin llamadas, sin WhatsApp. Elige hora disponible y confirma al instante.", accent: "hsl(44,94%,50%)", bg: "hsl(44,94%,96%)" },
              { icon: Shield, title: "Sin comisiones", desc: "No cobramos comisión por cita. El 100% del pago va directo al estudio.", accent: "hsl(220,9%,22%)", bg: "hsl(220,12%,94%)" },
              { icon: TrendingUp, title: "Gestión inteligente", desc: "Los estudios gestionan su agenda, reducen no-shows y hacen crecer su negocio.", accent: "hsl(220,9%,22%)", bg: "hsl(220,12%,94%)" },
            ].map(({ icon: Icon, title, desc, accent, bg }) => (
              <div key={title} className="rounded-2xl border p-7 hover:shadow-md transition-all group">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4 shadow-sm" style={{ background: bg, color: accent }}>
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="font-bold text-base mb-2 text-foreground">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <div
            className="relative overflow-hidden rounded-3xl p-10 md:p-14"
            style={{ background: "linear-gradient(135deg, hsl(220,12%,8%) 0%, hsl(220,10%,16%) 60%, hsl(200,55%,14%) 100%)" }}
          >
            <div
              className="absolute inset-0 opacity-[0.05]"
              style={{
                backgroundImage: "linear-gradient(hsl(0,0%,100%) 1px, transparent 1px), linear-gradient(90deg, hsl(0,0%,100%) 1px, transparent 1px)",
                backgroundSize: "30px 30px",
              }}
            />
            <div className="absolute top-0 right-0 w-96 h-96 rounded-full opacity-20 blur-3xl pointer-events-none" style={{ background: "hsl(44, 94%, 55%)" }} />
            <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-10">
              <div className="max-w-lg">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-1 text-xs font-bold text-white/85 mb-5">
                  <Shield className="h-3.5 w-3.5 text-amber-400" />
                  Para propietarios
                </div>
                <h2 className="text-3xl md:text-4xl font-black text-white mb-4 leading-tight">
                  ¿Tienes un estudio?{" "}
                  <span style={{ color: "hsl(44, 94%, 60%)" }}>Regístralo gratis.</span>
                </h2>
                <p className="text-white/60 text-base leading-relaxed">
                  Gestiona tu agenda, reduce las cancelaciones y recibe reservas online 24/7.
                  Sin mensualidades para empezar.
                </p>
                <div className="flex flex-wrap gap-4 mt-5">
                  {["Agenda digital", "Pagos online", "Panel de análisis"].map((f) => (
                    <div key={f} className="flex items-center gap-1.5 text-white/65 text-sm">
                      <CheckCircle2 className="h-4 w-4" style={{ color: "hsl(44,94%,60%)" }} />
                      {f}
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-3 flex-shrink-0 w-full md:w-auto">
                <Button
                  asChild
                  size="lg"
                  className="font-bold text-base px-8 shadow-xl border-0 w-full md:w-auto"
                  style={{ background: "hsl(44, 94%, 52%)", color: "#0d1117" }}
                >
                  <Link href="/register">
                    Registrar mi estudio
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
                <Link href="/login" className="text-center text-sm font-semibold text-white/50 hover:text-white/80 transition-colors">
                  Ya tengo cuenta → Iniciar sesión
                </Link>
                <p className="text-center text-xs text-white/35">Sin tarjeta de crédito · Gratis para empezar</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t py-10 px-4" style={{ background: "hsl(220,12%,97%)" }}>
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2.5 mb-2">
                <div className="rounded-lg p-1.5" style={{ background: "linear-gradient(135deg, hsl(220,9%,18%), hsl(220,8%,28%))" }}>
                  <PenTool className="h-4 w-4 text-white" />
                </div>
                <span className="font-black text-base text-foreground">iTatto</span>
              </div>
              <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
                La plataforma de reservas para estudios que quieren captar y gestionar citas online.
              </p>
            </div>
            <div className="flex gap-12">
              <div>
                <p className="text-xs font-bold text-foreground mb-3 uppercase tracking-wider">Plataforma</p>
                <div className="flex flex-col gap-2">
                  {[
                    { href: "/login", label: "Iniciar sesión" },
                    { href: "/register", label: "Registrarse" },
                    { href: "/register", label: "Registrar estudio" },
                  ].map((link) => (
                    <Link key={link.label} href={link.href} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                      {link.label}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="border-t pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} iTatto · Plataforma de reservas para estudios
            </p>
            <p className="text-xs text-muted-foreground">Disponible para varios países</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
