export const COUNTRIES = [
  { code: "AR", name: "Argentina", currency: "ARS", symbol: "$", timeZone: "America/Argentina/Buenos_Aires", cities: ["Buenos Aires","Córdoba","Rosario","Mendoza","Tucumán"] },
  { code: "AU", name: "Australia", currency: "AUD", symbol: "A$", timeZone: "Australia/Sydney", cities: ["Sydney","Melbourne","Brisbane","Perth","Adelaide"] },
  { code: "BO", name: "Bolivia", currency: "BOB", symbol: "Bs", timeZone: "America/La_Paz", cities: ["La Paz","Santa Cruz","Cochabamba","Sucre"] },
  { code: "BR", name: "Brasil", currency: "BRL", symbol: "R$", timeZone: "America/Sao_Paulo", cities: ["São Paulo","Rio de Janeiro","Brasília","Salvador","Fortaleza"] },
  { code: "CA", name: "Canadá", currency: "CAD", symbol: "C$", timeZone: "America/Toronto", cities: ["Toronto","Montreal","Vancouver","Calgary","Ottawa","Edmonton"] },
  { code: "CL", name: "Chile", currency: "CLP", symbol: "$", timeZone: "America/Santiago", cities: ["Santiago","Valparaíso","Concepción","Antofagasta"] },
  { code: "CO", name: "Colombia", currency: "COP", symbol: "$", timeZone: "America/Bogota", cities: ["Bogotá","Medellín","Cali","Barranquilla","Cartagena"] },
  { code: "CR", name: "Costa Rica", currency: "CRC", symbol: "₡", timeZone: "America/Costa_Rica", cities: ["San José","Cartago","Heredia","Alajuela"] },
  { code: "CU", name: "Cuba", currency: "CUP", symbol: "$", timeZone: "America/Havana", cities: ["La Habana","Santiago de Cuba","Camagüey"] },
  { code: "DE", name: "Alemania", currency: "EUR", symbol: "€", timeZone: "Europe/Berlin", cities: ["Berlín","Múnich","Hamburgo","Colonia","Frankfurt","Stuttgart"] },
  { code: "DO", name: "República Dominicana", currency: "DOP", symbol: "RD$", timeZone: "America/Santo_Domingo", cities: ["Santo Domingo","Santiago","La Romana","San Pedro de Macorís","Punta Cana","Puerto Plata"] },
  { code: "EC", name: "Ecuador", currency: "USD", symbol: "$", timeZone: "America/Guayaquil", cities: ["Quito","Guayaquil","Cuenca","Manta"] },
  { code: "SV", name: "El Salvador", currency: "USD", symbol: "$", timeZone: "America/El_Salvador", cities: ["San Salvador","Santa Ana","San Miguel"] },
  { code: "ES", name: "España", currency: "EUR", symbol: "€", timeZone: "Europe/Madrid", cities: ["Madrid","Barcelona","Valencia","Sevilla","Bilbao","Zaragoza","Málaga"] },
  { code: "FR", name: "Francia", currency: "EUR", symbol: "€", timeZone: "Europe/Paris", cities: ["París","Marsella","Lyon","Toulouse","Niza"] },
  { code: "GB", name: "Reino Unido", currency: "GBP", symbol: "£", timeZone: "Europe/London", cities: ["Londres","Manchester","Birmingham","Glasgow","Leeds"] },
  { code: "GT", name: "Guatemala", currency: "GTQ", symbol: "Q", timeZone: "America/Guatemala", cities: ["Ciudad de Guatemala","Quetzaltenango","Escuintla"] },
  { code: "HN", name: "Honduras", currency: "HNL", symbol: "L", timeZone: "America/Tegucigalpa", cities: ["Tegucigalpa","San Pedro Sula","La Ceiba"] },
  { code: "IT", name: "Italia", currency: "EUR", symbol: "€", timeZone: "Europe/Rome", cities: ["Roma","Milán","Nápoles","Turín","Palermo"] },
  { code: "MX", name: "México", currency: "MXN", symbol: "$", timeZone: "America/Mexico_City", cities: ["Ciudad de México","Guadalajara","Monterrey","Puebla","Tijuana","Cancún","León"] },
  { code: "NI", name: "Nicaragua", currency: "NIO", symbol: "C$", timeZone: "America/Managua", cities: ["Managua","León","Masaya","Granada"] },
  { code: "PA", name: "Panamá", currency: "USD", symbol: "$", timeZone: "America/Panama", cities: ["Ciudad de Panamá","Colón","David"] },
  { code: "PY", name: "Paraguay", currency: "PYG", symbol: "₲", timeZone: "America/Asuncion", cities: ["Asunción","Ciudad del Este","Encarnación"] },
  { code: "PE", name: "Perú", currency: "PEN", symbol: "S/", timeZone: "America/Lima", cities: ["Lima","Arequipa","Trujillo","Cusco","Piura"] },
  { code: "PT", name: "Portugal", currency: "EUR", symbol: "€", timeZone: "Europe/Lisbon", cities: ["Lisboa","Oporto","Braga","Coimbra","Faro"] },
  { code: "PR", name: "Puerto Rico", currency: "USD", symbol: "$", timeZone: "America/Puerto_Rico", cities: ["San Juan","Ponce","Bayamón","Carolina"] },
  { code: "UY", name: "Uruguay", currency: "UYU", symbol: "$", timeZone: "America/Montevideo", cities: ["Montevideo","Salto","Paysandú","Rivera"] },
  { code: "VE", name: "Venezuela", currency: "VES", symbol: "Bs", timeZone: "America/Caracas", cities: ["Caracas","Maracaibo","Valencia","Barquisimeto"] },
  { code: "US", name: "Estados Unidos", currency: "USD", symbol: "$", timeZone: "America/New_York", cities: ["New York","Los Angeles","Miami","Chicago","Houston","Phoenix","Dallas"] },
];

export type Country = typeof COUNTRIES[number];

export function getCountryByCode(code: string): Country | undefined {
  return COUNTRIES.find(c => c.code === code);
}

export function getCurrencyForCountry(code: string): { currency: string; symbol: string } {
  const country = getCountryByCode(code);
  return { currency: country?.currency ?? "USD", symbol: country?.symbol ?? "$" };
}

export function getTimeZoneForCountry(code: string): string {
  return getCountryByCode(code)?.timeZone ?? "America/Santo_Domingo";
}

export function getCitiesForCountry(code: string): string[] {
  return getCountryByCode(code)?.cities ?? [];
}


export function getCountryName(code: string): string {
  return getCountryByCode(code)?.name ?? code;
}
