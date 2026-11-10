import { readFileSync } from "node:fs";
import {
	TEST_DATABASE_PREFIX,
	type TestDatabaseState,
	testDatabaseStateFile,
} from "./test-database";

/**
 * Executado antes de cada arquivo de teste da suíte de integração.
 *
 * A URL do banco temporário vem do `global-setup` (que também a passa por
 * `process.env`). O arquivo de estado é o fallback quando os workers não
 * herdam o ambiente do processo principal.
 */
Object.assign(process.env, { NODE_ENV: "test" });
process.env.BETTER_AUTH_SECRET ||= "integration-test-secret";
// Sem chave, o envio automático de e-mail por pagador é ignorado.
process.env.RESEND_API_KEY = "";

if (!process.env.DATABASE_URL?.includes(TEST_DATABASE_PREFIX)) {
	const state = JSON.parse(
		readFileSync(testDatabaseStateFile, "utf8"),
	) as TestDatabaseState;

	process.env.DATABASE_URL = state.url;
}

if (!process.env.DATABASE_URL?.includes(TEST_DATABASE_PREFIX)) {
	throw new Error(
		"Teste de integração sem banco temporário: DATABASE_URL não aponta para " +
			`um banco com prefixo "${TEST_DATABASE_PREFIX}". Rode via \`pnpm test:integration\`.`,
	);
}
