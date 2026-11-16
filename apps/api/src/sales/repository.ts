import { withUserTransaction } from "../db/with-user-transaction.js";

type PerformanceRow = {
  user_id: string;
  display_name: string;
  member_active: boolean;
  month: number;
  quoted_count: number;
  quoted_total: string;
  approved_count: number;
  approved_total: string;
  invoiced_count: number;
  invoiced_total: string;
  collected_total: string;
};

export type SalesFigures = {
  quotedCount: number;
  quotedTotal: number;
  approvedCount: number;
  approvedTotal: number;
  invoicedCount: number;
  invoicedTotal: number;
  collectedTotal: number;
};

export type SalesPersonPerformance = {
  userId: string;
  name: string;
  active: boolean;
  months: (SalesFigures & { month: number })[];
  totals: SalesFigures;
  previousYearTotals: SalesFigures;
};

const emptyFigures = (): SalesFigures => ({
  quotedCount: 0,
  quotedTotal: 0,
  approvedCount: 0,
  approvedTotal: 0,
  invoicedCount: 0,
  invoicedTotal: 0,
  collectedTotal: 0
});

const round = (value: number) => Math.round(value * 100) / 100;

function figures(row: PerformanceRow): SalesFigures {
  return {
    quotedCount: Number(row.quoted_count),
    quotedTotal: Number(row.quoted_total),
    approvedCount: Number(row.approved_count),
    approvedTotal: Number(row.approved_total),
    invoicedCount: Number(row.invoiced_count),
    invoicedTotal: Number(row.invoiced_total),
    collectedTotal: Number(row.collected_total)
  };
}

function add(total: SalesFigures, value: SalesFigures): SalesFigures {
  return {
    quotedCount: total.quotedCount + value.quotedCount,
    quotedTotal: round(total.quotedTotal + value.quotedTotal),
    approvedCount: total.approvedCount + value.approvedCount,
    approvedTotal: round(total.approvedTotal + value.approvedTotal),
    invoicedCount: total.invoicedCount + value.invoicedCount,
    invoicedTotal: round(total.invoicedTotal + value.invoicedTotal),
    collectedTotal: round(total.collectedTotal + value.collectedTotal)
  };
}

/**
 * Informe de ventas por persona (public.company_sales_performance): el año pedido
 * mes a mes y el total del año anterior para comparar. La función decide quién
 * ve a quién (ventas solo a sí misma).
 */
export async function getSalesPerformanceRepo(
  userId: string,
  companyId: string,
  year: number,
  targetUserId: string | null
): Promise<SalesPersonPerformance[]> {
  return withUserTransaction(userId, async (client) => {
    const current = await client.query<PerformanceRow>(
      "SELECT * FROM public.company_sales_performance($1, $2, $3)",
      [companyId, year, targetUserId]
    );
    const previous = await client.query<PerformanceRow>(
      "SELECT * FROM public.company_sales_performance($1, $2, $3)",
      [companyId, year - 1, targetUserId]
    );

    const people = new Map<string, SalesPersonPerformance>();
    for (const row of current.rows) {
      let person = people.get(row.user_id);
      if (!person) {
        person = {
          userId: row.user_id,
          name: row.display_name,
          active: row.member_active,
          months: [],
          totals: emptyFigures(),
          previousYearTotals: emptyFigures()
        };
        people.set(row.user_id, person);
      }
      const value = figures(row);
      person.months.push({ month: Number(row.month), ...value });
      person.totals = add(person.totals, value);
    }
    for (const row of previous.rows) {
      const person = people.get(row.user_id);
      if (person) person.previousYearTotals = add(person.previousYearTotals, figures(row));
    }
    return [...people.values()];
  });
}
