import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.fn();
const release = vi.fn();

vi.mock("../pool.js", () => ({
  pool: {
    connect: vi.fn(async () => ({ query, release }))
  }
}));

import { withUserTransaction } from "../with-user-transaction.js";

describe("withUserTransaction", () => {
  beforeEach(() => {
    query.mockReset();
    release.mockReset();
  });

  it("revierte y libera la conexión cuando la autorización falla", async () => {
    query.mockResolvedValue({ rows: [] });

    await expect(
      withUserTransaction("00000000-0000-0000-0000-000000000001", async () => {
        throw new Error("authorization query failed");
      })
    ).rejects.toThrow("authorization query failed");

    expect(query.mock.calls.map(([sql]) => String(sql).trim())).toEqual([
      "BEGIN",
      expect.stringContaining("SELECT set_config"),
      "ROLLBACK"
    ]);
    expect(release).toHaveBeenCalledOnce();
  });
});
