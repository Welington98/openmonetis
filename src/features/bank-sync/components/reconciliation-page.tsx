import {
	RiCheckLine,
	RiErrorWarningLine,
	RiFileUploadLine,
	RiInboxArchiveLine,
} from "@remixicon/react";
import Link from "next/link";
import type { ReconciliationOverview } from "@/features/bank-sync/queries";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@/shared/components/ui/empty";
import { formatCurrency } from "@/shared/utils/currency";

// Tolerância de arredondamento — evita alarme falso por centavo de diferença
// de sincronização entre o saldo do Pluggy e o cálculo local.
const BALANCE_TOLERANCE_CENTS = 1;

interface ReconciliationPageProps {
	overview: ReconciliationOverview;
}

export function ReconciliationPage({ overview }: ReconciliationPageProps) {
	const { pluggyConfigured, accounts, pendingInboxCount } = overview;

	return (
		<div className="flex flex-col gap-6">
			<div>
				<h1 className="font-semibold text-xl">Conciliação bancária</h1>
				<p className="text-muted-foreground text-sm">
					Compare o saldo declarado pelo banco (Pluggy) com o saldo calculado
					pelos seus lançamentos, e veja de relance o que está pendente em cada
					fila de importação — Pluggy, extrato OFX/planilha e comprovantes PDF.
				</p>
			</div>

			{!pluggyConfigured ? (
				<Empty>
					<EmptyHeader>
						<EmptyTitle>Sincronização bancária não configurada</EmptyTitle>
						<EmptyDescription>
							Configure PLUGGY_CLIENT_ID/PLUGGY_CLIENT_SECRET para comparar
							saldos automaticamente.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			) : accounts.length === 0 ? (
				<Empty>
					<EmptyHeader>
						<EmptyTitle>Nenhuma conta vinculada ao Pluggy</EmptyTitle>
						<EmptyDescription>
							Conecte um banco e vincule as contas em Sincronização bancária
							para ver a comparação de saldo aqui.
						</EmptyDescription>
					</EmptyHeader>
					<Button asChild variant="outline" size="sm">
						<Link href="/bank-sync">Ir para Sincronização bancária</Link>
					</Button>
				</Empty>
			) : (
				<section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{accounts.map((account) => {
						const hasPluggyBalance = account.pluggyBalance !== null;
						const diffCents = hasPluggyBalance
							? Math.round(
									(Number(account.pluggyBalance) - account.localBalance) * 100,
								)
							: 0;
						const isReconciled =
							hasPluggyBalance &&
							Math.abs(diffCents) <= BALANCE_TOLERANCE_CENTS;

						return (
							<Card key={account.accountId}>
								<CardHeader className="flex-row items-center justify-between">
									<CardTitle className="text-base">
										{account.accountName}
									</CardTitle>
									<Badge variant="secondary">{account.connectorName}</Badge>
								</CardHeader>
								<CardContent className="flex flex-col gap-2">
									<div className="flex items-center justify-between text-sm">
										<span className="text-muted-foreground">Saldo Pluggy</span>
										<span className="font-medium">
											{hasPluggyBalance
												? formatCurrency(Number(account.pluggyBalance))
												: "indisponível"}
										</span>
									</div>
									<div className="flex items-center justify-between text-sm">
										<span className="text-muted-foreground">Saldo local</span>
										<span className="font-medium">
											{formatCurrency(account.localBalance)}
										</span>
									</div>

									{hasPluggyBalance && (
										<div
											className={`flex items-center gap-1.5 text-xs ${
												isReconciled ? "text-emerald-600" : "text-amber-600"
											}`}
										>
											{isReconciled ? (
												<>
													<RiCheckLine className="size-3.5" />
													Saldos conferem
												</>
											) : (
												<>
													<RiErrorWarningLine className="size-3.5" />
													Diferença de{" "}
													{formatCurrency(Math.abs(diffCents / 100))}
												</>
											)}
										</div>
									)}

									<Button asChild variant="outline" size="sm" className="mt-1">
										<Link href="/bank-sync">
											{account.pendingCount > 0
												? `${account.pendingCount} pendente(s) para revisar`
												: "Nada pendente"}
										</Link>
									</Button>
								</CardContent>
							</Card>
						);
					})}
				</section>
			)}

			<section className="flex flex-col gap-3">
				<h2 className="font-medium text-sm text-muted-foreground">
					Outras filas de importação
				</h2>
				<div className="grid gap-3 sm:grid-cols-2">
					<Card>
						<CardContent className="flex items-center justify-between gap-4 py-4">
							<div className="flex items-center gap-3">
								<RiInboxArchiveLine className="size-5 text-muted-foreground" />
								<div className="flex flex-col">
									<span className="font-medium text-sm">
										Pré-lançamentos pendentes
									</span>
									<span className="text-muted-foreground text-xs">
										Companion Android + comprovantes PDF
									</span>
								</div>
							</div>
							<Button asChild variant="outline" size="sm">
								<Link href="/inbox">
									{pendingInboxCount > 0 ? `${pendingInboxCount} →` : "Ver →"}
								</Link>
							</Button>
						</CardContent>
					</Card>

					<Card>
						<CardContent className="flex items-center justify-between gap-4 py-4">
							<div className="flex items-center gap-3">
								<RiFileUploadLine className="size-5 text-muted-foreground" />
								<div className="flex flex-col">
									<span className="font-medium text-sm">
										Importar extrato OFX/planilha
									</span>
									<span className="text-muted-foreground text-xs">
										Revisão acontece no momento do upload
									</span>
								</div>
							</div>
							<Button asChild variant="outline" size="sm">
								<Link href="/transactions/import">Importar →</Link>
							</Button>
						</CardContent>
					</Card>
				</div>
			</section>
		</div>
	);
}
