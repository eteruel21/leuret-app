import { exportHtmlDocument } from "@/utils/document-export";

import {
  formatMoney,
  type BudgetItem,
  type BudgetSection,
  type BudgetWithDetails,
} from "@/types/budget";
import { getClientDisplayName } from "@/types/client";
import type { Company } from "@/types/company";

type BudgetPdfInput = {
  company: Company;
  budget: BudgetWithDetails;
};

function escapeHtml(value: string | null | undefined) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/** Texto con saltos de línea → HTML seguro. */
function multiline(value: string | null | undefined) {
  return escapeHtml(value).replace(/\r?\n/g, "<br />");
}

/** «13 de noviembre de 2026». */
export function longDate(value: string | null | undefined, timezone = "America/Panama"): string {
  if (!value) return "";
  const date = value.includes("T") ? new Date(value) : new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("es-PA", { day: "numeric", month: "long", year: "numeric", timeZone: timezone }).format(date);
  } catch {
    return new Intl.DateTimeFormat("es-PA", { day: "numeric", month: "long", year: "numeric" }).format(date);
  }
}

function quantityLabel(value: number) {
  const n = Number(value);
  return Number.isInteger(n)
    ? n.toLocaleString("es-PA")
    : n.toLocaleString("es-PA", { maximumFractionDigits: 2 });
}

type Group = { section: BudgetSection | null; items: BudgetItem[] };

/** Partidas agrupadas por sección, en orden, sin secciones vacías. */
export function budgetGroups(budget: Pick<BudgetWithDetails, "sections" | "items">): Group[] {
  const bySort = (a: { sort_order: number }, b: { sort_order: number }) => (a.sort_order ?? 0) - (b.sort_order ?? 0);
  const groups: Group[] = [...budget.sections]
    .sort(bySort)
    .map((section) => ({
      section,
      items: budget.items.filter((item) => item.section_id === section.id).sort(bySort),
    }))
    .filter((group) => group.items.length > 0);

  const sectionIds = new Set(budget.sections.map((section) => section.id));
  const orphans = budget.items.filter((item) => !item.section_id || !sectionIds.has(item.section_id)).sort(bySort);
  if (orphans.length) groups.push({ section: null, items: orphans });
  return groups;
}

function renderRows(groups: Group[], currencyCode?: string) {
  if (!groups.length) {
    return `<tr><td colspan="6" class="empty">Este presupuesto no tiene partidas.</td></tr>`;
  }
  // Con una sola sección «General» el encabezado de sección no aporta nada.
  const showSections = groups.length > 1 || (groups[0]?.section && groups[0].section.name.trim().toLowerCase() !== "general");
  let index = 0;

  return groups.map((group) => {
    const sectionTotal = group.items.reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
    const header = showSections
      ? `<tr class="section"><td colspan="5">${escapeHtml(group.section?.name ?? "Otros")}</td><td class="num">${formatMoney(sectionTotal, currencyCode)}</td></tr>`
      : "";
    const rows = group.items.map((item) => {
      index += 1;
      const includesMaterial = Boolean(item.materials?.length) || item.item_type === "material";
      const discount = Number(item.discount_percentage) > 0
        ? `<div class="note">Descuento ${Number(item.discount_percentage).toLocaleString("es-PA")} %</div>`
        : "";
      return `
        <tr>
          <td class="idx">${index}</td>
          <td>
            <div class="desc">${escapeHtml(item.description)}</div>
            ${item.notes ? `<div class="note">${multiline(item.notes)}</div>` : ""}
            ${includesMaterial && item.item_type !== "material" ? `<div class="tag">Incluye materiales</div>` : ""}
            ${discount}
          </td>
          <td class="num">${quantityLabel(item.quantity)}</td>
          <td class="center">${escapeHtml(item.unit_name)}</td>
          <td class="num">${formatMoney(item.unit_price, currencyCode)}</td>
          <td class="num strong">${formatMoney(item.subtotal, currencyCode)}</td>
        </tr>`;
    }).join("");
    return header + rows;
  }).join("");
}

