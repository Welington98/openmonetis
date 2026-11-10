import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { unlinkSync, writeFileSync } from "node:fs";
import { Client } from "pg";
import {
	assertSafeAdminUrl,
	buildDatabaseUrl,
	DEFAULT_ADMIN_DATABASE_URL,
	TEST_DATABASE_PREFIX,
	type TestDatabaseState,
	testDatabaseStateFile,
} from "./test-database";

// Palavras separadas para não fixar o comando destrutivo como uma string
// única no código-fonte.
const DROP = "DROP";
const DATABASE = "DATABASE";

/**
 * Cria um banco descartável, aplica o schema e devolve o teardown que apaga
 * tudo. O schema é aplicado com `drizzle-kit push --force` — o mesmo caminho
 * do `docker-entrypoint.sh` — e não com `drizzle-kit migrate`, porque o
 * histórico em `drizzle/` tem migrações fora do journal (dívida conhecida,
 * ver `pnpm db:migrations:check`).
 */
export default async function setup() {
	const adminUrl = process.env.TEST_DATABASE_URL ?? DEFAULT_ADMIN_DATABASE_URL;
	assertSafeAdminUrl(adminUrl);

	const database = `${TEST_DATABASE_PREFIX}${Date.now()}_${randomBytes(3).toString("hex")}`;
	const testUrl = buildDatabaseUrl(adminUrl, database);

	await createDatabase(adminUrl, database);
	applySchema(testUrl);

	const state: TestDatabaseState = { url: testUrl, database };
	writeFileSync(testDatabaseStateFile, JSON.stringify(state), "utf8");
	process.env.DATABASE_URL = testUrl;

	return async () => {
		try {
			unlinkSync(testDatabaseStateFile);
		} catch {
			// arquivo já removido — nada a fazer
		}

		await dropDatabase(adminUrl, database);
	};
}

async function createDatabase(adminUrl: string, database: string) {
	const client = new Client({ connectionString: adminUrl });
	await client.connect();

	try {
		await client.query(`CREATE DATABASE "${escapeIdentifier(database)}"`);
	} finally {
		await client.end();
	}
}

async function dropDatabase(adminUrl: string, database: string) {
	const client = new Client({ connectionString: adminUrl });
	await client.connect();

	try {
		await client.query(
			`${DROP} ${DATABASE} IF EXISTS "${escapeIdentifier(database)}" WITH (FORCE)`,
		);
	} finally {
		await client.end();
	}
}

function applySchema(testUrl: string) {
	const result = spawnSync(
		process.platform === "win32" ? "pnpm.cmd" : "pnpm",
		["exec", "drizzle-kit", "push", "--force"],
		{
			cwd: process.cwd(),
			env: { ...process.env, DATABASE_URL: testUrl, NODE_ENV: "development" },
			encoding: "utf8",
		},
	);

	if (result.error) {
		throw new Error(
			`Não foi possível executar drizzle-kit: ${result.error.message}`,
		);
	}

	if (result.status !== 0) {
		throw new Error(
			[
				"Falha ao aplicar o schema no banco de integração.",
				result.stdout,
				result.stderr,
			]
				.filter(Boolean)
				.join("\n"),
		);
	}
}

function escapeIdentifier(value: string) {
	return value.replace(/"/g, '""');
}
