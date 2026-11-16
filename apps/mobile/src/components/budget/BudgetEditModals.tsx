import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";

import { FormSheet, SheetChoice, SheetField, parseDecimal } from "@/components/FormSheet";
import { colors } from "@/constants/theme";
import {
  approveBudget,
  rejectBudget,
  updateBudgetDetails,
  updateBudgetItem,
} from "@/services/budget-service";
import type { BudgetDiscountType, BudgetItem, BudgetWithDetails } from "@/types/budget";
import { formatMoney } from "@/types/budget";

const roundMoney = (value: number) => Math.round(value * 100) / 100;

/* ------------------------------------------------------------ Partida */

type EditItemProps = {
  visible: boolean;
  companyId: string;
  budgetId: string;
  item: BudgetItem | null;
  currencyCode: string;
  onClose: () => void;
  onSaved: () => void;
};

/** Edita una partida de un borrador sin tener que borrarla y crearla otra vez. */
export function EditBudgetItemModal({ visible, companyId, budgetId, item, currencyCode, onClose, onSaved }: EditItemProps) {
  const [description, setDescription] = useState("");
  const [unitName, setUnitName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [taxable, setTaxable] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !item) return;
    setDescription(item.description);
    setUnitName(item.unit_name);
    setQuantity(String(item.quantity));
    setUnitPrice(String(item.unit_price));
    setUnitCost(String(item.unit_cost));
    setTaxable(item.taxable);
    setError(null);
  }, [visible, item]);

  const quantityValue = parseDecimal(quantity);
  const priceValue = parseDecimal(unitPrice);
  const preview =
    Number.isFinite(quantityValue) && Number.isFinite(priceValue)
      ? roundMoney(quantityValue * priceValue * (1 - (item?.discount_percentage ?? 0) / 100))
      : null;

  async function handleSave() {
    if (!item) return;
    const costValue = unitCost.trim() ? parseDecimal(unitCost) : 0;
    if (description.trim().length < 2) {
      setError("Escribe la descripción de la partida.");
      return;
    }
    if (!unitName.trim()) {
      setError("Indica la unidad (m², und., saco…).");
      return;
    }
    if (!Number.isFinite(quantityValue) || quantityValue <= 0) {
      setError("La cantidad debe ser mayor que cero.");
      return;
    }
    if (!Number.isFinite(priceValue) || priceValue < 0 || !Number.isFinite(costValue) || costValue < 0) {
      setError("Revisa el precio y el costo: deben ser montos válidos.");
      return;
    }

    setSaving(true);
    setError(null);
    const result = await updateBudgetItem({
      companyId,
      budgetId,
      itemId: item.id,
      description: description.trim(),
      unitName: unitName.trim(),
      quantity: Math.round(quantityValue * 10_000) / 10_000,
      unitPrice: roundMoney(priceValue),
      unitCost: roundMoney(costValue),
      taxable,
    });
    setSaving(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    onSaved();
  }

  return (
    <FormSheet visible={visible} title="Editar partida" onClose={onClose} onSave={() => void handleSave()} submitting={saving} error={error}>
      <SheetField label="Descripción *" value={description} onChangeText={setDescription} multiline maxLength={1000} />
      <SheetField label="Unidad *" value={unitName} onChangeText={setUnitName} placeholder="m², und., saco" maxLength={100} />
      <SheetField label="Cantidad *" value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" />
      <SheetField label="Precio unitario de venta *" value={unitPrice} onChangeText={setUnitPrice} keyboardType="decimal-pad" />
      <SheetField
        label="Costo unitario"
        value={unitCost}
        onChangeText={setUnitCost}
        keyboardType="decimal-pad"
        helper="Lo que te cuesta a ti. No aparece en el PDF del cliente."
      />
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Lleva ITBMS</Text>
        <Switch value={taxable} onValueChange={setTaxable} />
      </View>
      {preview !== null ? (
        <Text style={styles.preview}>Importe de la partida: {formatMoney(preview, currencyCode)}</Text>
      ) : null}
    </FormSheet>
  );
}

