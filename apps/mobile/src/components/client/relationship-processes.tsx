import { Ionicons } from "@expo/vector-icons";
import { Link, type Href } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radius } from "@/constants/theme";
import { getBudgetStatusLabel, type BudgetStatus } from "@/types/budget";
import { getInvoiceStatusLabel, type InvoiceStatus } from "@/types/invoice";
import { getProjectStatusLabel, type ProjectStatus } from "@/types/project";
import type { RelationshipProcess } from "@/types/relationship-process";
import { clientBudgetState } from "@/utils/client-portal";
import { formatMoney, formatShortDate } from "@/utils/format";

const groups = {
  project: { label: "Proyectos", icon: "construct-outline" },
  budget: { label: "Presupuestos", icon: "document-text-outline" },
  invoice: { label: "Facturas", icon: "receipt-outline" },
  payment: { label: "Pagos y recibos", icon: "wallet-outline" },
  credit_note: { label: "Notas de crédito", icon: "document-outline" },
  activity: { label: "Visitas y agenda", icon: "calendar-outline" },
  task: { label: "Tareas de obra", icon: "list-outline" },
} as const satisfies Record<RelationshipProcess["kind"], { label: string; icon: React.ComponentProps<typeof Ionicons>["name"] }>;

const activityStatuses: Record<string, string> = {
  scheduled: "Programada", confirmed: "Confirmada", completed: "Completada", cancelled: "Cancelada",
};
const taskStatuses: Record<string, string> = {
  todo: "Pendiente", in_progress: "En curso", review: "En revisión", completed: "Completada",
};

function statusLabel(item: RelationshipProcess, isClient: boolean) {
  switch (item.kind) {
    case "project": return getProjectStatusLabel(item.status as ProjectStatus);
    case "budget": return isClient ? clientBudgetState(item.status as BudgetStatus, item.valid_until).label : getBudgetStatusLabel(item.status as BudgetStatus);
    case "invoice": return getInvoiceStatusLabel(item.status as InvoiceStatus);
    case "payment": return item.status === "reversed" ? "Revertido" : "Confirmado";
    case "credit_note": return item.status === "cancelled" ? "Anulada" : "Emitida";
    case "activity": return activityStatuses[item.status];
    case "task": return taskStatuses[item.status];
  }
}

function detailRoute(item: RelationshipProcess, isClient: boolean): Href | undefined {
  switch (item.kind) {
    case "project": return { pathname: isClient ? "/cliente-proyectos/[id]" : "/proyectos/[id]", params: { id: item.id } };
    case "budget": return { pathname: isClient ? "/cliente-presupuestos/[id]" : "/presupuestos/[id]", params: { id: item.id } };
    case "invoice":
    case "payment":
    case "credit_note": {
      const id = item.parent_id ?? item.id;
      return { pathname: isClient ? "/cliente-facturas/[id]" : "/facturas/[id]", params: { id } };
    }
    case "activity": return isClient
      ? item.parent_id ? { pathname: "/cliente-proyectos/[id]", params: { id: item.parent_id } } : undefined
      : { pathname: "/agenda/[id]", params: { id: item.id } };
    case "task": return item.parent_id ? { pathname: "/proyectos/[id]", params: { id: item.parent_id } } : undefined;
  }
}

export function RelationshipProcesses({ processes, isClient, includeProjects = true }: {
  processes: RelationshipProcess[];
  isClient: boolean;
  includeProjects?: boolean;
}) {
  const entries = (Object.keys(groups) as Array<RelationshipProcess["kind"]>)
    .filter((kind) => includeProjects || kind !== "project")
    .map((kind) => ({ kind, items: processes.filter((process) => process.kind === kind) }))
    .filter(({ items }) => items.length > 0);

  return (
    <View style={styles.sections}>
      <Text style={styles.heading}>Procesos</Text>
      {entries.length === 0 ? (
        <View style={styles.section}><Text style={styles.meta}>Aún no hay registros en estas secciones.</Text></View>
      ) : null}
      {entries.map(({ kind, items }) => (
        <ProcessGroup key={kind} group={groups[kind]} items={items} isClient={isClient} />
      ))}
    </View>
  );
}

function ProcessGroup({ group, items, isClient }: {
  group: (typeof groups)[keyof typeof groups];
  items: RelationshipProcess[];
  isClient: boolean;
}) {
  const [visibleCount, setVisibleCount] = useState(8);

  return (
    <View style={styles.section}>
      <View style={styles.headingRow}>
        <Ionicons name={group.icon} size={20} color={colors.primary} />
        <Text style={styles.groupTitle}>{group.label}</Text>
        <Text style={styles.meta}>{items.length}</Text>
      </View>
      {items.slice(0, visibleCount).map((item) => {
        const route = detailRoute(item, isClient);
        const date = item.date ? formatShortDate(item.date, "America/Panama") : null;
        const meta = [item.detail, date, statusLabel(item, isClient),
          item.amount === null ? null : formatMoney(item.amount, item.currency_code ?? undefined)].filter(Boolean).join(" · ");
        const body = (
          <>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>{item.title}</Text>
              {meta ? <Text style={styles.meta}>{meta}</Text> : null}
            </View>
            {route ? <Ionicons name="chevron-forward" size={17} color={colors.textSecondary} /> : null}
          </>
        );
        return route ? (
          <Link key={item.id} href={route} asChild>
            <Pressable style={({ pressed }) => [styles.row, pressed && { opacity: 0.65 }]}>{body}</Pressable>
          </Link>
        ) : <View key={item.id} style={styles.row}>{body}</View>;
      })}
      {items.length > visibleCount ? (
        <Pressable accessibilityRole="button" style={styles.more} onPress={() => setVisibleCount((count) => count + 20)}>
          <Text style={styles.moreText}>Ver más</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sections: { gap: 12 },
  heading: { fontSize: 18, fontWeight: "900", color: colors.text },
  section: { padding: 14, gap: 2, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  headingRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingBottom: 8 },
  groupTitle: { color: colors.text, fontSize: 15, fontWeight: "900", flex: 1 },
  row: { flexDirection: "row", alignItems: "center", minHeight: 49, gap: 8, paddingVertical: 8, borderTopWidth: 1, borderColor: colors.divider },
  rowCopy: { flex: 1, gap: 3 },
  rowTitle: { color: colors.text, fontSize: 14, fontWeight: "800" },
  meta: { color: colors.textSecondary, fontSize: 12 },
  more: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start", paddingHorizontal: 4 },
  moreText: { color: colors.primary, fontWeight: "800" },
});
