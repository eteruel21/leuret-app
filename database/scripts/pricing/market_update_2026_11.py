#!/usr/bin/env python3
"""Genera database/seeds/003_market_prices_2026_11.sql.

Actualización de mercado — Panamá, noviembre 2026.

1. Escala las 1,169 partidas de la Contraloría (base julio 2025) con los índices
   oficiales del INEC (IPMC jul-2025 -> sep-2026) por familia de material.
2. Pone precio a los insumos individuales (materiales) con precios de góndola de
   ferreterías panameñas consultados en noviembre 2026.
3. Pone precio a la mano de obra por hora (convención colectiva 2026-2029,
   cláusula 119, obras privadas, escalón 1-jul-2026) y a los rendimientos
   usados por las calculadoras (concreto m³, bloques m², repello m²).

Uso: python3 -I database/scripts/pricing/market_update_2026_11.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SEED_IN = ROOT / "database/seeds/001_import_contraloria_catalog.sql"
SEED_OUT = ROOT / "database/seeds/003_market_prices_2026_11.sql"
REPORT_OUT = ROOT / "docs/pricing/market-update-2026-11-items.csv"

SOURCE_TAG = "actualizacion_mercado_2026_11"
DATE_LABEL = "noviembre de 2026"

# ---------------------------------------------------------------------------
# 1. Índices INEC (IPMC, distritos de Panamá y San Miguelito, jul-2007 = 100)
#    Columnas: julio 2025 (fecha base Contraloría) y septiembre 2026 (último
#    publicado, 13-oct-2026).
# ---------------------------------------------------------------------------
IPMC = {
    "madera": (164.6, 164.6),
    "arena": (153.4, 157.7),
    "piedra": (159.3, 179.0),
    "cemento": (126.8, 124.1),
    "varilla": (113.1, 121.7),
    "pvc": (115.6, 125.4),
    "hormigon": (161.4, 159.8),
    "bloque_cemento": (126.1, 142.0),
    "bloque_arcilla": (146.9, 146.9),
    "cable": (116.7, 144.4),
    "carriola": (92.6, 96.3),
    "zinc": (101.4, 101.4),
}
FACTOR = {k: round(v[1] / v[0], 4) for k, v in IPMC.items()}
# IPC nacional urbano, variación interanual sep-2026 (INEC): +2.8 %.
FACTOR["general"] = 1.028
# Mano de obra: tabla de obras públicas de la convención 2026-2029 sin cambio
# respecto a jul-2025 y cuota patronal CSS fija en 13.25 % hasta feb-2027.
FACTOR_LABOR = 1.0
# Equipo (alquiler + combustible): IPC general.
FACTOR_EQUIPMENT = 1.028

# Orden importa: la primera coincidencia gana.
MATERIAL_RULES: list[tuple[str, str]] = [
    (r"bloque[s]? de arcilla|ladrillo|arcilla", "bloque_arcilla"),
    (r"bloque", "bloque_cemento"),
    (r"premezclad|hormig[oó]n|concreto de \d|concreto regular|concreto \d|concreto de pavimento", "hormigon"),
    (r"cemento", "cemento"),
    (r"arena|aren[oó]n", "arena"),
    (r"piedra|grava|gravilla|agregado|material selecto|capa base|sub-?base|polvillo|tosca", "piedra"),
    (r"varilla|acero de refuerzo|barra corrugada|acero corrugado|malla electrosoldada|alambre de amarre|alambre negro", "varilla"),
    (r"\bpvc\b|cpvc|tuber[ií]a de presi[oó]n|\bsdr\b|tuber[ií]a pl[aá]stica|tubo pl[aá]stico|conduit pvc|ducto pvc", "pvc"),
    (r"cable|thhn|alambre de cobre|conductor|alambre #|alambre no\.|\bthw\b|\bxhhw\b", "cable"),
    (r"carriola|perfil galvanizado|stud|track|\bcanal\b", "carriola"),
    (r"zinc|l[aá]mina galvanizada|l[aá]mina de techo|galvalume|teja met", "zinc"),
    (r"madera|pinotea|plywood|playwood|tabl[oó]n|tabla|cuart[oó]n|reglas?\b|formaleta", "madera"),
]

MAIN_WEIGHT = 3.0

# Participación típica (materiales, mano de obra, equipo) por tipo de partida.
SHARES_DEFAULT = (0.60, 0.35, 0.05)
SHARES_BY_CATEGORY = {
    "Electricidad": (0.70, 0.27, 0.03),
    "Plomería, sanitaria y drenajes": (0.70, 0.27, 0.03),
    "Climatización y ventilación": (0.75, 0.22, 0.03),
    "Sistemas especiales y seguridad": (0.75, 0.22, 0.03),
    "Puertas, ventanas y carpintería": (0.75, 0.22, 0.03),
}
# El peso del equipo se decide por el equipo listado en la partida, no por la
# categoría (hay paredes de bloque clasificadas como movimiento de tierra).
SHARES_HEAVY = (0.45, 0.25, 0.30)
HEAVY_EQUIPMENT = re.compile(
    r"retroexcavadora|excavadora|volquete|motoniveladora|rodillo|compactadora|"
    r"cami[oó]n|tractor|pavimentadora|gr[uú]a|cargador|bulldozer|vibrocompactador|"
    r"distribuidor|planta|bomba de concreto",
    re.I,
)


def parse_seed_rows(text: str) -> list[dict]:
    rows: list[list] = []
    for chunk in re.split(r"^\) values$", text, flags=re.M)[1:]:
        rows.extend(_parse_values(chunk.split("\non conflict", 1)[0]))
    return _to_dicts(rows)


def _parse_values(body: str) -> list[list]:
    rows: list[list] = []
    i, n = 0, len(body)
    while i < n:
        if body[i] != "(":
            i += 1
            continue
        i += 1
        fields: list = []
        while True:
            while body[i] in " \n\t":
                i += 1
            if body[i] == "'":
                i += 1
                buf = []
                while True:
                    if body[i] == "'":
                        if i + 1 < n and body[i + 1] == "'":
                            buf.append("'")
                            i += 2
                            continue
                        i += 1
                        break
                    buf.append(body[i])
                    i += 1
                fields.append("".join(buf))
            else:
                j = i
                while body[j] not in ",)":
                    j += 1
                token = body[i:j].strip()
                fields.append(token)
                i = j
            while body[i] in " \n\t":
                i += 1
            if body[i] == ",":
                i += 1
                continue
            if body[i] == ")":
                i += 1
                break
        rows.append(fields)
    return rows


def _to_dicts(rows: list[list]) -> list[dict]:
    keys = [
        "code", "sku", "name", "description", "item_type", "category_name",
        "unit_name", "unit_symbol", "default_unit_cost", "default_sale_price",
        "default_waste_percentage", "active",
    ]
    out = []
    for r in rows:
        d = dict(zip(keys, r))
        d["default_unit_cost"] = float(d["default_unit_cost"])
        d["default_sale_price"] = float(d["default_sale_price"])
        out.append(d)
    return out


def section(desc: str, label: str) -> list[str]:
    m = re.search(rf"^{label}:\s*(.*)$", desc, re.M)
    if not m:
        return []
    return [p.strip() for p in m.group(1).split(";") if p.strip()]


def material_family(name: str) -> str:
    low = name.lower()
    for pattern, fam in MATERIAL_RULES:
        if re.search(pattern, low):
            return fam
    return "general"


def escalate(item: dict) -> dict:
    desc = item["description"]
    materials = section(desc, "Materiales")
    equipment = section(desc, "Equipo/herramienta")
    no_materials = (not materials) or any("No requiere materiales" in m for m in materials)
    heavy = any(HEAVY_EQUIPMENT.search(e) for e in equipment)

    if no_materials:
        m_share = 0.0
        e_share = 0.50 if heavy else 0.05
        l_share = 1.0 - e_share
        fam_list: list[str] = []
        m_factor = 1.0
    else:
        m_share, l_share, e_share = SHARES_BY_CATEGORY.get(item["category_name"], SHARES_DEFAULT)
        if heavy:
            m_share, l_share, e_share = SHARES_HEAVY
        fam_list = [material_family(m) for m in materials]
        # Los insumos principales (familias medidas por el INEC) pesan 3 veces
        # más que los consumibles (tornillos, lijas, cintas), que siguen el IPC.
        weights = [MAIN_WEIGHT if f != "general" else 1.0 for f in fam_list]
        m_factor = sum(FACTOR[f] * wt for f, wt in zip(fam_list, weights)) / sum(weights)

    factor = m_share * m_factor + l_share * FACTOR_LABOR + e_share * FACTOR_EQUIPMENT
    old_cost = item["default_unit_cost"]
    old_sale = item["default_sale_price"]
    new_cost = round(old_cost * factor, 2)
    markup = old_sale / old_cost if old_cost else 1.35
    new_sale = round(new_cost * markup, 2)
    return {
        "code": item["code"],
        "name": item["name"],
        "category": item["category_name"],
        "unit": item["unit_symbol"],
        "old_cost": old_cost,
        "old_sale": old_sale,
        "new_cost": new_cost,
        "new_sale": new_sale,
        "factor": round(factor, 4),
        "shares": (m_share, l_share, e_share),
        "families": sorted(set(fam_list)),
    }


# ---------------------------------------------------------------------------
# 2. Materiales individuales (precio de góndola con ITBMS, Panamá metro, nov-2026)
# ---------------------------------------------------------------------------
# code_suffix, sku, name, category, unit_name, unit_symbol, cost, waste %, fuente
MATERIALS = [
    ("cemento-portland-42_5kg", "MAT-CEM-425", "Cemento Portland 42.5 kg (saco)", "Cementos y morteros", "Saco", "saco", 8.40, 2,
     "Mediana de precio regular: Do it Center Chagres $8.29, Cochez Bayano $8.50, Novey Argos $8.50, Hopsa Argos $8.25."),
    ("cemento-albanileria-42_5kg", "MAT-CEM-ALB", "Cemento para albañilería 42.5 kg (saco)", "Cementos y morteros", "Saco", "saco", 7.99, 2,
     "Do it Center, Argos 42.5 kg $7.99."),
    ("mezcla-cementicia-40kg", "MAT-MEZ-40", "Mezcla cementicia multiuso 40 kg (saco)", "Cementos y morteros", "Saco", "saco", 5.59, 2,
     "Do it Center y Cochez, Argos 40 kg $5.59."),
    ("concreto-seco-42_5kg", "MAT-CON-SAC", "Concreto premezclado seco 42.5 kg (saco)", "Cementos y morteros", "Saco", "saco", 4.29, 2,
     "Do it Center, Argos 42.5 kg $4.29."),
    ("arena-lavada-m3", "MAT-ARE-M3", "Arena lavada para concreto (m³)", "Agregados", "Metro cúbico", "m³", 35.15, 5,
     "Promedio: Panablock arena a granel 30 yd $772.50 (= $33.67/m³) y referencia OneEstimate arena de río $28/yd³ (= $36.62/m³). Entrega a granel."),
    ("gravilla-m3", "MAT-GRA-M3", "Gravilla para concreto (m³)", "Agregados", "Metro cúbico", "m³", 30.67, 5,
     "Referencia: piedra #4 a granel Panablock 20 yd (15 m³) $460. Verificar con cantera local."),
    ("piedra-triturada-m3", "MAT-PIE-M3", "Piedra triturada para concreto (m³)", "Agregados", "Metro cúbico", "m³", 30.67, 5,
     "Panablock, piedra #4 a granel 20 yd (15 m³) $460 = $30.67/m³."),
    ("arena-saco-0_5ft3", "MAT-ARE-SAC", "Arena en saco 0.5 pie³", "Agregados", "Saco", "saco", 0.96, 3,
     "Cochez y Novey, arena en saco 0.50 pie³ $0.96."),
    ("piedra-saco-0_5ft3", "MAT-PIE-SAC", "Piedra #4 en saco 0.5 pie³", "Agregados", "Saco", "saco", 0.89, 3,
     "Cochez y Novey, piedra #4 en saco 0.50 pie³ $0.89."),
    ("bloque-4", "MAT-BLO-4", "Bloque de concreto de 4 pulgadas", "Bloques y mampostería", "Unidad", "und.", 0.75, 5,
     "Cochez paquete 100 und. $74.99; Hopsa 4x8x16 $0.69 y 4x8x18 $0.82; Novey $0.82."),
    ("bloque-6", "MAT-BLO-6", "Bloque de concreto de 6 pulgadas", "Bloques y mampostería", "Unidad", "und.", 0.96, 5,
     "Cochez paquete 100 und. $95.99; Hopsa 6x8x16 $0.95 y 6x8x18 $0.99."),
    ("bloque-8", "MAT-BLO-8", "Bloque de concreto de 8 pulgadas", "Bloques y mampostería", "Unidad", "und.", 1.72, 5,
     "Promedio: Hopsa 8x8x16 $1.60 y Cochez 8x16 $1.83."),
    ("varilla-3_8-30ft", "MAT-VAR-3", "Varilla corrugada #3 (3/8\") x 30 pies grado 40", "Acero de refuerzo", "Unidad", "und.", 4.47, 5,
     "Cochez y Novey, barra corrugada N° 3 3/8\" x 30' G40 $4.47."),
    ("varilla-1_2-30ft", "MAT-VAR-4", "Varilla corrugada #4 (1/2\") x 30 pies grado 60", "Acero de refuerzo", "Unidad", "und.", 7.95, 5,
     "Cochez y Novey, barra corrugada N° 4 1/2\" x 30' G60 $7.95."),
    ("varilla-5_8-30ft", "MAT-VAR-5", "Varilla corrugada #5 (5/8\") x 30 pies grado 60", "Acero de refuerzo", "Unidad", "und.", 12.11, 5,
     "Cochez/Novey tonelada 5/8\" x 30' G60 (64 und.) $775.00 = $12.11 c/u."),
    ("malla-electrosoldada-4_11mm", "MAT-MAL-411", "Malla electrosoldada 4.11 mm, 2.35 x 6.0 m", "Acero de refuerzo", "Unidad", "und.", 27.49, 3,
     "Hopsa, malla electrosoldada 4.11 mm x 2.35 x 6.0 m $27.49."),
    ("malla-electrosoldada-4_5mm", "MAT-MAL-45", "Malla electrosoldada 4.5 mm, 2.35 x 6.0 m", "Acero de refuerzo", "Unidad", "und.", 37.99, 3,
     "Hopsa, malla electrosoldada 4.5 mm x 2.35 x 6.0 m $37.99."),
    ("clavo-acero-3in-kg", "MAT-CLA-3", "Clavo de acero para concreto 3 pulgadas (kg)", "Ferretería", "Kilogramo", "kg", 3.89, 5,
     "Hopsa, clavo de acero para concreto 3\" por kg $3.89."),
    ("concreto-premezclado-3000-m3", "MAT-PRE-3000", "Concreto premezclado 3000 psi (m³)", "Concreto premezclado", "Metro cúbico", "m³", 150.41, 3,
     "Referencia de mercado $115/yd³ (OneEstimate, oct-2026) = $150.41/m³; sin bomba. Confirmar con planta (Argos, Cemex, Concretera)."),
    ("concreto-premezclado-4000-m3", "MAT-PRE-4000", "Concreto premezclado 4000 psi (m³)", "Concreto premezclado", "Metro cúbico", "m³", 167.41, 3,
     "Referencia de mercado $128/yd³ (OneEstimate, oct-2026) = $167.41/m³; sin bomba. Confirmar con planta."),
    ("plywood-fenolico-3_4", "MAT-PLY-FEN", "Plywood fenólico 3/4\" 4' x 8' para formaleta", "Maderas y formaletas", "Lámina", "lám.", 38.99, 5,
     "Cochez y Novey, plywood fenólico PRF 4x8x3/4\" $38.99 (1-3 usos)."),
    ("plywood-okume-3_4", "MAT-PLY-OKU", "Plywood regular okume 3/4\" 4' x 8'", "Maderas y formaletas", "Lámina", "lám.", 34.99, 5,
     "Do it Center, plywood 3/4\" 4x8 regular okume $34.99."),
    ("pinotea-2x4x10", "MAT-PIN-2410", "Pinotea cepillada 2\" x 4\" x 10'", "Maderas y formaletas", "Unidad", "und.", 7.99, 5,
     "Hopsa, pino cepillado 2x4x10' $7.99 (regular $9.15)."),
    ("gypsum-regular-1_2", "MAT-GYP-REG", "Lámina de gypsum regular 1/2\" 4' x 8'", "Sistemas livianos", "Lámina", "lám.", 9.39, 8,
     "Novey: Panel Rey $9.39, Knauf $8.99, USG $9.89 (mediana)."),
    ("gypsum-rh-1_2", "MAT-GYP-RH", "Lámina de gypsum resistente a la humedad 1/2\" 4' x 8'", "Sistemas livianos", "Lámina", "lám.", 14.24, 8,
     "Novey: USG RH $14.49, Panel Rey Guard $13.99 (promedio)."),
    ("stud-3_5_8-10ft", "MAT-STU-358", "Stud galvanizado 3-5/8\" x 10' calibre 24", "Sistemas livianos", "Unidad", "und.", 4.85, 5,
     "Novey, stud 3-5/8 x 1-1/2 x 10' cal. 24 $4.85."),
    ("carriola-4x2-20ft-c16", "MAT-CAR-4", "Carriola galvanizada 4\" x 2\" x 20' calibre 16", "Techos y cubiertas", "Unidad", "und.", 15.60, 3,
     "Novey $15.60; Hopsa $15.55; Cochez $16.00-16.40."),
    ("carriola-6-20ft-c16", "MAT-CAR-6", "Carriola galvanizada 6\" x 20' calibre 16", "Techos y cubiertas", "Unidad", "und.", 21.80, 3,
     "Novey, carriola 6\" x 20' cal. 16 $21.80."),
    ("zinc-corrugado-42x20-c26", "MAT-ZIN-20", "Lámina de zinc corrugado galvanizado 42\" x 20' calibre 26", "Techos y cubiertas", "Lámina", "lám.", 35.00, 5,
     "Cochez, zinc corrugado 42\" x 20' cal. 26 $35.00."),
    ("tubo-pvc-4-sch40-20ft", "MAT-PVC-4S40", "Tubo PVC sanitario 4\" x 20' SCH 40", "Plomería", "Unidad", "und.", 64.79, 3,
     "Cochez $64.79; Novey $71.21; Hopsa $52.99 (mediana)."),
    ("tubo-pvc-4-sdr41-20ft", "MAT-PVC-4S41", "Tubo PVC 4\" x 20' SDR 41", "Plomería", "Unidad", "und.", 31.33, 3,
     "Cochez $30.66; Novey $31.99 (promedio)."),
    ("tubo-pvc-2-sch40-20ft", "MAT-PVC-2S40", "Tubo PVC 2\" x 20' SCH 40", "Plomería", "Unidad", "und.", 21.95, 3,
     "Cochez, tubería PVC 2\" x 20' SCH 40 $21.95."),
    ("tubo-pvc-1_2-sdr13_5-20ft", "MAT-PVC-12P", "Tubo PVC presión 1/2\" x 20' SDR 13.5", "Plomería", "Unidad", "und.", 3.02, 3,
     "Cochez $3.05; Novey $2.99."),
    ("cable-thhn-12-m", "MAT-CAB-12", "Cable THHN #12 AWG cobre (metro)", "Electricidad", "Metro lineal", "m", 0.75, 5,
     "Cochez/Novey Miguelez por metro $0.74-0.76; Do it Center rollo 500' a $0.23/pie (= $0.75/m)."),
    ("pintura-acrilica-mate-gal", "MAT-PIN-STD", "Pintura acrílica mate interior/exterior (galón)", "Pinturas e impermeabilizantes", "Galón", "gal", 27.99, 3,
     "Do it Center, Glidden Peerless mate 1 gal $27.99 (Lanco Supra $23.99-24.99)."),
    ("pintura-acrilica-premium-gal", "MAT-PIN-PRE", "Pintura acrílica premium satinada (galón)", "Pinturas e impermeabilizantes", "Galón", "gal", 36.99, 3,
     "Do it Center, Glidden Glide-On Ultra satinado 1 gal $36.99."),
    ("sellador-acrilico-gal", "MAT-SEL-GAL", "Sellador acrílico para concreto (galón)", "Pinturas e impermeabilizantes", "Galón", "gal", 19.99, 3,
     "Do it Center, sellador acrílico Glidden 1 gal $19.99."),
    ("impermeabilizante-techo-gal", "MAT-IMP-GAL", "Impermeabilizante acrílico para techos (galón)", "Pinturas e impermeabilizantes", "Galón", "gal", 36.99, 3,
     "Do it Center, impermeabilizante acrílico Glidden 1 gal $36.99."),
    ("ceramica-piso-60x60-m2", "MAT-CER-60", "Cerámica de piso 60 x 60 cm (m²)", "Pisos y revestimientos", "Metro cuadrado", "m²", 9.99, 8,
     "Cochez/Novey, cerámica 60x60 Angelgres $9.99/m² (precio regular)."),
    ("porcelanato-60x60-m2", "MAT-POR-60", "Porcelanato 60 x 60 cm (m²)", "Pisos y revestimientos", "Metro cuadrado", "m²", 15.99, 8,
     "Cochez: JBN $15.99/m², Decortile $13.99/m², Time Ceramics $16.99/m² (mediana)."),
]

# ---------------------------------------------------------------------------
# 3. Mano de obra. Salario base por hora, convención colectiva de la
#    construcción 2026-2029 (CAPAC y siete sindicatos), cláusula 119
#    (obras privadas), escalón vigente desde el 1 de julio de 2026.
# ---------------------------------------------------------------------------
CARGAS = 0.45  # prestaciones y cargas patronales (ver detalle en el doc)
LABOR_RATES = [
    ("ayudante-hora", "LAB-AYU-H", "Ayudante general / peón (hora)", 4.56),
    ("albanil-principiante-hora", "LAB-ALB-PRI-H", "Albañil principiante (hora)", 5.14),
    ("albanil-calificado-hora", "LAB-ALB-H", "Albañil calificado (hora)", 6.16),
    ("carpintero-calificado-hora", "LAB-CAR-H", "Carpintero calificado (hora)", 6.16),
    ("reforzador-calificado-hora", "LAB-REF-H", "Reforzador / armador de acero calificado (hora)", 6.16),
    ("azulejero-calificado-hora", "LAB-AZU-H", "Azulejero / mosaiquero calificado (hora)", 6.16),
    ("electricista-calificado-hora", "LAB-ELE-H", "Electricista calificado (hora)", 6.23),
    ("plomero-calificado-hora", "LAB-PLO-H", "Plomero calificado (hora)", 6.23),
    ("pintor-calificado-hora", "LAB-PIN-H", "Pintor calificado (hora)", 5.84),
    ("gypsero-calificado-hora", "LAB-GYP-H", "Gypsero / cimbrero calificado (hora)", 5.77),
    ("instalador-vidrio-aluminio-hora", "LAB-VID-H", "Instalador de vidrio y aluminio calificado (hora)", 6.16),
    ("soldador-taller-1ra-hora", "LAB-SOL-H", "Soldador de taller y estructuras 1.ª (hora)", 6.50),
    ("operador-equipo-pesado-1ra-hora", "LAB-OEP-H", "Operador de equipo pesado 1.ª (hora)", 7.72),
    ("operador-equipo-liviano-hora", "LAB-OEL-H", "Operador de equipo liviano (hora)", 6.37),
    ("chofer-camion-pesado-hora", "LAB-CHO-H", "Chofer de camión pesado (hora)", 6.39),
]
RATE = {k: v for k, _, _, v in LABOR_RATES}

def crew_cost_per_unit(crew: dict[str, float], units_per_day: float) -> float:
    hourly = sum(RATE[k] * qty for k, qty in crew.items()) * (1 + CARGAS)
    return round(hourly * 8 / units_per_day, 2)

# Rendimientos de referencia por jornada de 8 h (editables por cada empresa).
PRODUCTIVITY = [
    ("concreto-m3", "LAB-CON-M3", "Mano de obra de colocación de concreto (m³)", "Metro cúbico", "m³",
     {"albanil-calificado-hora": 1, "ayudante-hora": 4}, 5.0,
     "Cuadrilla 1 albañil calificado + 4 ayudantes, mezcla en sitio y colocación manual, 5 m³ por jornada de 8 h."),
    ("bloques-m2", "LAB-BLO-M2", "Mano de obra de colocación de bloques (m²)", "Metro cuadrado", "m²",
     {"albanil-calificado-hora": 1, "ayudante-hora": 1}, 10.0,
     "Cuadrilla 1 albañil calificado + 1 ayudante, bloque de 4\" o 6\", 10 m² por jornada de 8 h."),
    ("repello-m2", "LAB-REP-M2", "Mano de obra de repello (m²)", "Metro cuadrado", "m²",
     {"albanil-calificado-hora": 1, "ayudante-hora": 0.5}, 12.0,
     "Cuadrilla 1 albañil calificado + 1/2 ayudante, repello liso en una cara, 12 m² por jornada de 8 h."),
]

# Correcciones de categoría detectadas en la revisión del catálogo base.
RECATEGORIZE = {
    **{f"contraloria:2025:{n}": ("Movimiento de tierra y compactación", "Mampostería y repello")
       for n in (81, 82, 83, 84, 85, 86, 87, 88, 1144, 1145)},
    "contraloria:2025:1023": ("Movimiento de tierra y compactación", "Pisos, revestimientos y fachadas"),
}

MARKUP = 1.35  # mismo margen de venta que el catálogo base


def sql_str(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def money(value: float) -> str:
    return f"{value:.2f}"


def main() -> int:
    items = parse_seed_rows(SEED_IN.read_text(encoding="utf-8"))
    if len(items) != 1169:
        print(f"Se esperaban 1169 partidas y se leyeron {len(items)}", file=sys.stderr)
        return 1
    results = [escalate(i) for i in items]

    old_total = sum(r["old_cost"] for r in results)
    new_total = sum(r["new_cost"] for r in results)

    lines: list[str] = []
    w = lines.append
    w("-- Actualización de precios de mercado — Panamá, " + DATE_LABEL + ".")
    w("-- Generado por database/scripts/pricing/market_update_2026_11.py. No editar a mano.")
    w("--")
    w("-- 1) Escala las 1,169 partidas de la Contraloría (base 10-jul-2025) con los")
    w("--    Índices de Precios al por Menor de Materiales de Construcción del INEC")
    w("--    (jul-2025 -> sep-2026) por familia de material, IPC para equipo y")
    w("--    mano de obra sin cambio (tabla pública de la convención 2026-2029).")
    w("--    Solo actualiza filas cuyo costo sigue igual al de la base 2025: no pisa")
    w("--    precios editados en el panel y no se acumula si se ejecuta dos veces.")
    w("-- 2) Pone precio a insumos individuales y mano de obra (item_type material/labor)")
    w("--    usados por las calculadoras. Solo rellena los que están en 0 o los crea.")
    w("-- 3) Registra cada cambio en platform_catalog_price_history (source = '" + SOURCE_TAG + "').")
    w(f"-- Costo directo total de las 1,169 partidas: {old_total:,.2f} -> {new_total:,.2f}"
      f" ({(new_total / old_total - 1) * 100:+.2f} %).")
    w("")
    w("begin;")
    w("")
    w("create temporary table tmp_market_update (")
    w("  code text primary key,")
    w("  expected_cost numeric not null,")
    w("  expected_sale numeric not null,")
    w("  new_cost numeric not null,")
    w("  new_sale numeric not null,")
    w("  factor numeric not null")
    w(") on commit drop;")
    w("")
    w("insert into tmp_market_update (code, expected_cost, expected_sale, new_cost, new_sale, factor) values")
    vals = [
        f"  ({sql_str(r['code'])}, {r['old_cost']}, {r['old_sale']}, {money(r['new_cost'])}, {money(r['new_sale'])}, {r['factor']})"
        for r in results
    ]
    w(",\n".join(vals) + ";")
    w("")
    w("with changed as (")
    w("  update public.platform_catalog_items p")
    w("  set default_unit_cost = t.new_cost,")
    w("      default_sale_price = t.new_sale,")
    w("      description = case")
    w("        when p.description like '%Actualización de mercado nov-2026%' then p.description")
    w("        else coalesce(p.description, '') || E'\\nActualización de mercado nov-2026: factor ' || t.factor::text")
    w("             || ' (IPMC INEC jul-2025 a sep-2026 por material; IPC para equipo; mano de obra sin cambio).'")
    w("      end,")
    w("      updated_at = now()")
    w("  from tmp_market_update t")
    w("  where p.code = t.code")
    w("    and p.default_unit_cost = t.expected_cost")
    w("    and (p.default_unit_cost <> t.new_cost or p.default_sale_price <> t.new_sale)")
    w("  returning p.id, t.expected_cost, t.expected_sale, t.factor, p.default_unit_cost, p.default_sale_price, p.default_waste_percentage")
    w(")")
    w("insert into public.platform_catalog_price_history (")
    w("  catalog_item_id, previous_unit_cost, previous_sale_price, previous_waste_percentage,")
    w("  unit_cost, sale_price, waste_percentage, source, notes")
    w(")")
    w("select c.id, c.expected_cost, c.expected_sale, c.default_waste_percentage,")
    w("       c.default_unit_cost, c.default_sale_price, c.default_waste_percentage,")
    w(f"       {sql_str(SOURCE_TAG)}, 'Escalamiento paramétrico factor ' || c.factor::text")
    w("from changed c;")
    w("")

    w("-- Correcciones de categoría (muros y paredes de bloque estaban en movimiento de tierra).")
    for code, (old, new) in RECATEGORIZE.items():
        w(f"update public.platform_catalog_items set category_name = {sql_str(new)}, updated_at = now() "
          f"where code = {sql_str(code)} and category_name = {sql_str(old)};")
    w("")
    # Insumos
    w("-- Insumos individuales y mano de obra para las calculadoras.")
    w("create temporary table tmp_market_inputs (")
    w("  code text primary key, sku text, name text, description text,")
    w("  item_type public.catalog_item_type, category_name text, unit_name text, unit_symbol text,")
    w("  unit_cost numeric, sale_price numeric, waste numeric")
    w(") on commit drop;")
    w("")
    w("insert into tmp_market_inputs values")
    rows = []
    report_inputs = []
    for suffix, sku, name, cat, unit_name, unit_sym, cost, waste, src in MATERIALS:
        desc = (f"Insumo individual. Precio de góndola con ITBMS, Panamá metro, {DATE_LABEL}. "
                f"Fuente: {src} Ajustar según proveedor, volumen y ubicación.")
        sale = round(cost * MARKUP, 2)
        rows.append(f"  ({sql_str('leuret:material:' + suffix)}, {sql_str(sku)}, {sql_str(name)}, {sql_str(desc)}, "
                    f"'material', {sql_str(cat)}, {sql_str(unit_name)}, {sql_str(unit_sym)}, {money(cost)}, {money(sale)}, {waste})")
        report_inputs.append(("material", "leuret:material:" + suffix, name, unit_sym, cost, sale, src))
    for suffix, sku, name, base in LABOR_RATES:
        cost = round(base * (1 + CARGAS), 2)
        sale = round(cost * MARKUP, 2)
        desc = (f"Solo mano de obra. Salario mínimo convencional ${base:.2f}/h (convención colectiva de la construcción "
                f"2026-2029, cláusula 119, obras privadas, vigente desde 1-jul-2026) + {int(CARGAS * 100)} % de "
                f"prestaciones y cargas patronales (CSS 13.25 %, seguro educativo 1.5 %, riesgo profesional, XIII mes, "
                f"vacaciones, prima de antigüedad y fondo de cesantía). Obras públicas: usar la tabla de la cláusula 120.")
        rows.append(f"  ({sql_str('leuret:labor:' + suffix)}, {sql_str(sku)}, {sql_str(name)}, {sql_str(desc)}, "
                    f"'labor', 'Mano de obra', 'Hora', 'h', {money(cost)}, {money(sale)}, 0)")
        report_inputs.append(("labor", "leuret:labor:" + suffix, name, "h", cost, sale, f"base ${base:.2f}/h + {int(CARGAS*100)} %"))
    for suffix, sku, name, unit_name, unit_sym, crew, per_day, note in PRODUCTIVITY:
        cost = crew_cost_per_unit(crew, per_day)
        sale = round(cost * MARKUP, 2)
        desc = (f"Solo mano de obra; no incluye materiales. {note} Tarifas de la convención 2026-2029 (cl. 119) "
                f"+ {int(CARGAS * 100)} % de cargas. Ajustar el rendimiento a la realidad de cada obra.")
        rows.append(f"  ({sql_str('leuret:labor:' + suffix)}, {sql_str(sku)}, {sql_str(name)}, {sql_str(desc)}, "
                    f"'labor', 'Mano de obra', {sql_str(unit_name)}, {sql_str(unit_sym)}, {money(cost)}, {money(sale)}, 0)")
        report_inputs.append(("labor", "leuret:labor:" + suffix, name, unit_sym, cost, sale, note))
    w(",\n".join(rows) + ";")
    w("")
    w("-- Nuevos insumos.")
    w("insert into public.platform_catalog_items (")
    w("  code, sku, name, description, item_type, category_name, unit_name, unit_symbol,")
    w("  default_unit_cost, default_sale_price, default_waste_percentage, active")
    w(")")
    w("select code, sku, name, description, item_type, category_name, unit_name, unit_symbol,")
    w("       unit_cost, sale_price, waste, true")
    w("from tmp_market_inputs")
    w("on conflict do nothing;")
    w("")
    w("-- Insumos existentes que seguían sin precio (seed 002).")
    w("with priced as (")
    w("  update public.platform_catalog_items p")
    w("  set description = t.description,")
    w("      default_unit_cost = t.unit_cost,")
    w("      default_sale_price = t.sale_price,")
    w("      default_waste_percentage = t.waste,")
    w("      updated_at = now()")
    w("  from tmp_market_inputs t")
    w("  where p.code = t.code")
    w("    and p.default_unit_cost = 0")
    w("    and p.default_sale_price = 0")
    w("  returning p.id, p.default_unit_cost, p.default_sale_price, p.default_waste_percentage")
    w(")")
    w("insert into public.platform_catalog_price_history (")
    w("  catalog_item_id, previous_unit_cost, previous_sale_price, previous_waste_percentage,")
    w("  unit_cost, sale_price, waste_percentage, source, notes")
    w(")")
    w("select id, 0, 0, 0, default_unit_cost, default_sale_price, default_waste_percentage,")
    w(f"       {sql_str(SOURCE_TAG)}, 'Primer precio de mercado del insumo'")
    w("from priced;")
    w("")
    w("commit;")
    w("")
    w("-- Verificación (solo lectura):")
    w("-- select source, count(*) from public.platform_catalog_price_history group by source;")
    w("-- select item_type::text, count(*), count(*) filter (where default_unit_cost = 0) as sin_precio")
    w("--   from public.platform_catalog_items group by 1;")
    SEED_OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")

    # Reporte CSV
    REPORT_OUT.parent.mkdir(parents=True, exist_ok=True)
    import csv
    with REPORT_OUT.open("w", newline="", encoding="utf-8") as fh:
        wr = csv.writer(fh)
        wr.writerow(["tipo", "codigo", "nombre", "categoria", "unidad", "costo_2025", "costo_nov_2026",
                     "precio_venta_nov_2026", "factor", "participacion_mat_mo_eq", "familias_material"])
        for r in results:
            wr.writerow(["partida", r["code"], r["name"], r["category"], r["unit"], money(r["old_cost"]),
                         money(r["new_cost"]), money(r["new_sale"]), r["factor"],
                         "/".join(f"{s:.2f}" for s in r["shares"]), " ".join(r["families"])])
        for kind, code, name, unit, cost, sale, src in report_inputs:
            wr.writerow([kind, code, name, "", unit, "", money(cost), money(sale), "", "", src])

    # Resumen por categoría para la consola / documentación
    by_cat: dict[str, list[float]] = {}
    for r in results:
        by_cat.setdefault(r["category"], [0.0, 0.0, 0])
        by_cat[r["category"]][0] += r["old_cost"]
        by_cat[r["category"]][1] += r["new_cost"]
        by_cat[r["category"]][2] += 1
    summary = {
        "total_old": round(old_total, 2),
        "total_new": round(new_total, 2),
        "factors": FACTOR,
        "by_category": {k: {"n": v[2], "pct": round((v[1] / v[0] - 1) * 100, 2)} for k, v in by_cat.items()},
        "changed": sum(1 for r in results if r["new_cost"] != r["old_cost"]),
        "inputs": [(c, n, u, cost) for _, c, n, u, cost, _, _ in report_inputs],
        "max": sorted(results, key=lambda r: -r["factor"])[:8],
        "min": sorted(results, key=lambda r: r["factor"])[:5],
    }
    print(json.dumps(summary, ensure_ascii=False, indent=1, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
