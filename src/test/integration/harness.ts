import { randomUUID } from "node:crypto";
import { count, sql } from "drizzle-orm";
import {
	categories,
	costCenters,
	financialAccounts,
	payers,
	transactions,
	user as userTable,
} from "@/db/schema";
import { db } from "@/shared/lib/db";
import { PAYER_ROLE_ADMIN } from "@/shared/lib/payers/constants";
import { TRANSFER_CATEGORY_NAME } from "@/shared/lib/transfers/constants";

/**
 * Apaga os dados de todas as tabelas do schema `public` mantendo o schema.
 * Rodado no `beforeEach` de cada teste para isolar os cenários.
 */
export async function resetDatabase(): Promise<void> {
	const result = (await db.execute(
		sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
	)) as unknown as { rows: Array<{ tablename: string }> };

	const tables = result.rows
		.map((row) => row.tablename)
		.filter((table) => !table.startsWith("__drizzle"));

	if (tables.length === 0) return;

	const list = tables
		.map((table) => `"${table.replace(/"/g, '""')}"`)
		.join(", ");

	await db.execute(sql.raw(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`));
}

export async function countTransactions(): Promise<number> {
	const [row] = await db.select({ total: count() }).from(transactions);
	return Number(row?.total ?? 0);
}

export function isoDateToday(): string {
	return new Date().toISOString().slice(0, 10);
}

export type SeededUser = {
	id: string;
	email: string;
	payerId: string;
	accountId: string;
	secondAccountId: string;
	categoryId: string;
	transferCategoryId: string;
	costCenterId: string;
};

/**
 * Cria um usuário com o mínimo necessário para exercitar os fluxos
 * financeiros: pessoa administradora, duas contas, uma categoria de despesa,
 * a categoria obrigatória de transferência e um centro de custo.
 */
export async function seedUser(label: string): Promise<SeededUser> {
	const id = randomUUID();
	const email = `${label}-${id.slice(0, 8)}@example.test`;
	const now = new Date();

	await db.insert(userTable).values({
		id,
		name: label,
		email,
		emailVerified: true,
		createdAt: now,
		updatedAt: now,
	});

	const payerId = await insertPayer(id, `Titular ${label}`);
	const accountId = await insertAccount(id, `Conta ${label}`);
	const secondAccountId = await insertAccount(id, `Poupança ${label}`);
	const categoryId = await insertCategory(id, `Categoria ${label}`, "despesa");
	const transferCategoryId = await insertCategory(
		id,
		TRANSFER_CATEGORY_NAME,
		"despesa",
	);
	const costCenterId = await insertCostCenter(id, `Centro ${label}`);

	return {
		id,
		email,
		payerId,
		accountId,
		secondAccountId,
		categoryId,
		transferCategoryId,
		costCenterId,
	};
}

async function insertPayer(userId: string, name: string): Promise<string> {
	const [row] = await db
		.insert(payers)
		.values({
			name,
			status: "Ativo",
			role: PAYER_ROLE_ADMIN,
			shareCode: randomUUID(),
			userId,
		})
		.returning({ id: payers.id });

	return requireId(row?.id, "pagador");
}

async function insertAccount(userId: string, name: string): Promise<string> {
	const [row] = await db
		.insert(financialAccounts)
		.values({
			name,
			accountType: "Conta corrente",
			status: "Ativa",
			logo: "default_icon.png",
			userId,
		})
		.returning({ id: financialAccounts.id });

	return requireId(row?.id, "conta");
}

async function insertCategory(
	userId: string,
	name: string,
	type: string,
): Promise<string> {
	const [row] = await db
		.insert(categories)
		.values({ name, type, userId })
		.returning({ id: categories.id });

	return requireId(row?.id, "categoria");
}

async function insertCostCenter(userId: string, name: string): Promise<string> {
	const [row] = await db
		.insert(costCenters)
		.values({ name, kind: "variavel", userId })
		.returning({ id: costCenters.id });

	return requireId(row?.id, "centro de custo");
}

function requireId(id: string | undefined, entity: string): string {
	if (!id) {
		throw new Error(`Não foi possível criar o ${entity} de teste.`);
	}
	return id;
}
