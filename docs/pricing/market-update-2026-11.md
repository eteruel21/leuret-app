# Actualización de precios de mercado — Panamá, noviembre 2026

Seed: `database/seeds/003_market_prices_2026_11.sql`
Generador: `database/scripts/pricing/market_update_2026_11.py`
Detalle por partida: `docs/pricing/market-update-2026-11-items.csv`

**Estado:** aplicado en producción el 10-nov-2026. 1,155 partidas cambiaron (14 quedaron igual al redondear), 48 insumos nuevos, 10 insumos del seed 002 con precio, 11 partidas recategorizadas. `app_migrations.seed_history` registra 002 y 003 con su checksum, así que `npm run db:seed` los omite.

## 1. Diagnóstico del catálogo actual (producción, 10-nov-2026)

| Hallazgo | Detalle |
|---|---|
| Base de las 1,169 partidas | Contraloría, base de costos directos 2025-2026, actualizada al 10-jul-2025, **salarios de julio 2025 a junio 2026**. La vigencia de esa base terminó en junio 2026 y la Contraloría todavía no publica la versión 2026-2027. |
| Tipo de partidas | Las 1,169 son `service` (precio unitario completo: material + mano de obra + equipo). No servían como precio de cemento, arena o mano de obra para las calculadoras. |
| Insumos para calculadoras | 10 insumos (`leuret:material:*`, `leuret:labor:*`) ya cargados en producción **con precio 0**. |
| Categorías erróneas | 10 muros/paredes de bloque y 1 mortero de nivelación estaban en «Movimiento de tierra y compactación». Se corrigen. |
| Margen de venta | Uniforme: venta = costo × 1.35. Se conserva. |
| Historial de precios | Vacío. Esta actualización deja 1,165 registros (1,155 partidas escaladas + 10 insumos que estaban en 0) con `source = 'actualizacion_mercado_2026_11'`. |

## 2. Qué cambió en el mercado (jul-2025 → sep-2026)

Índices de Precios al por Menor de los Principales Materiales de Construcción (IPMC), INEC, distritos de Panamá y San Miguelito, último publicado el 13-oct-2026:

| Material | Jul-2025 | Sep-2026 | Variación |
|---|---:|---:|---:|
| Cable eléctrico Stranded #12 | 116.7 | 144.4 | **+23.7 %** |
| Bloque de cemento #4 | 126.1 | 142.0 | **+12.6 %** |
| Piedra #4 | 159.3 | 179.0 | **+12.4 %** |
| Tubería PVC | 115.6 | 125.4 | +8.5 % |
| Varilla 1/2" | 113.1 | 121.7 | +7.6 % |
| Carriola #4 | 92.6 | 96.3 | +4.0 % |
| Arena | 153.4 | 157.7 | +2.8 % |
| Madera, bloque de arcilla, zinc | — | — | 0.0 % |
| Hormigón premezclado | 161.4 | 159.8 | −1.0 % |
| Cemento gris | 126.8 | 124.1 | −2.1 % |

Otros materiales (consumibles, herrajes, acabados): IPC nacional urbano, +2.8 % interanual a sep-2026.

**Mano de obra.** La convención CAPAC-SUNTRACS 2022-2025 venció. El 2-ene-2026 CAPAC firmó una nueva convención 2026-2029 con siete sindicatos (sin SUNTRACS). La tabla de obras públicas (cláusula 120) no cambió respecto a jul-2025 (calificado $6.30/h, peón $4.67/h), y la cuota patronal de la CSS sigue en 13.25 % hasta feb-2027 (Ley 462). Por eso la mano de obra de las partidas de la Contraloría, que usan tarifas públicas, **no se escala**. El salario mínimo legal de construcción (Decreto Ejecutivo 13 de 2025) es $3.51/h en la Región 1 y $3.30/h en la Región 2, por debajo de los mínimos convencionales.

## 3. Método aplicado a las 1,169 partidas

Escalamiento paramétrico (mismo principio que las fórmulas de reajuste de precios de contratos públicos):

```
costo_nuevo = costo_2025 × (M × f_materiales + MO × 1.000 + E × 1.028)
```

- `f_materiales`: promedio de los factores IPMC de los materiales listados en la descripción de cada partida. Los materiales medidos por el INEC pesan 3 veces más que los consumibles (tornillos, lijas, cintas), que siguen el IPC.
- Participaciones M / MO / E (supuestos, la base no trae el desglose de cantidades):
  - general 60 / 35 / 5; electricidad y plomería 70 / 27 / 3; climatización, sistemas especiales, puertas y ventanas 75 / 22 / 3;
  - partidas con equipo pesado (retroexcavadora, volquete, rodillo, etc.) 45 / 25 / 30;
  - partidas sin materiales: 95 % mano de obra + 5 % herramienta, o 50 / 50 si usan equipo pesado.
