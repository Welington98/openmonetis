/**
 * Virou `src/shared/lib/balance-tone.ts` — deixou de ser específico de
 * `balances` (também usado em `daily-budget`, pro orçamento restante do
 * mês). Reexporta aqui pra não quebrar os imports existentes desta feature.
 */
export {
	type BalanceCellTone,
	type BalanceTone,
	getBalanceCellTone,
	getBalanceTextClass,
	getBalanceTone,
} from "@/shared/lib/balance-tone";
