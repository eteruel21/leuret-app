-- Insumos de las calculadoras Cielo falso de gypsum y Centro de carga y tierra. Se cargan sin precio
-- (0): el usuario lo agrega desde la app con lo que le cuesta (queda como su precio personal) y el
-- superadministrador aprueba los aportes antes de pasarlos al catálogo de todos (migración 040).
-- Las láminas, el canal portante, el tensor de colgante, los tornillos, la pasta, la cinta, el centro
-- de carga de 12 espacios y los breakers de 15 y 20 A (1 polo) y 20 y 30 A (2 polos) ya existen en
-- seeds anteriores. Los nombres coinciden con las palabras clave de cada campo de las calculadoras.
-- Idempotente: solo inserta conceptos nuevos (por código).

begin;

insert into public.platform_catalog_items (
  code, sku, name, description, item_type, category_name, unit_name, unit_symbol,
  default_unit_cost, default_sale_price, default_waste_percentage, active
) values
  ('leuret:material:liviano:canal-liston-10ft', 'LIV-LIS-10', 'Canal listón galvanizado para cielo falso de gypsum (pieza de 10 pies)', 'Insumo de la calculadora de Cielo falso de gypsum. Sin precio todavía: agrégalo desde la app con lo que te cuesta (te sirve de inmediato como precio personal) y el superadministrador revisa los aportes antes de pasarlo al catálogo de todos.', 'material', 'Livianos y gypsum', 'Unidad', 'und.', 0, 0, 5, true),
  ('leuret:material:liviano:angulo-perimetral-galvanizado-10ft', 'LIV-ANG-10', 'Ángulo perimetral galvanizado para cielo falso (pieza de 10 pies)', 'Insumo de la calculadora de Cielo falso de gypsum. Sin precio todavía: agrégalo desde la app con lo que te cuesta (te sirve de inmediato como precio personal) y el superadministrador revisa los aportes antes de pasarlo al catálogo de todos.', 'material', 'Livianos y gypsum', 'Unidad', 'und.', 0, 0, 5, true),
  ('leuret:labor:cielo-falso-gypsum-m2', 'LAB-CFG-M2', 'Mano de obra de cielo falso de gypsum con estructura (m²)', 'Insumo de la calculadora de Cielo falso de gypsum. Sin precio todavía: agrégalo desde la app con lo que te cuesta (te sirve de inmediato como precio personal) y el superadministrador revisa los aportes antes de pasarlo al catálogo de todos.', 'labor', 'Mano de obra', 'Metro cuadrado', 'm²', 0, 0, 0, true),
  ('leuret:material:elec:centro-carga-24-espacios', 'ELE-CC-24', 'Centro de carga (panel eléctrico) 24 espacios', 'Insumo de la calculadora de Centro de carga y tierra. Sin precio todavía: agrégalo desde la app con lo que te cuesta (te sirve de inmediato como precio personal) y el superadministrador revisa los aportes antes de pasarlo al catálogo de todos.', 'material', 'Electricidad', 'Unidad', 'und.', 0, 0, 0, true),
  ('leuret:material:elec:breaker-principal-2p-100a', 'ELE-BRK-100', 'Breaker principal 2 polos 100 A', 'Insumo de la calculadora de Centro de carga y tierra. Sin precio todavía: agrégalo desde la app con lo que te cuesta (te sirve de inmediato como precio personal) y el superadministrador revisa los aportes antes de pasarlo al catálogo de todos.', 'material', 'Electricidad', 'Unidad', 'und.', 0, 0, 0, true),
  ('leuret:material:elec:breaker-2p-50a', 'ELE-BRK-2P50', 'Breaker termomagnético 2 polos 50 A', 'Insumo de la calculadora de Centro de carga y tierra. Sin precio todavía: agrégalo desde la app con lo que te cuesta (te sirve de inmediato como precio personal) y el superadministrador revisa los aportes antes de pasarlo al catálogo de todos.', 'material', 'Electricidad', 'Unidad', 'und.', 0, 0, 0, true),
  ('leuret:material:elec:varilla-tierra-5_8-8ft', 'ELE-TIE-VAR', 'Varilla de tierra de cobre 5/8" x 8 pies', 'Insumo de la calculadora de Centro de carga y tierra. Sin precio todavía: agrégalo desde la app con lo que te cuesta (te sirve de inmediato como precio personal) y el superadministrador revisa los aportes antes de pasarlo al catálogo de todos.', 'material', 'Electricidad', 'Unidad', 'und.', 0, 0, 0, true),
  ('leuret:material:elec:cable-cobre-desnudo-6-m', 'ELE-CAB-DES6', 'Cable de cobre desnudo #6 AWG (metro)', 'Insumo de la calculadora de Centro de carga y tierra. Sin precio todavía: agrégalo desde la app con lo que te cuesta (te sirve de inmediato como precio personal) y el superadministrador revisa los aportes antes de pasarlo al catálogo de todos.', 'material', 'Electricidad', 'Metro', 'm', 0, 0, 5, true),
  ('leuret:material:elec:abrazadera-varilla-tierra', 'ELE-ABR-TIE', 'Abrazadera para varilla de tierra 5/8"', 'Insumo de la calculadora de Centro de carga y tierra. Sin precio todavía: agrégalo desde la app con lo que te cuesta (te sirve de inmediato como precio personal) y el superadministrador revisa los aportes antes de pasarlo al catálogo de todos.', 'material', 'Electricidad', 'Unidad', 'und.', 0, 0, 0, true),
  ('leuret:labor:instalacion-centro-carga', 'LAB-CC-INS', 'Mano de obra de instalación de centro de carga (global)', 'Insumo de la calculadora de Centro de carga y tierra. Sin precio todavía: agrégalo desde la app con lo que te cuesta (te sirve de inmediato como precio personal) y el superadministrador revisa los aportes antes de pasarlo al catálogo de todos.', 'labor', 'Mano de obra', 'Global', 'global', 0, 0, 0, true),
  ('leuret:labor:conexion-circuito-und', 'LAB-CIR-UND', 'Mano de obra de conexión de circuito en centro de carga (circuito)', 'Insumo de la calculadora de Centro de carga y tierra. Sin precio todavía: agrégalo desde la app con lo que te cuesta (te sirve de inmediato como precio personal) y el superadministrador revisa los aportes antes de pasarlo al catálogo de todos.', 'labor', 'Mano de obra', 'Unidad', 'und.', 0, 0, 0, true),
  ('leuret:labor:puesta-a-tierra-global', 'LAB-TIE-GLO', 'Mano de obra de puesta a tierra con varilla (global)', 'Insumo de la calculadora de Centro de carga y tierra. Sin precio todavía: agrégalo desde la app con lo que te cuesta (te sirve de inmediato como precio personal) y el superadministrador revisa los aportes antes de pasarlo al catálogo de todos.', 'labor', 'Mano de obra', 'Global', 'global', 0, 0, 0, true)
on conflict do nothing;

commit;

-- Verificación (solo lectura):
-- select category_name, count(*) from public.platform_catalog_items
--  where sku in ('LIV-LIS-10','LIV-ANG-10','LAB-CFG-M2','ELE-CC-24','ELE-BRK-100','ELE-BRK-2P50','ELE-TIE-VAR','ELE-CAB-DES6','ELE-ABR-TIE','LAB-CC-INS','LAB-CIR-UND','LAB-TIE-GLO') group by 1;
