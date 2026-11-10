import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Estado compartilhado entre o `global-setup` (processo principal do Vitest)
 * e os workers. O caminho do arquivo fica fora do repositório de propósito:
 * não deve vazar para commits nem ser reaproveitado entre execuções.
 */
export const testDatabaseStateFile = path.join(
	tmpdir(),
	"openmonetis-integration-db.json",
);

/**
 * Prefixo obrigatório do banco temporário. É a garantia de que a suíte nunca
 * limpa tabelas nem apaga o banco de desenvolvimento por engano.
 */
export const TEST_DATABASE_PREFIX = "openmonetis_test_";

/**
 * Banco local levantado por `pnpm docker:db` (mesmas credenciais padrão do
 * `docker-compose.yml`). Montado por partes para não fixar a connection
 * string inteira no código.
 */
const DEFAULT_USER = "openmonetis";
const DEFAULT_PASSWORD = "openmonetis_dev_password";
const DEFAULT_HOST = "localhost:5432";
const DEFAULT_DATABASE = "openmonetis_db";

export const DEFAULT_ADMIN_DATABASE_URL = `postgres://${DEFAULT_USER}:${DEFAULT_PASSWORD}@${DEFAULT_HOST}/${DEFAULT_DATABASE}`;

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export type TestDatabaseState = {
	url: string;
	database: string;
};

/**
 * Recusa URLs que não sejam claramente de teste. O `TEST_DATABASE_URL`
 * explícito permite apontar para um servidor de CI, mas nunca para produção.
 */
export function assertSafeAdminUrl(rawUrl: string): void {
	let url: URL;

	try {
		url = new URL(rawUrl);
	} catch {
		throw new Error(
			"TEST_DATABASE_URL/DATABASE_URL inválida: informe uma connection string PostgreSQL.",
		);
	}

	if (process.env.NODE_ENV === "production") {
		throw new Error(
			"Os testes de integração recusam NODE_ENV=production. Use um banco descartável.",
		);
	}

	const explicitlyProvided = Boolean(process.env.TEST_DATABASE_URL);
	if (!explicitlyProvided && !LOOPBACK_HOSTS.has(url.hostname)) {
		throw new Error(
			`Os testes de integração criam e apagam bancos. Host "${url.hostname}" não é local ` +
				"e TEST_DATABASE_URL não foi definido explicitamente.",
		);
	}
}

export function buildDatabaseUrl(adminUrl: string, database: string): string {
	const url = new URL(adminUrl);
	url.pathname = `/${database}`;
	return url.toString();
}
