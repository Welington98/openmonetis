import { connection } from "next/server";
import { Suspense } from "react";
import { BalancesHeader } from "@/features/balances/components/balances-header";
import { BalancesSummary } from "@/features/balances/components/balances-summary";
import { BalancesViews } from "@/features/balances/components/balances-views";
import { fetchBalanceProjection } from "@/features/balances/queries";
import { DailyBudgetHero } from "@/features/daily-budget/components/daily-budget-hero";
import { DailyBudgetMovementsSummary } from "@/features/daily-budget/components/daily-budget-movements-summary";
import { DailyBudgetProjectionTable } from "@/features/daily-budget/components/daily-budget-projection-table";
import { DailyBudgetSettingsDialog } from "@/features/daily-budget/components/daily-budget-settings-dialog";
import { DailyBudgetStatCards } from "@/features/daily-budget/components/daily-budget-stat-cards";
import {
	type DailyBudgetView,
	DailyBudgetViewTabs,
} from "@/features/daily-budget/components/daily-budget-view-tabs";
import { fetchDailyBudgetOverview } from "@/features/daily-budget/queries";
import { InfoTooltip } from "@/shared/components/info-tooltip";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { getUserId } from "@/shared/lib/auth/server";
import { getBusinessDateString } from "@/shared/utils/date";
import { parsePeriodParam } from "@/shared/utils/period";

const HELP_LINES = [
	"Hoje: cota de disciplina do mês atual — reseta todo mês, não olha pra frente nem considera fatura no vencimento.",
	"Projeção: saldo de caixa real das contas, projetado dia a dia por até 12 meses — nunca reseta, fatura de cartão sai no dia do vencimento.",
	"São duas leituras do mesmo orçamento: uma responde 'quanto gasto hoje', a outra 'quando fico no vermelho'.",
];

const VIEW_SUBTITLE: Record<DailyBudgetView, string> = {
	hoje: "Quanto você pode gastar hoje sem comprometer o resto do mês.",
	projecao:
		"Saldo de caixa projetado dia a dia, mês a mês — pra saber com antecedência quando a conta fica negativa.",
};

type PageSearchParams = Promise<Record<string, string | string[] | undefined>>;

type PageProps = {
	searchParams?: PageSearchParams;
};

const getSingleParam = (
	params: Record<string, string | string[] | undefined> | undefined,
	key: string,
) => {
	const value = params?.[key];
	if (!value) return null;
	return Array.isArray(value) ? (value[0] ?? null) : value;
};

async function DailyBudgetTodayContent({ userId }: { userId: string }) {
	const overview = await fetchDailyBudgetOverview(userId);
	const today = getBusinessDateString();

	return (
		<>
			<div className="flex justify-end">
				<DailyBudgetSettingsDialog
					calculationMode={overview.calculationMode}
					customDailyLimit={overview.customDailyLimit}
					targetSavings={overview.targetSavings || null}
					safetyBuffer={overview.safetyBuffer || null}
				/>
			</div>
			<DailyBudgetHero overview={overview} />
			<DailyBudgetStatCards overview={overview} />
			<DailyBudgetMovementsSummary overview={overview} />
			<DailyBudgetProjectionTable
				projection={overview.projection}
				today={today}
				dailyBudgetAmount={overview.dailyBudget.dailyBudgetAmount}
			/>
		</>
	);
}

async function DailyBudgetProjectionContent({
	userId,
	startPeriod,
}: {
	userId: string;
	startPeriod: string;
}) {
	const overview = await fetchBalanceProjection(userId, { startPeriod });

	return (
		<>
			<BalancesSummary overview={overview} />
			<BalancesViews overview={overview} />
		</>
	);
}

function CardsRowSkeleton() {
	return (
		<div className="grid gap-3 sm:grid-cols-3">
			{["a", "b", "c"].map((key) => (
				<Card key={key}>
					<CardContent className="space-y-2">
						<Skeleton className="h-3 w-24 bg-foreground/10" />
						<Skeleton className="h-6 w-32 bg-foreground/10" />
					</CardContent>
				</Card>
			))}
		</div>
	);
}

function TableSkeleton() {
	return (
		<Card className="p-5">
			<div className="mb-4 flex items-center justify-between">
				<Skeleton className="h-4 w-28 bg-foreground/10" />
				<Skeleton className="h-8 w-40 bg-foreground/10" />
			</div>
			<div className="space-y-2">
				{Array.from({ length: 8 }, (_, index) => index).map((row) => (
					<Skeleton key={row} className="h-6 w-full bg-foreground/10" />
				))}
			</div>
		</Card>
	);
}

function DailyBudgetTodaySkeleton() {
	return (
		<div className="flex flex-col gap-6">
			<Card className="p-5">
				<div className="space-y-3">
					<Skeleton className="h-4 w-40 bg-foreground/10" />
					<Skeleton className="h-10 w-56 bg-foreground/10" />
					<Skeleton className="h-4 w-full max-w-md bg-foreground/10" />
				</div>
			</Card>
			<CardsRowSkeleton />
			<TableSkeleton />
		</div>
	);
}

function ProjectionSkeleton() {
	return (
		<div className="flex flex-col gap-6">
			<CardsRowSkeleton />
			<TableSkeleton />
		</div>
	);
}

export default async function Page({ searchParams }: PageProps) {
	await connection();
	const userId = await getUserId();
	const resolvedSearchParams = searchParams ? await searchParams : undefined;
	const view: DailyBudgetView =
		getSingleParam(resolvedSearchParams, "view") === "projecao"
			? "projecao"
			: "hoje";
	const inicioParam = getSingleParam(resolvedSearchParams, "inicio");
	const { period: startPeriod } = parsePeriodParam(inicioParam);

	return (
		<main className="mx-auto flex w-full max-w-5xl flex-col gap-6">
			<div>
				<div className="flex items-center gap-1.5">
					<h1 className="text-xl font-semibold">Orçamento diário</h1>
					<InfoTooltip
						label="orçamento diário"
						helpTitle="Hoje x Projeção"
						helpLines={HELP_LINES}
					/>
				</div>
				<p className="text-sm text-muted-foreground">{VIEW_SUBTITLE[view]}</p>
			</div>

			<DailyBudgetViewTabs view={view} />

			{view === "hoje" ? (
				<Suspense fallback={<DailyBudgetTodaySkeleton />}>
					<DailyBudgetTodayContent userId={userId} />
				</Suspense>
			) : (
				<>
					<BalancesHeader />
					<Suspense fallback={<ProjectionSkeleton />} key={startPeriod}>
						<DailyBudgetProjectionContent
							userId={userId}
							startPeriod={startPeriod}
						/>
					</Suspense>
				</>
			)}
		</main>
	);
}
