import { beforeEach, describe, expect, it } from "vitest";
import { transactions } from "@/db/schema";
import { createTransactionsForUser } from "@/features/transactions/lib/create-transactions";
import { fetchRecentEstablishments } from "@/features/transactions/queries";
import { db } from "@/shared/lib/db";
import {
	countTransactions,
	isoDateToday,
	resetDatabase,
	type SeededUser,
	seedUser,
} from "./harness";

type CreateInput = Parameters<typeof createTransactionsForUser>[0]["input"];

function expenseInput(
	owner: SeededUser,
	overrides: Partial<CreateInput> = {},
): CreateInput {
	return {
		purchaseDate: isoDateToday(),
		name: "Padaria do bairro",
		transactionType: "Despesa",
		amount: 42.5,
		condition: "À vista",
		paymentMethod: "Pix",
		payerId: owner.payerId,
		accountId: owner.accountId,
		categoryId: owner.categoryId,
		costCenterId: owner.costCenterId,
		note: null,
		isSplit: false,
		isSettled: true,
		...overrides,
	};
}

describe("ownership entre usuários (integração)", () => {
	beforeEach(resetDatabase);

	it("recusa lançamento em conta de outro usuário e não grava nada", async () => {
		const owner = await seedUser("owner");
		const other = await seedUser("other");

		const result = await createTransactionsForUser({
			userId: owner.id,
			userLabel: "Owner",
			input: expenseInput(owner, { accountId: other.accountId }),
		});

		expect(result).toEqual({ success: false, error: "Conta não encontrada." });
		expect(await countTransactions()).toBe(0);
	});

	it("recusa pessoa de outro usuário e não grava nada", async () => {
		const owner = await seedUser("owner");
		const other = await seedUser("other");

		const result = await createTransactionsForUser({
			userId: owner.id,
			userLabel: "Owner",
			input: expenseInput(owner, { payerId: other.payerId }),
		});

		expect(result).toEqual({
			success: false,
			error: "Pessoa não encontrada ou sem permissão.",
		});
		expect(await countTransactions()).toBe(0);
	});

	it("recusa categoria de outro usuário e não grava nada", async () => {
		const owner = await seedUser("owner");
		const other = await seedUser("other");

		const result = await createTransactionsForUser({
			userId: owner.id,
			userLabel: "Owner",
			input: expenseInput(owner, { categoryId: other.categoryId }),
		});

		expect(result).toEqual({
			success: false,
			error: "Categoria não encontrada.",
		});
		expect(await countTransactions()).toBe(0);
	});

	it("grava o lançamento com o dono, valor negativo e vínculos corretos", async () => {
		const owner = await seedUser("owner");

		const result = await createTransactionsForUser({
			userId: owner.id,
			userLabel: "Owner",
			input: expenseInput(owner),
		});

		expect(result.success).toBe(true);

		const [row] = await db.select().from(transactions);
		expect(row).toBeDefined();
		expect(row?.userId).toBe(owner.id);
		expect(row?.accountId).toBe(owner.accountId);
		expect(row?.payerId).toBe(owner.payerId);
		expect(row?.categoryId).toBe(owner.categoryId);
		expect(row?.transactionType).toBe("Despesa");
		expect(row?.amount).toBe("-42.50");
		expect(row?.isSettled).toBe(true);
	});

	it("não expõe lançamentos de outro usuário em consulta escopada por userId", async () => {
		const owner = await seedUser("owner");
		const other = await seedUser("other");
		const suffix = Date.now().toString(36);

		const ownerName = `MERCADO-OWNER-${suffix}`;
		const otherName = `MERCADO-OTHER-${suffix}`;

		await createTransactionsForUser({
			userId: owner.id,
			userLabel: "Owner",
			input: expenseInput(owner, { name: ownerName }),
		});
		await createTransactionsForUser({
			userId: other.id,
			userLabel: "Other",
			input: expenseInput(other, { name: otherName }),
		});

		const visibleForOwner = await fetchRecentEstablishments(owner.id);

		expect(visibleForOwner).toContain(ownerName);
		expect(visibleForOwner).not.toContain(otherName);
	});
});
