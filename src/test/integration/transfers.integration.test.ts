import { beforeEach, describe, expect, it } from "vitest";
import { transactions } from "@/db/schema";
import { transferBetweenAccountsForUser } from "@/features/accounts/lib/account-services";
import { db } from "@/shared/lib/db";
import { parseLocalDateString } from "@/shared/utils/date";
import { countTransactions, resetDatabase, seedUser } from "./harness";

const TRANSFER_DATE = parseLocalDateString("2026-01-15");
const FIRST_PERIOD = "2026-01";

function sumAmounts(rows: Array<{ amount: string | null }>): number {
	return rows.reduce((total, row) => total + Number(row.amount ?? 0), 0);
}

describe("transferência entre contas (integração)", () => {
	beforeEach(resetDatabase);

	it("cria um par de lançamentos opostos e conserva o saldo", async () => {
		const owner = await seedUser("transfer");

		await transferBetweenAccountsForUser(owner.id, {
			fromAccountId: owner.accountId,
			toAccountId: owner.secondAccountId,
			amount: 250,
			date: TRANSFER_DATE,
			period: FIRST_PERIOD,
			condition: "À vista",
			installmentCount: 1,
		});

		const rows = await db.select().from(transactions);

		expect(rows).toHaveLength(2);
		expect(sumAmounts(rows)).toBe(0);
		expect(rows.map((row) => row.amount).sort()).toEqual(["-250.00", "250.00"]);

		const transferIds = new Set(rows.map((row) => row.transferId));
		expect(transferIds.size).toBe(1);

		const outgoing = rows.find((row) => Number(row.amount) < 0);
		const incoming = rows.find((row) => Number(row.amount) > 0);

		expect(outgoing?.accountId).toBe(owner.accountId);
		expect(incoming?.accountId).toBe(owner.secondAccountId);
		expect(rows.every((row) => row.transactionType === "Transferência")).toBe(
			true,
		);
		expect(rows.every((row) => row.isSettled === true)).toBe(true);
		expect(
			rows.every((row) => row.categoryId === owner.transferCategoryId),
		).toBe(true);
	});

	it("cria um par por parcela, com períodos mensais e saldo líquido zero", async () => {
		const owner = await seedUser("transfer-installments");

		await transferBetweenAccountsForUser(owner.id, {
			fromAccountId: owner.accountId,
			toAccountId: owner.secondAccountId,
			amount: 100,
			date: TRANSFER_DATE,
			period: FIRST_PERIOD,
			condition: "Parcelado",
			installmentCount: 3,
		});

		const rows = await db.select().from(transactions);

		expect(rows).toHaveLength(6);
		expect(new Set(rows.map((row) => row.transferId)).size).toBe(3);
		expect(sumAmounts(rows)).toBe(0);

		for (const period of ["2026-01", "2026-02", "2026-03"]) {
			const pair = rows.filter((row) => row.period === period);
			expect(pair, `período ${period}`).toHaveLength(2);
			expect(sumAmounts(pair), `período ${period}`).toBe(0);
		}

		expect(rows.every((row) => Number(row.currentInstallment) >= 1)).toBe(true);
	});

	it("recusa conta de outro usuário e não grava nada", async () => {
		const owner = await seedUser("owner");
		const other = await seedUser("other");

		await expect(
			transferBetweenAccountsForUser(owner.id, {
				fromAccountId: other.accountId,
				toAccountId: owner.secondAccountId,
				amount: 10,
				date: TRANSFER_DATE,
				period: FIRST_PERIOD,
				condition: "À vista",
				installmentCount: 1,
			}),
		).rejects.toThrow("Conta de origem não encontrada.");

		expect(await countTransactions()).toBe(0);
	});

	it("recusa transferir para a mesma conta", async () => {
		const owner = await seedUser("owner");

		await expect(
			transferBetweenAccountsForUser(owner.id, {
				fromAccountId: owner.accountId,
				toAccountId: owner.accountId,
				amount: 10,
				date: TRANSFER_DATE,
				period: FIRST_PERIOD,
				condition: "À vista",
				installmentCount: 1,
			}),
		).rejects.toThrow("A conta de origem e destino devem ser diferentes.");

		expect(await countTransactions()).toBe(0);
	});
});