/* ------------------------------------------------------------ Datos */

type EditDetailsProps = {
  visible: boolean;
  companyId: string;
  budget: BudgetWithDetails;
  onClose: () => void;
  onSaved: () => void;
};

const DISCOUNT_OPTIONS: { value: BudgetDiscountType; label: string }[] = [
  { value: "none", label: "Sin descuento" },
  { value: "percent", label: "Porcentaje" },
  { value: "fixed", label: "Monto fijo" },
];

/** Título, descuento, ITBMS, condiciones y notas de un borrador. */
export function EditBudgetDetailsModal({ visible, companyId, budget, onClose, onSaved }: EditDetailsProps) {
  const [title, setTitle] = useState(budget.title);
  const [discountType, setDiscountType] = useState<BudgetDiscountType>(budget.discount_type);
  const [discountValue, setDiscountValue] = useState(budget.discount_value ? String(budget.discount_value) : "");
  const [taxRate, setTaxRate] = useState(String(budget.tax_rate));
  const [terms, setTerms] = useState(budget.terms ?? "");
  const [notes, setNotes] = useState(budget.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setTitle(budget.title);
    setDiscountType(budget.discount_type);
    setDiscountValue(budget.discount_value ? String(budget.discount_value) : "");
    setTaxRate(String(budget.tax_rate));
    setTerms(budget.terms ?? "");
    setNotes(budget.notes ?? "");
    setError(null);
  }, [visible, budget]);

  async function handleSave() {
    const cleanTitle = title.trim();
    const discount = discountType === "none" ? 0 : parseDecimal(discountValue);
    const tax = parseDecimal(taxRate);

    if (cleanTitle.length < 2) {
      setError("Escribe el título del presupuesto.");
      return;
    }
    if (!Number.isFinite(discount) || discount < 0 || (discountType === "percent" && discount > 100)) {
      setError(discountType === "percent" ? "El descuento debe estar entre 0 y 100 %." : "El descuento debe ser un monto válido.");
      return;
    }
    if (!Number.isFinite(tax) || tax < 0 || tax > 100) {
      setError("El ITBMS debe estar entre 0 y 100 % (en Panamá, 7 %).");
      return;
    }

    setSaving(true);
    setError(null);
    const result = await updateBudgetDetails({
      companyId,
      budgetId: budget.id,
      title: cleanTitle,
      discountType,
      discountValue: roundMoney(discount),
      taxRate: roundMoney(tax),
      terms: terms.trim(),
      notes: notes.trim(),
    });
    setSaving(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    onSaved();
  }

  return (
    <FormSheet visible={visible} title="Datos del presupuesto" onClose={onClose} onSave={() => void handleSave()} submitting={saving} error={error}>
      <SheetField label="Título *" value={title} onChangeText={setTitle} maxLength={250} />
      <SheetChoice label="Descuento" options={DISCOUNT_OPTIONS} value={discountType} onChange={setDiscountType} />
      {discountType !== "none" ? (
        <SheetField
          label={discountType === "percent" ? "Descuento (%)" : `Descuento (${budget.currency_code})`}
          value={discountValue}
          onChangeText={setDiscountValue}
          keyboardType="decimal-pad"
          helper="Se reparte sobre las partidas gravables antes de calcular el ITBMS."
        />
      ) : null}
      <SheetField label="ITBMS (%)" value={taxRate} onChangeText={setTaxRate} keyboardType="decimal-pad" helper="7 % es la tasa general en Panamá." />
      <SheetField
        label="Condiciones"
        value={terms}
        onChangeText={setTerms}
        multiline
        maxLength={5000}
        placeholder="Forma de pago, plazo de ejecución, garantía…"
        helper="Aparecen en el PDF de la cotización."
      />
      <SheetField label="Notas internas" value={notes} onChangeText={setNotes} multiline maxLength={5000} placeholder="Solo para tu equipo" />
    </FormSheet>
  );
}

