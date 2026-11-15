#!/usr/bin/env python3
"""Genera la sección de políticas RLS de la migración 048.

Entrada: JSON de pg_policies exportado con search_path='' (expresiones
totalmente calificadas), por ejemplo:

    psql -tA -c "set search_path=''" -c "select pg_catalog.json_agg(...)
      from pg_catalog.pg_policies" > policies.json

Salida:
  - SQL con ALTER POLICY / DROP POLICY / CREATE POLICY (stdout o --sql).
  - JSON con la expresión efectiva antigua y nueva por tabla y acción
    (--pairs), que usa verify_rls_equivalence.sql para comprobar que la
    reescritura no cambia quién ve o modifica cada fila.

Transformaciones (todas equivalentes):
  1. Llamadas por fila -> arreglo calculado una vez por consulta (InitPlan):
       public.is_company_member(x)  -> (x = ANY ((SELECT private.member_company_ids())::uuid[]))
       public.is_company_admin(x)   -> (x = ANY ((SELECT private.member_company_ids('{owner,admin}'))::uuid[]))
       public.is_company_owner(x)   -> (x = ANY ((SELECT private.member_company_ids('{owner}'))::uuid[]))
       public.has_company_role(x, ARRAY[...])
                                    -> (x = ANY ((SELECT private.active_role_company_ids(ARRAY[...]))::uuid[]))
     El cast ::uuid[] es necesario: sin él, "= ANY ((SELECT ...))" se lee como
     subconsulta de arreglos (uuid = uuid[]). Con el cast, pg_get_expr y
     pg_dump lo conservan y la política se restaura igual.
       private.can_manage_job_requests(x)
                                    -> igual que has_company_role con owner/admin/estimator/sales
       public.is_admin()            -> (SELECT private.is_super_admin())
       app.current_user_id() suelto -> (SELECT app.current_user_id())
  2. Políticas permisivas de la misma tabla y acción se fusionan en una
     (las FOR ALL se reparten por acción). PostgreSQL combina las permisivas
     con OR, así que una sola política con el OR de las expresiones es
     idéntica. Las restrictivas no se fusionan.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict

COMMANDS = ("SELECT", "INSERT", "UPDATE", "DELETE")
SUPER_ADMIN = "( SELECT private.is_super_admin() AS is_super_admin)"
JOB_REQUEST_ROLES = (
    "ARRAY['owner'::public.company_role, 'admin'::public.company_role, "
    "'estimator'::public.company_role, 'sales'::public.company_role]"
)


def find_call(expr: str, name: str, start: int = 0):
    """Devuelve (inicio, fin, argumentos) de la siguiente llamada a `name`."""
    pattern = re.compile(r"(?<![\w.])" + re.escape(name) + r"\(")
    match = pattern.search(expr, start)
    if not match:
        return None
    depth = 0
    i = match.end() - 1
    while i < len(expr):
        if expr[i] == "(":
            depth += 1
        elif expr[i] == ")":
            depth -= 1
            if depth == 0:
                return match.start(), i + 1, expr[match.end():i]
        elif expr[i] == "'":
            i = expr.index("'", i + 1)
        i += 1
    raise ValueError(f"Paréntesis sin cerrar en: {expr}")


def split_args(args: str) -> list[str]:
    parts, depth, current = [], 0, []
    i = 0
    while i < len(args):
        ch = args[i]
        if ch == "'":
            end = args.index("'", i + 1)
            current.append(args[i:end + 1])
            i = end + 1
            continue
        if ch in "([":
            depth += 1
        elif ch in ")]":
            depth -= 1
        if ch == "," and depth == 0:
            parts.append("".join(current).strip())
            current = []
        else:
            current.append(ch)
        i += 1
    parts.append("".join(current).strip())
    return parts


def replace_calls(expr: str, name: str, build) -> str:
    pos = 0
    while True:
        found = find_call(expr, name, pos)
        if not found:
            return expr
        start, end, args = found
        replacement = build(split_args(args))
        expr = expr[:start] + replacement + expr[end:]
        pos = start + len(replacement)


def member_array(column: str, roles: str | None = None) -> str:
    arg = "" if roles is None else roles
    return f"({column} = ANY (( SELECT private.member_company_ids({arg}) AS member_company_ids)::uuid[]))"


def role_array(column: str, roles: str) -> str:
    return (
        f"({column} = ANY (( SELECT private.active_role_company_ids({roles}) "
        "AS active_role_company_ids)::uuid[]))"
    )


def rewrite(expr: str | None) -> str | None:
    if expr is None:
        return None
    out = expr
    out = replace_calls(out, "public.is_company_member", lambda a: member_array(a[0]))
    out = replace_calls(
        out,
        "public.is_company_admin",
        lambda a: member_array(
            a[0], "ARRAY['owner'::public.company_role, 'admin'::public.company_role]"
        ),
    )
    out = replace_calls(
        out,
        "public.is_company_owner",
        lambda a: member_array(a[0], "ARRAY['owner'::public.company_role]"),
    )
    out = replace_calls(out, "public.has_company_role", lambda a: role_array(a[0], a[1]))
    out = replace_calls(
        out, "private.can_manage_job_requests", lambda a: role_array(a[0], JOB_REQUEST_ROLES)
    )
    out = re.sub(r"(?<![\w.])public\.is_admin\(\)", SUPER_ADMIN, out)
    # app.current_user_id() que no esté ya envuelto en un SELECT.
    out = re.sub(
        r"(?<!SELECT )(?<![\w.])app\.current_user_id\(\)",
        "( SELECT app.current_user_id() AS current_user_id)",
        out,
    )
    for leftover in (
        "public.is_company_member(",
        "public.is_company_admin(",
        "public.is_company_owner(",
        "public.has_company_role(",
        "public.is_admin(",
    ):
        if leftover in out:
            raise ValueError(f"Quedó una llamada sin reescribir ({leftover}): {out}")
    return out


def cost_rank(expr: str) -> int:
    """Orden dentro del OR: primero lo que se resuelve una vez por consulta."""
    if expr.strip() == SUPER_ADMIN:
        return 0
    if "EXISTS" in expr:
        return 3
    if "= ANY (( SELECT private." in expr and "::uuid[]" in expr:
        return 1
    return 2


def or_join(exprs: list[str]) -> str:
    unique = []
    for e in sorted(exprs, key=cost_rank):
        if e not in unique:
            unique.append(e)
    if len(unique) == 1:
        return unique[0]
    return "(" + " OR ".join(f"({e})" for e in unique) + ")"


def and_join(exprs: list[str]) -> str:
    return "(" + " AND ".join(f"({e})" for e in exprs) + ")" if exprs else "true"


def q_ident(name: str) -> str:
    if re.fullmatch(r"[a-z_][a-z0-9_]*", name):
        return name
    return '"' + name.replace('"', '""') + '"'


def per_command(policy: dict, cmd: str) -> tuple[str | None, str | None]:
    """Expresiones (using, check) que una política aporta a una acción."""
    if policy["cmd"] not in (cmd, "ALL"):
        return None, None
    using, check = policy["qual"], policy["wc"]
    if cmd == "SELECT" or cmd == "DELETE":
        return using, None
    if cmd == "INSERT":
        return None, check if check is not None else using
    # UPDATE
    return using, check if check is not None else using


def effective(policies: list[dict], cmd: str, which: int, rewrite_fn) -> str | None:
    perm, rest = [], []
    for p in policies:
        expr = per_command(p, cmd)[which]
        if expr is None:
            continue
        expr = rewrite_fn(expr)
        (perm if p["permissive"] == "PERMISSIVE" else rest).append(expr)
    if not perm:
        return None  # sin política permisiva: denegado
    return and_join([or_join(perm)] + rest)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("policies_json")
    parser.add_argument("--sql", default="-")
    parser.add_argument("--pairs")
    parser.add_argument(
        "--down",
        help="Escribe aquí el SQL que restaura las políticas originales (reversión).",
    )
    args = parser.parse_args()

    policies = json.load(open(args.policies_json, encoding="utf-8"))
    for p in policies:
        if p["roles"] != ["contractor_api"]:
            raise SystemExit(f"Rol inesperado en {p['table']}.{p['name']}: {p['roles']}")

    by_table: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for p in policies:
        by_table[(p["schema"], p["table"])].append(p)

    sql: list[str] = []
    pairs = []
    stats = {"altered": 0, "dropped": 0, "created": 0, "unchanged": 0}
    existing_names = {(p["schema"], p["table"], p["name"]) for p in policies}

    for (schema, table), pols in sorted(by_table.items()):
        target = f"{schema}.{q_ident(table)}"
        permissive = [p for p in pols if p["permissive"] == "PERMISSIVE"]
        restrictive = [p for p in pols if p["permissive"] == "RESTRICTIVE"]

        counts = {
            cmd: sum(1 for p in permissive if p["cmd"] in (cmd, "ALL")) for cmd in COMMANDS
        }
        needs_merge = any(c > 1 for c in counts.values())

        table_sql: list[str] = []

        for p in restrictive:
            new_q, new_c = rewrite(p["qual"]), rewrite(p["wc"])
            if (new_q, new_c) == (p["qual"], p["wc"]):
                stats["unchanged"] += 1
                continue
            clauses = []
            if new_q is not None:
                clauses.append(f"  USING ({new_q})")
            if new_c is not None:
                clauses.append(f"  WITH CHECK ({new_c})")
            table_sql.append(f"ALTER POLICY {q_ident(p['name'])} ON {target}\n" + "\n".join(clauses) + ";")
            stats["altered"] += 1

        if not needs_merge:
            for p in permissive:
                new_q, new_c = rewrite(p["qual"]), rewrite(p["wc"])
                if (new_q, new_c) == (p["qual"], p["wc"]):
                    stats["unchanged"] += 1
                    continue
                clauses = []
                if new_q is not None:
                    clauses.append(f"  USING ({new_q})")
                if new_c is not None:
                    clauses.append(f"  WITH CHECK ({new_c})")
                table_sql.append(f"ALTER POLICY {q_ident(p['name'])} ON {target}\n" + "\n".join(clauses) + ";")
                stats["altered"] += 1
        else:
            for p in permissive:
                table_sql.append(f"DROP POLICY {q_ident(p['name'])} ON {target};")
                stats["dropped"] += 1
            for cmd in COMMANDS:
                contributing = [p for p in permissive if p["cmd"] in (cmd, "ALL")]
                if not contributing:
                    continue
                usings = [rewrite(per_command(p, cmd)[0]) for p in contributing]
                checks = [rewrite(per_command(p, cmd)[1]) for p in contributing]
                name = f"{table}_{cmd.lower()}_access"
                if (schema, table, name) in existing_names:
                    raise SystemExit(f"El nombre {name} ya existe")
                sources = ", ".join(p["name"] for p in contributing)
                lines = [
                    f"-- Reemplaza: {sources}",
                    f"CREATE POLICY {name} ON {target}",
                    f"  AS PERMISSIVE FOR {cmd} TO contractor_api",
                ]
                if cmd in ("SELECT", "UPDATE", "DELETE"):
                    if any(u is None for u in usings):
                        raise SystemExit(f"USING nulo en {table} {cmd}")
                    lines.append(f"  USING ({or_join(usings)})")
                if cmd in ("INSERT", "UPDATE"):
                    if any(c is None for c in checks):
                        raise SystemExit(f"WITH CHECK nulo en {table} {cmd}")
                    lines.append(f"  WITH CHECK ({or_join(checks)})")
                table_sql.append("\n".join(lines) + ";")
                stats["created"] += 1

        if table_sql:
            sql.append(f"-- {schema}.{table}\n" + "\n\n".join(table_sql))

        for cmd in COMMANDS:
            for which, label in ((0, "using"), (1, "check")):
                old = effective(pols, cmd, which, lambda e: e)
                new = effective(pols, cmd, which, rewrite)
                if old is None and new is None:
                    continue
                pairs.append(
                    {"schema": schema, "table": table, "cmd": cmd, "kind": label, "old": old, "new": new}
                )

    if args.down:
        down: list[str] = []
        for (schema, table), pols in sorted(by_table.items()):
            target = f"{schema}.{q_ident(table)}"
            permissive = [p for p in pols if p["permissive"] == "PERMISSIVE"]
            counts = {
                cmd: sum(1 for p in permissive if p["cmd"] in (cmd, "ALL")) for cmd in COMMANDS
            }
            merged = any(c > 1 for c in counts.values())
            stmts: list[str] = []
            if merged:
                for cmd in COMMANDS:
                    if any(p["cmd"] in (cmd, "ALL") for p in permissive):
                        stmts.append(
                            f"DROP POLICY IF EXISTS {table}_{cmd.lower()}_access ON {target};"
                        )
            for p in pols:
                if not merged or p["permissive"] == "RESTRICTIVE":
                    if (rewrite(p["qual"]), rewrite(p["wc"])) == (p["qual"], p["wc"]):
                        continue
                    clauses = []
                    if p["qual"] is not None:
                        clauses.append(f"  USING ({p['qual']})")
                    if p["wc"] is not None:
                        clauses.append(f"  WITH CHECK ({p['wc']})")
                    stmts.append(
                        f"ALTER POLICY {q_ident(p['name'])} ON {target}\n" + "\n".join(clauses) + ";"
                    )
                else:
                    lines = [
                        f"CREATE POLICY {q_ident(p['name'])} ON {target}",
                        f"  AS PERMISSIVE FOR {p['cmd']} TO contractor_api",
                    ]
                    if p["qual"] is not None:
                        lines.append(f"  USING ({p['qual']})")
                    if p["wc"] is not None:
                        lines.append(f"  WITH CHECK ({p['wc']})")
                    stmts.append("\n".join(lines) + ";")
            if stmts:
                down.append(f"-- {schema}.{table}\n" + "\n\n".join(stmts))
        open(args.down, "w", encoding="utf-8").write("\n\n".join(down) + "\n")

    out = "\n\n".join(sql) + "\n"
    if args.sql == "-":
        sys.stdout.write(out)
    else:
        open(args.sql, "w", encoding="utf-8").write(out)
    if args.pairs:
        json.dump(pairs, open(args.pairs, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(json.dumps(stats), file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
