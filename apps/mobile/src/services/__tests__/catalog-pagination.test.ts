import { describe, expect, it, vi } from "vitest";
import { fetchAllCatalogPages } from "../catalog-pagination";

describe("fetchAllCatalogPages", () => {
  it("carga todos los registros usando páginas de 100", async () => {
    const records = Array.from({ length: 235 }, (_, i) => ({ id: i + 1 }));
    const fetchPage = vi.fn(async (page: number, limit: number) => ({
      items: records.slice((page - 1) * limit, page * limit),
      pagination: { page, limit, totalItems: records.length, totalPages: 3 }
    }));

    const result = await fetchAllCatalogPages(fetchPage);

    expect(result).toEqual(records);
    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(fetchPage).toHaveBeenNthCalledWith(1, 1, 100);
    expect(fetchPage).toHaveBeenNthCalledWith(2, 2, 100);
    expect(fetchPage).toHaveBeenNthCalledWith(3, 3, 100);
  });

  it("admite un catálogo vacío", async () => {
    const fetchPage = vi.fn(async (page: number, limit: number) => ({
      items: [] as number[],
      pagination: { page, limit, totalItems: 0, totalPages: 0 }
    }));

    expect(await fetchAllCatalogPages(fetchPage)).toEqual([]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("no devuelve datos parciales cuando falla una página", async () => {
    const fetchPage = vi.fn(async (page: number, limit: number) => {
      if (page === 2) throw new Error("Sin conexión");
      return {
        items: [page],
        pagination: { page, limit, totalItems: 300, totalPages: 3 }
      };
    });

    await expect(fetchAllCatalogPages(fetchPage)).rejects.toThrow("Sin conexión");
  });

  it("rechaza páginas que no corresponden a la solicitada", async () => {
    const fetchPage = vi.fn(async (page: number, limit: number) => ({
      items: [page],
      pagination: { page: 1, limit, totalItems: 200, totalPages: 2 }
    }));

    await expect(fetchAllCatalogPages(fetchPage)).rejects.toThrow("página de catálogo inválida");
  });
});
