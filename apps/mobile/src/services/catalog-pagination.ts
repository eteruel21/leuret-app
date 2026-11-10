/** Carga todas las páginas del catálogo sin lanzar solicitudes ilimitadas. */
export type CatalogPage<T> = {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
};

const PAGE_SIZE = 100; // Máximo aceptado por la API.
const MAX_CONCURRENT_REQUESTS = 3;

export async function fetchAllCatalogPages<T>(
  fetchPage: (page: number, limit: number) => Promise<CatalogPage<T>>
): Promise<T[]> {
  const first = await fetchPage(1, PAGE_SIZE);

  if (
    !Array.isArray(first?.items) ||
    !first.pagination ||
    first.pagination.page !== 1 ||
    !Number.isInteger(first.pagination.totalPages) ||
    first.pagination.totalPages < 0
  ) {
    throw new Error("La API devolvió una paginación de catálogo inválida.");
  }

  const allItems = [...first.items];

  for (
    let start = 2;
    start <= first.pagination.totalPages;
    start += MAX_CONCURRENT_REQUESTS
  ) {
    const pages = Array.from(
      {
        length: Math.min(
          MAX_CONCURRENT_REQUESTS,
          first.pagination.totalPages - start + 1
        )
      },
      (_, index) => start + index
    );

    const results = await Promise.all(
      pages.map((page) => fetchPage(page, PAGE_SIZE))
    );

    results.forEach((result, index) => {
      if (
        !Array.isArray(result?.items) ||
        result.pagination?.page !== pages[index]
      ) {
        throw new Error("La API devolvió una página de catálogo inválida.");
      }
      allItems.push(...result.items);
    });
  }

  return allItems;
}
