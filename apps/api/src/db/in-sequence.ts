/**
 * Ejecuta consultas una tras otra sobre la misma conexión.
 *
 * `Promise.all([client.query(...), client.query(...)])` con un solo cliente de
 * pg no corre en paralelo (pg las encola) y pg@9 lo prohíbe. Esto conserva la
 * misma forma de uso y los tipos de cada resultado.
 */
export async function inSequence<T extends readonly unknown[] | []>(
  tasks: { readonly [K in keyof T]: () => Promise<T[K]> }
): Promise<{ -readonly [K in keyof T]: T[K] }> {
  const results: unknown[] = [];
  for (const task of tasks as readonly (() => Promise<unknown>)[]) results.push(await task());
  return results as { -readonly [K in keyof T]: T[K] };
}