/* ------------------------------------------------------------ Respuesta del cliente */

type ResponseProps = {
  visible: boolean;
  companyId: string;
  budget: BudgetWithDetails;
  onClose: () => void;
  onSaved: () => void;
};

/**
 * El equipo registra lo que respondió el cliente fuera de Leuret (en persona,
 * por WhatsApp o correo). Sin esto, un cliente sin cuenta nunca llegaba a
 * «Aprobado» y no se podía facturar el presupuesto.
 */
export function ClientResponseModal({ visible, companyId, budget, onClose, onSaved }: ResponseProps) {
  const [decision, setDecision] = useState<"approved" | "rejected">("approved");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setDecision("approved");
    setReason("");
    setError(null);
  }, [visible]);

  async function handleSave() {
    const cleanReason = reason.trim();
    if (decision === "rejected" && cleanReason.length < 2) {
      setError("Escribe el motivo que dio el cliente.");
      return;
    }

    setSaving(true);
    setError(null);
    const result =
      decision === "approved"
        ? await approveBudget(budget.id, companyId)
        : await rejectBudget(budget.id, cleanReason, companyId);
    setSaving(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    onSaved();
  }

  return (
    <FormSheet
      visible={visible}
      title="Respuesta del cliente"
      onClose={onClose}
      onSave={() => void handleSave()}
      submitting={saving}
      saveLabel="Registrar"
      error={error}
    >
      <Text style={styles.intro}>
        {budget.client?.user_id
          ? "Tu cliente puede responder desde su portal. Registra aquí su respuesta si te la dio en persona o por mensaje."
          : "Tu cliente no tiene cuenta en Leuret. Registra aquí lo que respondió para continuar con la obra y la factura."}
      </Text>
      <View style={styles.decisions}>
        {(
          [
            { value: "approved", label: "Aprobó", detail: `Total ${formatMoney(budget.total, budget.currency_code)}` },
            { value: "rejected", label: "Rechazó", detail: "Podrás editarlo y reenviarlo" },
          ] as const
        ).map((option) => {
          const selected = decision === option.value;
          return (
            <Pressable
              key={option.value}
              onPress={() => setDecision(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={[styles.decision, selected && styles.decisionSelected]}
            >
              <Text style={[styles.decisionLabel, selected && styles.decisionLabelSelected]}>{option.label}</Text>
              <Text style={[styles.decisionDetail, selected && styles.decisionLabelSelected]}>{option.detail}</Text>
            </Pressable>
          );
        })}
      </View>
      {decision === "rejected" ? (
        <SheetField label="Motivo *" value={reason} onChangeText={setReason} multiline maxLength={1000} placeholder="Ej. El precio supera su presupuesto" />
      ) : (
        <Text style={styles.helper}>La obra pasa a «Aprobado» y toma el valor del presupuesto. Después podrás generar la factura.</Text>
      )}
    </FormSheet>
  );
}

const styles = StyleSheet.create({
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 15 },
  switchLabel: { color: colors.text, fontSize: 14, fontWeight: "800" },
  preview: { marginBottom: 10, color: colors.textSecondary, fontSize: 13, fontWeight: "700", textAlign: "center" },
  intro: { marginBottom: 14, color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  helper: { marginBottom: 10, color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  decisions: { flexDirection: "row", gap: 10, marginBottom: 15 },
  decision: {
    flex: 1,
    padding: 14,
    gap: 4,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  decisionSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  decisionLabel: { color: colors.text, fontSize: 15, fontWeight: "900" },
  decisionDetail: { color: colors.textSecondary, fontSize: 12, fontWeight: "700" },
  decisionLabelSelected: { color: colors.textLight },
});
