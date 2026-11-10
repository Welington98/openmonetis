import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Suíte de integração: roda contra um PostgreSQL temporário, criado e
 * destruído pelo `global-setup`. O schema é aplicado com `drizzle-kit push`,
 * que é o mesmo caminho usado em produção (`docker-entrypoint.sh`).
 *
 * Requer um PostgreSQL acessível. Por padrão usa o `pnpm docker:db` local;
 * defina `TEST_DATABASE_URL` (banco de manutenção, normalmente `postgres`)
 * para apontar para outro servidor de teste.
 */
export default defineConfig({
	test: {
		include: ["src/test/integration/**/*.integration.test.ts"],
		environment: "node",
		globalSetup: ["src/test/integration/global-setup.ts"],
		setupFiles: ["src/test/integration/setup.ts"],
		// Todos os arquivos compartilham o mesmo banco temporário e cada teste
		// limpa as tabelas: execução sequencial evita corrida entre arquivos.
		fileParallelism: false,
		testTimeout: 30_000,
		hookTimeout: 120_000,
	},
	resolve: {
		alias: [
			// Server Actions revalidam cache do Next; fora de uma requisição o
			// `revalidatePath` lança. Na integração ele vira no-op.
			{
				find: /^next\/cache$/,
				replacement: path.resolve(
					__dirname,
					"src/test/integration/stubs/next-cache.ts",
				),
			},
			{ find: "@", replacement: path.resolve(__dirname, "./src") },
		],
	},
});
