-- ============================================================
-- iTatto — Datos de prueba (solo para desarrollo)
-- ============================================================
-- Ejecutar SOLO en ambiente local/staging, nunca en producción

-- Servicios de ejemplo para testing de la UI
-- (Se insertarán al crear un shop via onboarding)
-- Este archivo documenta los servicios típicos de una estudio de tatuajes RD

/*
Servicios comunes en estudios de tatuajes dominicanas:
- Tatuaje de cabello: RD$300-500, 30min
- Tatuaje + barba: RD$500-700, 45min
- Barba: RD$250-400, 20min
- Tatuaje infantil: RD$250-350, 25min
- Delineado: RD$150-250, 15min
- Tratamiento capilar: RD$500-800, 45min
- Color: RD$800-1500, 60-90min
*/

-- Función helper para crear servicios iniciales al crear un shop
create or replace function create_default_services(p_shop_id uuid)
returns void language plpgsql security definer as $$
begin
  insert into public.services (shop_id, name, duration_min, price, currency) values
    (p_shop_id, 'Tatuaje de cabello', 30, 350, 'DOP'),
    (p_shop_id, 'Tatuaje + barba',    45, 550, 'DOP'),
    (p_shop_id, 'Barba',            20, 300, 'DOP'),
    (p_shop_id, 'Tatuaje infantil',   25, 300, 'DOP');
end;
$$;
