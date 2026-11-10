#!/usr/bin/env node

/**
 * Valida o histórico de migrations do Drizzle.
 *
 * Regras garantidas neste repositório:
 *   1. O journal tem versão 7 e dialeto PostgreSQL.
 *   2. Toda entrada do journal referencia um arquivo .sql existente.
 *   3. Migrations publicadas são imutáveis: o hash de cada arquivo fica
 *      congelado em drizzle/meta/migrations.lock.json. Editar um arquivo já
 *      publicado (ou renomeá-lo) falha a validação.
 *   4. Toda migration nova (posterior a `legacyThroughTag`) é incremental:
 *      `idx` contíguo e timestamp (`when`) estritamente crescente.
 *   5. Arquivo .sql fora do journal (órfão) só é aceito se listado em
 *      `knownOrphans` — a dívida histórica está explícita, e qualquer órfão
 *      novo quebra o CI.
 *
 * O histórico atual tem dívida conhecida (migrations fora do journal, `idx`
 * com buracos e dois timestamps fora de ordem). As regras 3–5 valem a partir
 * de `legacyThroughTag`, sem reescrever o passado — quebrar esse passado
 * poderia invalidar bancos já existentes.
 *
 * Uso:
 *   node scripts/validate-migrations.mjs          # valida (CI)
 *   node scripts/validate-migrations.mjs --update # grava hashes de migrations novas
 */

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const MIGRATIONS_DIR = "drizzle";
const JOURNAL_PATH = path.join(MIGRATIONS_DIR, "meta", "_journal.json");
const LOCK_PATH = path.join(MIGRATIONS_DIR, "meta", "migrations.lock.json");
const LOCK_SCHEMA_VERSION = 1;

const args = new Set(process.argv.slice(2));
const shouldUpdate = args.has("--update");

if (args.has("--help") || args.has("-h")) {
	console.log(
		[
			"Valida o histórico de migrations do Drizzle.",
			"",
			"  node scripts/validate-migrations.mjs           valida (usado no CI)",
			"  node scripts/validate-migrations.mjs --update  grava o hash de migrations novas",
			"",
			"Migrations publicadas são imutáveis: para mudar o schema, crie uma nova",
			"migration com `pnpm db:generate` e rode `--update`.",
		].join("\n"),
	);
	process.exit(0);
}

const journal = readJson(JOURNAL_PATH);
const lock = readJson(LOCK_PATH);

if (journal.version !== "7" || journal.dialect !== "postgresql") {
	fail(
		`${JOURNAL_PATH} deve usar journal PostgreSQL versão 7 (encontrado ${journal.version}/${journal.dialect}).`,
	);
}

if (!Array.isArray(journal.entries) || journal.entries.length === 0) {
	fail(`${JOURNAL_PATH} não possui migrations.`);
}

if (lock.schemaVersion !== LOCK_SCHEMA_VERSION) {
	fail(
		`${LOCK_PATH} usa schemaVersion ${lock.schemaVersion}; esperado ${LOCK_SCHEMA_VERSION}.`,
	);
}

const sqlFiles = readdirSync(MIGRATIONS_DIR)
	.filter((file) => file.endsWith(".sql"))
	.sort();

const journalTags = journal.entries.map((entry) => entry.tag);
const journalTagSet = new Set(journalTags);
const knownOrphans = new Set(lock.knownOrphans ?? []);

for (const entry of journal.entries) {
	if (!entry.tag) {
		fail(`Entrada do journal sem "tag": ${JSON.stringify(entry)}.`);
	}

	const migrationPath = path.join(MIGRATIONS_DIR, `${entry.tag}.sql`);
	if (!existsSync(migrationPath)) {
		fail(
			`A migration ${entry.tag} está no journal, mas ${migrationPath} não existe. ` +
				"Restaure o arquivo ou remova a entrada do journal.",
		);
	}
}

const orphans = sqlFiles
	.map((file) => file.replace(/\.sql$/, ""))
	.filter((tag) => !journalTagSet.has(tag));

const unexpectedOrphans = orphans.filter((tag) => !knownOrphans.has(tag));
if (unexpectedOrphans.length > 0) {
	fail(
		[
			"Arquivo(s) de migration fora do journal:",
			...unexpectedOrphans.map((tag) => `  - ${tag}.sql`),
			"Uma migration gerada pelo drizzle-kit entra no journal automaticamente.",
			"Se o arquivo for intencional, adicione-o ao histórico com `pnpm db:generate`",
			"ou registre em `knownOrphans` (dívida histórica) em " + LOCK_PATH + ".",
		].join("\n"),
	);
}

