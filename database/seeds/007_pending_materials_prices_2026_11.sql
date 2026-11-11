-- Precio para insumos que los seeds 005 y 006 dejaron en 0 (pendientes de cotizar).
-- Fuentes consultadas el 11-nov-2026:
--   * Pana Compu (panacompu.com): precio sin ITBMS publicado; se suma ITBMS (7 %).
--   * CYPE, Generador de precios de la construcción, versión Panamá
--     (panama.generadordeprecios.info): precio del material, sin mano de obra; se suma ITBMS (7 %).
--   * Carbone (carbonestore.com): precio de tienda publicado.
-- Venta = costo × 1.35, igual que el resto del catálogo.
-- Siguen en 0 (sin precio publicado en Panamá): detector térmico convencional,
-- panel de incendio convencional de 4 zonas y pata niveladora para mueble de cocina.
-- Idempotente: solo actualiza filas que siguen con costo y venta en 0, así que respeta
-- cualquier precio cargado a mano en el panel. Registra el cambio en el historial de precios.

begin;

create temporary table tmp_pending_prices (
  code text primary key,
  description text not null,
  unit_cost numeric not null,
  sale_price numeric not null
) on commit drop;

insert into tmp_pending_prices (code, description, unit_cost, sale_price) values
  ('leuret:material:seg:balun-video-hd-par', 'Insumo individual de sistemas especiales. Precio con ITBMS (7 %) calculado sobre el precio sin impuesto publicado por Pana Compu (panacompu.com, Panamá), consultado en noviembre de 2026. Referencia: Hikvision DS-1H18S/E(C) $4.37 + ITBMS (sin existencia al consultar; el fabricante lo vende como par). Alternativa en existencia: balun con alimentación Dahua DH-PFM802 $7.42 + ITBMS por unidad. Ajustar según proveedor y volumen.', 4.68, 6.32),
  ('leuret:material:seg:detector-humo-convencional', 'Insumo individual de sistemas especiales. Precio del material (con base universal, sin instalación) según CYPE, Generador de precios, versión Panamá: detector óptico de humos convencional 12-30 Vcc $33.48 + ITBMS (7 %). Referencia de tienda: La Casa del Teléfono, CV-SHD203C 2 hilos $19.20 (agotado). Consultado en noviembre de 2026. Cotizar con un proveedor de sistemas contra incendio para proyectos.', 35.82, 48.36),
  ('leuret:material:seg:sirena-estrobo-incendio', 'Insumo individual de sistemas especiales. Precio del material (sin instalación) según CYPE, Generador de precios, versión Panamá: sirena electrónica roja con señal óptica y acústica y rótulo «FUEGO», 24 Vcc, 90 dB, para exterior, $87.88 + ITBMS (7 %). Consultado en noviembre de 2026. Cotizar con un proveedor de sistemas contra incendio para proyectos.', 94.03, 126.94),
  ('leuret:material:seg:estacion-manual-incendio', 'Insumo individual de sistemas especiales. Precio del material (sin instalación) según CYPE, Generador de precios, versión Panamá: pulsador de alarma convencional rearmable con llave $19.53 + ITBMS (7 %). Consultado en noviembre de 2026. Las estaciones de doble acción tipo UL suelen costar más; cotizar con un proveedor de sistemas contra incendio.', 20.90, 28.22),
  ('leuret:material:ac:refrigerante-r32-kg', 'Insumo individual. Precio por kg calculado del tanque de 10 kg (22 lb) de Carbone (carbonestore.com, Panamá) a $169.00, consultado en noviembre de 2026. Fuente única; confirmar si el precio publicado incluye ITBMS. La mayoría de los equipos inverter nuevos usan R32. Ajustar según proveedor y volumen.', 16.90, 22.82);

with priced as (
  update public.platform_catalog_items p
  set description = t.description,
      default_unit_cost = t.unit_cost,
      default_sale_price = t.sale_price,
      updated_at = now()
  from tmp_pending_prices t
  where p.code = t.code
    and p.default_unit_cost = 0
    and p.default_sale_price = 0
  returning p.id, p.default_unit_cost, p.default_sale_price, p.default_waste_percentage
)
insert into public.platform_catalog_price_history (
  catalog_item_id, previous_unit_cost, previous_sale_price, previous_waste_percentage,
  unit_cost, sale_price, waste_percentage, source, notes
)
select id, 0, 0, default_waste_percentage, default_unit_cost, default_sale_price, default_waste_percentage,
       'actualizacion_mercado_2026_11', 'Primer precio de mercado del insumo (seed 007)'
from priced;

commit;

-- Verificación (solo lectura):
-- select code, default_unit_cost, default_sale_price from public.platform_catalog_items
--   where item_type::text <> 'service' and default_unit_cost = 0 order by code;