- Precio de venta: se conserva el margen de cada partida (≈ 1.35).
- Protección: solo se actualizan filas cuyo costo sigue igual al de la base 2025. Si una partida ya se editó en el panel, se respeta. Ejecutar el seed dos veces no acumula el aumento.

**Resultado:** costo directo total $371,407.80 → $376,795.93 (**+1.45 %**). Factor mínimo 0.994 (concreto bombeado), máximo 1.167 (conductores de cobre), mediana 1.020. 80 partidas suben 5 % o más; 7 bajan.

Variación por categoría (categoría original de la base):

| Categoría | Variación |
|---|---:|
| Sistemas especiales y seguridad | +6.3 % |
| Movimiento de tierra y compactación | +3.9 % |
| Metales y herrería | +2.3 % |
| Sistemas livianos y cielos | +2.1 % |
| Pisos, revestimientos y fachadas | +2.1 % |
| Plomería, sanitaria y drenajes | +2.0 % |
| Puertas, ventanas y carpintería | +1.9 % |
| Techos y cubiertas | +1.8 % |
| Pintura, impermeabilización y acabados | +1.6 % |
| Preliminares, demolición y excavación | +1.4 % |
| Concreto y estructuras / Urbanismo | +0.9 % |
| Electricidad | +0.6 % (cobre +16.7 %, accesorios ≈ +2 %) |
| Mampostería y repello | +0.5 % |

## 4. Insumos individuales (materiales) — precios de góndola, nov-2026

Precios con ITBMS en ferreterías de Panamá metro (Cochez, Novey, Do it Center, Hopsa, Panablock). Cada insumo guarda su fuente en la descripción.

