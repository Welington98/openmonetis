/**
 * Stub de `next/cache` para a suíte de integração.
 *
 * As Server Actions chamam `revalidateForEntity()`, que usa `revalidatePath`
 * e `revalidateTag`. Fora de uma requisição do Next esse código lança, e o
 * cache de página não tem significado em teste — por isso as duas funções
 * viram no-op. O alias está em `vitest.integration.config.ts`.
 */
export function revalidatePath(): void {}

export function revalidateTag(): void {}

export function unstable_cache<TArgs extends unknown[], TResult>(
	fn: (...args: TArgs) => Promise<TResult>,
): (...args: TArgs) => Promise<TResult> {
	return fn;
}
