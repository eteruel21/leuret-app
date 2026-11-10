# Precios regionales

Los precios base del catálogo de plataforma corresponden a Panamá metropolitano
(Panamá y San Miguelito), que es donde el INEC levanta el IPMC. Cada usuario
elige su región en **Catálogo → Región de precios** y la vista
`effective_platform_catalog_prices` le devuelve `unit_cost` y `sale_price`
multiplicados por el factor de su región según el tipo de partida:

| Tipo de partida            | Factor             |
| -------------------------- | ------------------ |
| `material`                 | `material_factor`  |
| `labor`                    | `labor_factor`     |
| `equipment`                | `equipment_factor` |
| `service`, `subcontract`   | `service_factor`   |

Los precios personalizados (`user_catalog_price_overrides`) no se ajustan.

## Factores iniciales (migración 035)

Son estimaciones y el super admin puede editarlos en `platform_price_regions`:

- **Mano de obra:** el salario mínimo de construcción 2026 es B/.3.51/h en
  Región 1 y B/.3.30/h en Región 2 (Decreto Ejecutivo 13 de 2025), un 6% menos.
  En el interior se usa 0.95. Darién y las comarcas suman viáticos.
- **Materiales y equipo:** recargo por flete desde Panamá. Las cabeceras con
  ferreterías grandes (Chitré, Santiago, David) quedan entre +2% y +3%.
  Bocas del Toro, Darién y las comarcas van de +10% a +18%.
- **Partidas:** 55% materiales, 35% mano de obra y 10% equipo.

| Región                | Materiales | Mano de obra | Equipo | Partidas |
| --------------------- | ---------- | ------------ | ------ | -------- |
| Panamá metropolitano  | 1.000      | 1.000        | 1.000  | 1.000    |
| Panamá Oeste          | 1.000      | 0.970        | 1.000  | 0.990    |
| Colón                 | 1.020      | 1.000        | 1.030  | 1.014    |
| Coclé                 | 1.020      | 0.950        | 1.020  | 0.996    |
| Azuero                | 1.030      | 0.950        | 1.030  | 1.002    |
| Veraguas              | 1.030      | 0.950        | 1.030  | 1.002    |
| Chiriquí              | 1.030      | 0.950        | 1.030  | 1.002    |
| Bocas del Toro        | 1.120      | 1.000        | 1.100  | 1.076    |
| Darién                | 1.100      | 1.050        | 1.100  | 1.078    |
| Comarcas              | 1.180      | 1.100        | 1.150  | 1.149    |

Conviene validarlos con cotizaciones reales de ferreterías de cada provincia y
ajustarlos en la revisión mensual de precios.