| Insumo | Unidad | Costo |
|---|---|---:|
| Cemento Portland 42.5 kg | saco | 8.40 |
| Cemento para albañilería 42.5 kg | saco | 7.99 |
| Mezcla cementicia multiuso 40 kg | saco | 5.59 |
| Concreto premezclado seco 42.5 kg | saco | 4.29 |
| Arena lavada | m³ | 35.15 |
| Piedra triturada #4 | m³ | 30.67 |
| Gravilla (referencia piedra #4 a granel) | m³ | 30.67 |
| Arena / piedra en saco 0.5 pie³ | saco | 0.96 / 0.89 |
| Bloque de concreto 4" / 6" / 8" | und. | 0.75 / 0.96 / 1.72 |
| Varilla #3 3/8" x 30' G40 | und. | 4.47 |
| Varilla #4 1/2" x 30' G60 | und. | 7.95 |
| Varilla #5 5/8" x 30' G60 | und. | 12.11 |
| Malla electrosoldada 4.11 mm / 4.5 mm (2.35 x 6 m) | und. | 27.49 / 37.99 |
| Clavo de acero 3" | kg | 3.89 |
| Concreto premezclado 3000 / 4000 psi (sin bomba) | m³ | 150.41 / 167.41 |
| Plywood fenólico 3/4" 4x8 | lám. | 38.99 |
| Plywood okume 3/4" 4x8 | lám. | 34.99 |
| Pinotea 2x4x10' | und. | 7.99 |
| Gypsum regular 1/2" / resistente a humedad 1/2" | lám. | 9.39 / 14.24 |
| Stud 3-5/8" x 10' cal. 24 | und. | 4.85 |
| Carriola 4"x2"x20' / 6"x20' cal. 16 | und. | 15.60 / 21.80 |
| Zinc corrugado 42" x 20' cal. 26 | lám. | 35.00 |
| Tubo PVC 4" SCH 40 / 4" SDR 41 / 2" SCH 40 / 1/2" SDR 13.5 (20') | und. | 64.79 / 31.33 / 21.95 / 3.02 |
| Cable THHN #12 | m | 0.75 |
| Pintura acrílica mate / premium satinada | gal | 27.99 / 36.99 |
| Sellador acrílico / impermeabilizante de techo | gal | 19.99 / 36.99 |
| Cerámica 60x60 / porcelanato 60x60 | m² | 9.99 / 15.99 |

## 5. Mano de obra para presupuestos privados

Salario mínimo convencional por hora, convención 2026-2029, cláusula 119 (obras privadas), escalón desde 1-jul-2026, más 45 % de prestaciones y cargas patronales.

Las cargas incluyen: CSS patronal 13.25 %, seguro educativo 1.50 %, riesgo profesional de construcción ≈ 5.7 %, XIII mes 8.33 %, vacaciones 9.09 %, prima de antigüedad 1.92 %, fondo de cesantía ≈ 2.25 %, y beneficios convencionales (días pagados, lluvia, transporte) ≈ 3 %.

| Oficio | Base $/h | Costo $/h |
|---|---:|---:|
| Ayudante / peón | 4.56 | 6.61 |
| Albañil principiante | 5.14 | 7.45 |
| Albañil, carpintero, reforzador, azulejero, instalador de vidrio y aluminio (calificado) | 6.16 | 8.93 |
| Electricista / plomero calificado | 6.23 | 9.03 |
| Pintor calificado | 5.84 | 8.47 |
| Gypsero / cimbrero calificado | 5.77 | 8.37 |
| Soldador de taller 1.ª | 6.50 | 9.42 |
| Operador de equipo liviano | 6.37 | 9.24 |
| Chofer de camión pesado | 6.39 | 9.27 |
| Operador de equipo pesado 1.ª | 7.72 | 11.19 |

Mano de obra por unidad usada por las calculadoras (rendimientos de referencia, jornada de 8 h):

| Concepto | Cuadrilla y rendimiento | Costo |
|---|---|---:|
| Colocación de concreto | 1 albañil + 4 ayudantes, 5 m³/día | $56.61/m³ |
| Colocación de bloques | 1 albañil + 1 ayudante, 10 m²/día | $12.44/m² |
| Repello | 1 albañil + ½ ayudante, 12 m²/día | $8.16/m² |

## 6. Limitaciones y qué revisar

- **Tabla de la convención 2026-2029:** las tarifas por oficio provienen de una transcripción pública de la edición de oficina (Preciario). Confirmar contra la copia registrada en el MITRADEL o en CAPAC antes de usarlas en contratos.
- **Concreto premezclado y agregados a granel:** una o dos fuentes cada uno. Pedir cotización a planta/cantera; el precio cambia mucho con la distancia de entrega.
- **Participaciones M / MO / E:** son supuestos por tipo de partida. Si la Contraloría publica la base 2026-2027, conviene reimportarla y retirar este escalamiento.
- **Región:** los precios son de Panamá metro. Para interior, la Contraloría publica bases separadas (Coclé–Veraguas, Colón–Chiriquí, Bocas–Darién).
- **Próxima revisión:** el INEC publica el IPMC de octubre 2026 el 13-nov-2026. Cambiar los índices en `IPMC` del generador y volver a generar como un seed nuevo (no editar el 003 una vez aplicado).

## 7. Fuentes

- Contraloría General de la República — Base de datos de costos directos de obras 2025-2026: https://www.contraloria.gob.pa/atencion-al-ciudadano/base-de-datos-de-costos-directos-de-obras/
- INEC — IPMC septiembre 2026 (cuadro y comentario): https://www.inec.gob.pa/avance/Default2.aspx?ID_CIFRAS=6&ID_CATEGORIA=1&ID_IDIOMA=1
- INEC — IPC septiembre 2026 (La Estrella de Panamá, 26-oct-2026): https://www.laestrella.com.pa/economia/la-inflacion-en-panama-sube-28-interanual-a-septiembre-EN26818826
- Convención colectiva 2026-2029 (La Estrella, 3-ene-2026): https://www.laestrella.com.pa/panama/nacional/capac-firma-nuevo-convenio-colectivo-con-siete-sindicatos-de-la-construccion-DD18827037
- Tarifas por oficio, cláusulas 119 y 120 (Preciario): https://preciario.com/mano-de-obra/
- Salario mínimo 2026, Decreto Ejecutivo 13 (WageIndicator): https://wageindicator.org/es-pa/ai/trabajo-en-panama/salario-minimo/3702-construccion/
- Cuota patronal CSS, Ley 462 de 2025 (TVN): https://www.tvn-2.com/nacionales/reformas-a-la-css-aumento-escalonado-cuota-patronal-caja-de-seguro-social_1_2182102.amp.html
- Precios de góndola: Cochez (cochezycia.com), Novey (novey.com.pa), Do it Center (doitcenter.com.pa), Hopsa (hopsa.com), Panablock (panablock.com), consultados en noviembre 2026.
- Concreto premezclado y arena de río, referencia: https://oneestimate.ai/es/blog/lista-precios-materiales-construccion-panama-2026
