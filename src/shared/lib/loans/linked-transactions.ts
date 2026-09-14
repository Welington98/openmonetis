import { and, eq, isNull, or, type SQL, sql } from "drizzle-orm";
import { loanInstallments, loans, transactions } from "@/db/schema";
import { LOAN_DISBURSEMENT_NOTE_PREFIX } from "@/shared/lib/loans/constants";

/**
 * Empréstimos criados ANTES da parcela/desembolso virarem transferências reais
 * (ver `insertLoanSchedule`) têm `accountId` apontando só pra conta de
 * pagamento — nunca pra própria conta de empréstimo — então o extrato da
 * conta de empréstimo ficaria sempre vazio sem essa ampliação. Empréstimos
 * criados DEPOIS já têm uma perna de verdade (`accountId` = conta de
 * empréstimo, `transferId` preenchido) — pra esses, ampliar o filtro
 * duplicaria a parcela (a perna da conta de pagamento apareceria também no
 * extrato da conta de empréstimo, sem pertencer lá). Por isso as duas
 * condições de ampliação só valem pra linhas sem `transferId` (formato
 * antigo) — os `and(isNull(transferId), ...)` abaixo.
 *
 * Monta o EXISTS via `sql` puro (em vez do query builder ligado à instância
 * de `db`) porque esse módulo é importado por `page-helpers.ts`, que também
 * é importado por componentes client — puxar a instância de `db` (e o
 * driver `pg`, que depende de módulos Node como `fs`/`net`/`tls`) pra dentro
 * do bundle do cliente quebra o build do Next.
 */
export function buildAccountTransactionCondition(accountId: string): SQL {
	return or(
		eq(transactions.accountId, accountId),
		and(
			isNull(transactions.transferId),
			sql`exists (
				select 1
				from ${loanInstallments}
				inner join ${loans} on ${loans.id} = ${loanInstallments.loanId}
				where ${loanInstallments.transactionId} = ${transactions.id}
					and ${loans.accountId} = ${accountId}
			)`,
		),
		and(
			isNull(transactions.transferId),
			eq(transactions.note, `${LOAN_DISBURSEMENT_NOTE_PREFIX}${accountId}`),
		),
	) as SQL;
}