const staleOrphans = [...knownOrphans].filter((tag) => !orphans.includes(tag));
if (staleOrphans.length > 0) {
	console.warn(
		`Aviso: ${LOCK_PATH} lista órfãos que não existem mais: ${staleOrphans.join(", ")}.`,
	);
}

validateLegacyBoundary(journal, lock);
validateIncrementalEntries(journal, lock);
const hashes = Object.fromEntries(
	sqlFiles.map((file) => [file, sha256(path.join(MIGRATIONS_DIR, file))]),
);

if (shouldUpdate) {
	updateLock(lock, hashes);
} else {
	verifyHashes(lock, hashes);
}

console.log(
	[
		`${journal.entries.length} migrations no journal, ${sqlFiles.length} arquivos .sql.`,
		`${orphans.length} órfão(s) histórico(s) registrado(s)${orphans.length > 0 ? `: ${orphans.join(", ")}` : ""}.`,
		shouldUpdate
			? `${LOCK_PATH} atualizado.`
			: "Histórico de migrations validado.",
	].join("\n"),
);

function validateLegacyBoundary(journal, lock) {
	const legacyThroughTag = lock.legacyThroughTag;
	if (!legacyThroughTag) {
		fail(`${LOCK_PATH} precisa definir "legacyThroughTag".`);
	}

	const index = journal.entries.findIndex(
		(entry) => entry.tag === legacyThroughTag,
	);
	if (index === -1) {
		fail(
			`legacyThroughTag "${legacyThroughTag}" não existe no journal. ` +
				"Ela marca o fim do histórico antigo e não deve ser removida.",
		);
	}
}

function validateIncrementalEntries(journal, lock) {
	const legacyIndex = journal.entries.findIndex(
		(entry) => entry.tag === lock.legacyThroughTag,
	);
	const newEntries = journal.entries.slice(legacyIndex + 1);

	for (let offset = 0; offset < newEntries.length; offset += 1) {
		const index = legacyIndex + 1 + offset;
		const entry = newEntries[offset];
		const previous = journal.entries[index - 1];

		if (entry.idx !== previous.idx + 1) {
			fail(
				`A migration ${entry.tag} usa idx ${entry.idx}; esperado ${previous.idx + 1} ` +
					`(imediatamente após ${previous.tag}).`,
			);
		}

		if (entry.when <= previous.when) {
			fail(
				`A migration ${entry.tag} precisa ter timestamp maior que ${previous.tag}.`,
			);
		}
	}
}

function verifyHashes(lock, hashes) {
	const missing = Object.keys(hashes).filter((file) => !(file in lock.files));
	if (missing.length > 0) {
		fail(
			[
				"Migration nova sem hash registrado:",
				...missing.map((file) => `  - ${file}`),
				"Rode `pnpm db:migrations:check --update` e commite o lock.",
			].join("\n"),
		);
	}

	const changed = Object.entries(lock.files).filter(([file, hash]) => {
		return file in hashes && hashes[file] !== hash;
	});

	if (changed.length > 0) {
		fail(
			[
				"Migration publicada foi alterada (o histórico é imutável):",
				...changed.map(([file]) => `  - ${file}`),
				"Crie uma nova migration incremental em vez de editar a existente.",
			].join("\n"),
		);
	}

	const deleted = Object.keys(lock.files).filter((file) => !(file in hashes));
	if (deleted.length > 0) {
		fail(
			[
				"Migration publicada foi removida do repositório:",
				...deleted.map((file) => `  - ${file}`),
			].join("\n"),
		);
	}
}

function updateLock(lock, hashes) {
	for (const [file, hash] of Object.entries(lock.files)) {
		if (file in hashes && hashes[file] !== hash) {
			fail(
				`${file} já foi publicado e não pode ser alterado (hash diferente do lock). ` +
					"Crie uma nova migration incremental.",
			);
		}
	}

	const files = Object.fromEntries(
		Object.entries(hashes).sort(([a], [b]) => a.localeCompare(b)),
	);

	writeFileSync(
		LOCK_PATH,
		`${JSON.stringify({ ...lock, files }, null, "\t")}\n`,
		"utf8",
	);
}

function readJson(file) {
	if (!existsSync(file)) {
		fail(`Arquivo não encontrado: ${file}`);
	}

	try {
		return JSON.parse(readFileSync(file, "utf8"));
	} catch (error) {
		fail(`JSON inválido em ${file}: ${error.message}`);
	}
}

function sha256(file) {
	return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function fail(message) {
	console.error(`\n[db:migrations:check] ${message}\n`);
	process.exit(1);
}
