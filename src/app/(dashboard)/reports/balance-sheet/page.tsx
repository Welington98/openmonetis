import { RiScales3Line } from "@remixicon/react";
import { connection } from "next/server";
import { BalanceSheetAccountList } from "@/features/reports/components/balance-sheet-account-list";
import { BalanceSheetTotals } from "@/features/reports/components/balance-sheet-totals";
import { fetchBalanceSheetReport } from "@/features/reports/lib/balance-sheet-queries";
import { ContentErrorBoundary } from "@/shared/components/feedback/content-error-boundary";
import { EmptyState } from "@/shared/components/feedback/empty-state";
import { Card, CardContent } from "@/shared/components/ui/card";
import { getUser } from "@/shared/lib/auth/server";

export default function BalanceSheetPage() {
	return (
		<ContentErrorBoundary
			title="Não foi possível carregar o balanço patrimonial"
			description="Os dados deste relatório não puderam ser carregados agora."
		>
			<BalanceSheetContent />
		</ContentErrorBoundary>
	);
}

async function BalanceSheetContent() {
	await connection();
	const user = await getUser();
	const report = await fetchBalanceSheetReport(user.id);

	const hasAccounts =
		report.ativoAccounts.length > 0 || report.passivoAccounts.length > 0;

	if (!hasAccounts) {
		return (
			<main className="flex flex-col gap-4">
				<Card className="flex min-h-[50vh] w-full items-center justify-center py-12">
					<EmptyState
						media={<RiScales3Line className="size-6 text-primary" />}
						title="Nenhuma conta cadastrada"
						description="Cadastre suas contas para acompanhar o balanço patrimonial."
					/>
				</Card>
			</main>
		);
	}

	return (
		<main className="flex flex-col gap-4">
			<BalanceSheetTotals totals={report.totals} />

			<div className="grid gap-4 md:grid-cols-2">
				<BalanceSheetAccountList
					title="Ativo"
					accounts={report.ativoAccounts}
					emptyLabel="Nenhuma conta de ativo."
					valueClassName="text-success"
				/>
				<BalanceSheetAccountList
					title="Passivo"
					accounts={report.passivoAccounts}
					emptyLabel="Nenhuma conta de passivo."
					valueClassName="text-destructive"
				/>
			</div>

			<Card>
				<CardContent className="p-4 text-xs text-muted-foreground">
					Contas marcadas como "excluir do saldo" ou arquivadas não entram neste
					cálculo — o mesmo critério usado no saldo consolidado do painel.
				</CardContent>
			</Card>
		</main>
	);
}
