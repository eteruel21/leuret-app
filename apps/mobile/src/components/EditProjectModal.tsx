import { useEffect, useState } from "react";

import { FormSheet, SheetChoice, SheetField, isDateKey, parseDecimal } from "@/components/FormSheet";
import { getClientById } from "@/services/client-service";
import { updateProject } from "@/services/project-service";
import type { ClientAddress } from "@/types/client";
import type { ProjectWithDetails } from "@/types/project";

type EditProjectModalProps = {
  visible: boolean;
  companyId: string;
  project: ProjectWithDetails;
  /** El rol ve y puede cambiar el estimado inicial. */
  canEditFinancials: boolean;
  onClose: () => void;
  onSaved: (project: ProjectWithDetails) => void;
};

/** Corrige nombre, descripción, dirección, fechas y estimado de una obra. */
export function EditProjectModal({
  visible,
  companyId,
  project,
  canEditFinancials,
  onClose,
  onSaved,
}: EditProjectModalProps) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [startDate, setStartDate] = useState(project.start_date?.slice(0, 10) ?? "");
  const [endDate, setEndDate] = useState(project.estimated_end_date?.slice(0, 10) ?? "");
  const [estimate, setEstimate] = useState(project.budget_estimate ? String(project.budget_estimate) : "");
  const [addressId, setAddressId] = useState(project.address_id ?? "");
  const [addresses, setAddresses] = useState<ClientAddress[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setName(project.name);
    setDescription(project.description ?? "");
    setStartDate(project.start_date?.slice(0, 10) ?? "");
    setEndDate(project.estimated_end_date?.slice(0, 10) ?? "");
    setEstimate(project.budget_estimate ? String(project.budget_estimate) : "");
    setAddressId(project.address_id ?? "");
    setError(null);

    let active = true;
    void getClientById(companyId, project.client_id).then(({ client }) => {
      if (active) setAddresses(client?.addresses ?? []);
    });
    return () => {
      active = false;
    };
  }, [visible, companyId, project]);

  async function handleSave() {
    const cleanName = name.trim();
    if (cleanName.length < 2) {
      setError("Escribe el nombre de la obra.");
      return;
    }
    const start = startDate.trim();
    const end = endDate.trim();
    if ((start && !isDateKey(start)) || (end && !isDateKey(end))) {
      setError("Usa fechas con formato AAAA-MM-DD, por ejemplo 2026-12-01.");
      return;
    }
    if (start && end && end < start) {
      setError("La fecha estimada de fin no puede ser anterior al inicio.");
      return;
    }
    const estimateValue = estimate.trim() ? parseDecimal(estimate) : 0;
    if (canEditFinancials && (!Number.isFinite(estimateValue) || estimateValue < 0)) {
      setError("El estimado debe ser un monto válido.");
      return;
    }

    setSaving(true);
    setError(null);
    const result = await updateProject({
      companyId,
      projectId: project.id,
      name: cleanName,
      description: description.trim(),
      addressId: addressId || null,
      startDate: start || null,
      estimatedEndDate: end || null,
      ...(canEditFinancials ? { budgetEstimate: Math.round(estimateValue * 100) / 100 } : {}),
    });
    setSaving(false);

    if (result.error || !result.project) {
      setError(result.error ?? "No se pudo guardar la obra.");
      return;
    }
    onSaved(result.project);
  }

  return (
    <FormSheet
      visible={visible}
      title="Editar obra"
      onClose={onClose}
      onSave={() => void handleSave()}
      submitting={saving}
      error={error}
    >
      <SheetField label="Nombre *" value={name} onChangeText={setName} placeholder="Nombre de la obra" maxLength={250} />
      <SheetField
        label="Descripción"
        value={description}
        onChangeText={setDescription}
        placeholder="Alcance, notas para el equipo…"
        multiline
        maxLength={3000}
      />
      {addresses.length > 0 ? (
        <SheetChoice
          label="Dirección de la obra"
          options={[
            { value: "", label: "Sin dirección" },
            ...addresses.map((address) => ({
              value: address.id,
              label: address.label ? `${address.label}: ${address.address}` : address.address,
            })),
          ]}
          value={addressId}
          onChange={setAddressId}
        />
      ) : null}
      <SheetField
        label="Fecha de inicio"
        value={startDate}
        onChangeText={setStartDate}
        placeholder="AAAA-MM-DD"
        helper="Se llena sola al pasar la obra a «En progreso»."
      />
      <SheetField
        label="Fin estimado"
        value={endDate}
        onChangeText={setEndDate}
        placeholder="AAAA-MM-DD"
        helper="Lo ve el cliente en su portal."
      />
      {canEditFinancials ? (
        <SheetField
          label="Estimado inicial"
          value={estimate}
          onChangeText={setEstimate}
          placeholder="0.00"
          keyboardType="decimal-pad"
          helper="El valor contratado se toma del presupuesto aprobado."
        />
      ) : null}
    </FormSheet>
  );
}
