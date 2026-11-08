import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const query = vi.fn();
  return {
    revokeAllUserSessions: vi.fn(),
    query,
    client: { query }
  };
});

vi.mock("../../db/with-user-transaction.js", () => ({
  withUserTransaction: vi.fn(
    async (_userId: string, operation: (databaseClient: typeof mocks.client) => Promise<unknown>) =>
      operation(mocks.client)
  )
}));

vi.mock("../../auth/repository.js", () => ({
  revokeAllUserSessions: mocks.revokeAllUserSessions
}));

import { updateAdminUserRepo } from "../repository.js";

const baseInput = {
  fullName: "Usuario de prueba",
  phone: "60000000",
  role: "contractor" as const,
  active: true
};

describe("updateAdminUserRepo", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.revokeAllUserSessions.mockReset();
    mocks.query.mockResolvedValue({ rowCount: 1, rows: [{ id: "target-user" }] });
  });

  it("revoca todas las sesiones dentro de la misma transacción al suspender", async () => {
    const updated = await updateAdminUserRepo(
      "admin-user",
      "target-user",
      { ...baseInput, active: false }
    );

    expect(updated).toBe(true);
    expect(mocks.revokeAllUserSessions).toHaveBeenCalledOnce();
    expect(mocks.revokeAllUserSessions).toHaveBeenCalledWith(mocks.client, "target-user");
  });

  it("conserva las sesiones al actualizar un usuario activo", async () => {
    await updateAdminUserRepo("admin-user", "target-user", baseInput);

    expect(mocks.revokeAllUserSessions).not.toHaveBeenCalled();
  });
});