export function buildBudgetHtml({ company, budget }: BudgetPdfInput) {
  const timezone = company.timezone || "America/Panama";
  const currency = budget.currency_code;
  const client = budget.client;
  const clientName = client ? getClientDisplayName(client) : "Cliente";
  const clientLines = [
    client?.phone ? `Tel. ${client.phone}` : "",
    client?.email ?? "",
  ].filter(Boolean);
  const workAddress = [budget.address?.address, budget.address?.district, budget.address?.province]
    .filter(Boolean)
    .join(", ");
  const companyLines = [
    company.legal_name && company.legal_name !== company.name ? company.legal_name : "",
    company.tax_id ? `RUC ${company.tax_id}` : "",
    company.address ?? "",
    [company.phone ? `Tel. ${company.phone}` : "", company.email ?? ""].filter(Boolean).join(" · "),
  ].filter(Boolean);

  const number = `${budget.budget_number}${budget.version > 1 ? ` · versión ${budget.version}` : ""}`;
  const issued = longDate(budget.created_at, timezone);
  const validUntil = longDate(budget.valid_until, timezone);
  const groups = budgetGroups(budget);
  const discount = Number(budget.discount_amount) > 0;
  const taxRate = Number(budget.tax_rate);
  const taxLabel = `ITBMS ${Number.isInteger(taxRate) ? taxRate : taxRate.toFixed(2)} %`;
  const scope = budget.description?.trim() && budget.description.trim() !== budget.title.trim()
    ? budget.description.trim()
    : "";
  const workName = budget.project?.name || budget.title;
  // El asunto solo se muestra si aporta algo más que el nombre de la obra.
  const showSubjectTitle = budget.title.trim() !== workName.trim();
  const subject = showSubjectTitle || scope
    ? `<div class="subject">
    <div class="label">Asunto</div>
    ${showSubjectTitle ? `<strong>${escapeHtml(budget.title)}</strong>` : ""}
    ${scope ? `<div class="muted">${multiline(scope)}</div>` : ""}
  </div>`
    : "";

  const conditions = [
    validUntil ? `Esta cotización es válida hasta el ${validUntil}.` : "",
    "Los precios están expresados en " + (currency === "USD" ? "dólares de los Estados Unidos (USD)" : escapeHtml(currency)) + ".",
  ].filter(Boolean);

  const logo = company.logo_url
    ? `<img class="logo" src="${escapeHtml(company.logo_url)}" alt="" />`
    : `<div class="logo-fallback">${escapeHtml(company.name.trim().charAt(0).toUpperCase() || "L")}</div>`;

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Cotización ${escapeHtml(budget.budget_number)}</title>
<style>
  @page { size: A4; margin: 14mm 14mm 16mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; color: #1E2A3A; font-size: 11.5px; line-height: 1.45; background: #fff; }
  .page { max-width: 760px; margin: 0 auto; padding: 8px 4px 0; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; padding-bottom: 16px; border-bottom: 2px solid #1E2A3A; }
  .brand { display: flex; gap: 14px; align-items: flex-start; }
  .logo { width: 64px; height: 64px; object-fit: contain; }
  .logo-fallback { width: 56px; height: 56px; border-radius: 10px; background: #1E2A3A; color: #fff; font-size: 28px; font-weight: 800; display: flex; align-items: center; justify-content: center; }
  .company { font-size: 18px; font-weight: 800; letter-spacing: -0.01em; }
  .company-lines { color: #5E6D7D; font-size: 10.5px; margin-top: 3px; }
  .doc { text-align: right; min-width: 200px; }
  .doc-title { font-size: 24px; font-weight: 800; letter-spacing: 0.12em; color: #E23D3D; }
  .doc-meta { margin-top: 6px; border-collapse: collapse; margin-left: auto; }
  .doc-meta td { padding: 2px 0 2px 12px; font-size: 11px; border: none; }
  .doc-meta td:first-child { color: #5E6D7D; text-align: left; padding-left: 0; }
  .doc-meta td:last-child { font-weight: 700; text-align: right; }
  .parties { display: flex; gap: 16px; margin: 18px 0 14px; }
  .party { flex: 1; padding: 12px 14px; border: 1px solid #DDD8CF; border-radius: 8px; }
  .label { font-size: 9.5px; font-weight: 800; color: #8FA3B8; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 4px; }
  .party-name { font-size: 13px; font-weight: 800; }
  .muted { color: #5E6D7D; }
  .subject { margin: 0 0 12px; padding: 10px 14px; background: #F6F1E7; border-radius: 8px; }
  .subject strong { font-size: 13px; }
  table.items { width: 100%; border-collapse: collapse; margin-top: 4px; }
  table.items thead { display: table-header-group; }
  table.items th { background: #1E2A3A; color: #fff; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; padding: 8px 8px; text-align: left; }
  table.items td { padding: 9px 8px; border-bottom: 1px solid #E7E1D7; vertical-align: top; }
  table.items tr { page-break-inside: avoid; break-inside: avoid; }
  tr.section td { background: #EEF1F3; font-weight: 800; text-transform: uppercase; font-size: 10px; letter-spacing: 0.06em; padding: 7px 8px; }
  .idx { width: 26px; color: #8FA3B8; }
  .desc { font-weight: 700; }
  .note { color: #5E6D7D; font-size: 10.5px; margin-top: 2px; }
  .tag { display: inline-block; margin-top: 4px; padding: 1px 6px; border-radius: 4px; background: #E5EFE9; color: #3F6B56; font-size: 9.5px; font-weight: 700; }
  .num { text-align: right; white-space: nowrap; }
  .center { text-align: center; white-space: nowrap; }
  .strong { font-weight: 800; }
  .empty { text-align: center; color: #8FA3B8; padding: 18px; }
  th.num, th.center { text-align: right; }
  th.center { text-align: center; }
  .summary { display: flex; gap: 20px; margin-top: 16px; align-items: flex-start; page-break-inside: avoid; break-inside: avoid; }
  .terms { flex: 1; font-size: 10.5px; }
  .terms ul { margin: 4px 0 0; padding-left: 16px; }
  .terms li { margin-bottom: 3px; }
  .totals { width: 260px; border-collapse: collapse; }
  .totals td { padding: 6px 10px; border: none; }
  .totals td:last-child { text-align: right; font-weight: 700; white-space: nowrap; }
  .totals tr.grand td { background: #1E2A3A; color: #fff; font-size: 14px; font-weight: 800; padding: 10px; }
  .signatures { display: flex; gap: 40px; margin-top: 46px; page-break-inside: avoid; break-inside: avoid; }
  .signature { flex: 1; border-top: 1px solid #1E2A3A; padding-top: 6px; font-size: 10.5px; }
  .footer { margin-top: 28px; padding-top: 8px; border-top: 1px solid #E7E1D7; color: #8FA3B8; font-size: 9.5px; display: flex; justify-content: space-between; }
</style>
</head>
<body>
<div class="page">
  <div class="top">
    <div class="brand">
      ${logo}
      <div>
        <div class="company">${escapeHtml(company.name)}</div>
        <div class="company-lines">${companyLines.map(escapeHtml).join("<br />")}</div>
      </div>
    </div>
    <div class="doc">
      <div class="doc-title">COTIZACIÓN</div>
      <table class="doc-meta">
        <tr><td>N.º</td><td>${escapeHtml(number)}</td></tr>
        ${issued ? `<tr><td>Fecha</td><td>${escapeHtml(issued)}</td></tr>` : ""}
        ${validUntil ? `<tr><td>Válida hasta</td><td>${escapeHtml(validUntil)}</td></tr>` : ""}
      </table>
    </div>
  </div>

  <div class="parties">
    <div class="party">
      <div class="label">Cliente</div>
      <div class="party-name">${escapeHtml(clientName)}</div>
      ${clientLines.length ? `<div class="muted">${clientLines.map(escapeHtml).join("<br />")}</div>` : ""}
    </div>
    <div class="party">
      <div class="label">Obra</div>
      <div class="party-name">${escapeHtml(workName)}</div>
      ${workAddress ? `<div class="muted">${escapeHtml(workAddress)}</div>` : ""}
    </div>
  </div>

  ${subject}

  <table class="items">
    <thead>
      <tr>
        <th>#</th>
        <th>Descripción</th>
        <th class="num">Cant.</th>
        <th class="center">Unidad</th>
        <th class="num">Precio unit.</th>
        <th class="num">Importe</th>
      </tr>
    </thead>
    <tbody>${renderRows(groups, currency)}</tbody>
  </table>

  <div class="summary">
    <div class="terms">
      <div class="label">Condiciones</div>
      <ul>
        ${conditions.map((line) => `<li>${line}</li>`).join("")}
        ${budget.terms?.trim() ? `<li>${multiline(budget.terms)}</li>` : ""}
      </ul>
      ${budget.notes?.trim() ? `<div class="label" style="margin-top:10px">Notas</div><div>${multiline(budget.notes)}</div>` : ""}
    </div>
    <table class="totals">
      <tr><td>Subtotal</td><td>${formatMoney(budget.subtotal, currency)}</td></tr>
      ${discount ? `<tr><td>Descuento</td><td>− ${formatMoney(budget.discount_amount, currency)}</td></tr>` : ""}
      <tr><td>${taxLabel}</td><td>${formatMoney(budget.tax_amount, currency)}</td></tr>
      <tr class="grand"><td>Total</td><td>${formatMoney(budget.total, currency)}</td></tr>
    </table>
  </div>

  <div class="signatures">
    <div class="signature"><strong>${escapeHtml(company.name)}</strong><br /><span class="muted">Firma autorizada</span></div>
    <div class="signature"><strong>Aceptado por el cliente</strong><br /><span class="muted">Nombre, firma y fecha</span></div>
  </div>

  <div class="footer">
    <span>Cotización ${escapeHtml(budget.budget_number)} · ${escapeHtml(company.name)}</span>
    <span>Generado con Leuret</span>
  </div>
</div>
</body>
</html>`;
}

export async function shareBudgetPdf({
  company,
  budget,
}: BudgetPdfInput): Promise<{
  uri: string | null;
  error: string | null;
}> {
  return exportHtmlDocument({
    html: buildBudgetHtml({ company, budget }),
    title: `Cotización ${budget.budget_number}`,
    dialogTitle: `Compartir ${budget.budget_number}`,
  });
}
