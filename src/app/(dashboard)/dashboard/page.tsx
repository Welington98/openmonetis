import Link from "next/link";
import { connection } from "next/server";
import { DailyBudgetHero } from "@/features/daily-budget/components/daily-budget-hero";
import { fetchDailyBudgetOverview } from "@/features/daily-budget/queries";
import { DashboardGridEditable } from "@/features/dashboard/components/dashboard-grid-editable";
import { DashboardMetricsCards } from "@/features/dashboard/components/dashboard-metrics-cards";
import { DashboardWelcome } from "@/features/dashboard/components/dashboard-welcome";
import { extractDashboardLogoNames } from "@/features/dashboard/lib/extract-logo-names";
import { fetchDashboardPageData } from "@/features/dashboard/page-data-queries";
import { getSingleParam } from "@/features/transactions/lib/page-helpers";
import { LogoPrefetchProvider } from "@/shared/components/entity-avatar";
import { ContentErrorBoundary } from "@/shared/components/feedback/content-error-boundary";
import MonthNavigation from "@/shared/components/month-picker/month-navigation";
import { getUser } from "@/shared/lib/auth/server";
import { prefetchLogoMappings } from "@/shared/lib/logo/prefetch-server";
import { parsePeriodParam } from "@/shared/utils/period";

type PageSearchParams = Promise<Record<string, string | string[] | undefined>>;

type PageProps = {
	searchParams?: PageSearchParams;
};

export default function Page({ searchParams }: PageProps) {
	return (
		<ContentErrorBoundary
			title="Não foi possível carregar o dashboard"
			description="Seus dados financeiros não puderam ser carregados agora."
		>
			<DashboardContent searchParams={searchParams} />
		</ContentErrorBoundary>
	);
}

async function DashboardContent({ searchParams }: PageProps) {
	await connection();
	const user = await getUser();
	const resolvedSearchParams = searchParams ? await searchParams : undefined;
	const periodoParam = getSingleParam(resolvedSearchParams, "periodo");
	const { period: selectedPeriod } = parsePeriodParam(periodoParam);

	const [
		{ dashboardData, preferences, quickActionOptions },
		dailyBudgetOverview,
	] = await Promise.all([
		fetchDashboardPageData(user.id, selectedPeriod),
		fetchDailyBudgetOverview(user.id),
	]);
	const { dashboardWidgets } = preferences;
	const adminPayerSlug =
		quickActionOptions.payerOptions.find(
			(option) => option.value === quickActionOptions.defaultPayerId,
		)?.slug ?? null;

	const logoMappings = await prefetchLogoMappings(
		user.id,
		extractDashboardLogoNames(dashboardData),
	);

	return (
		<main className="flex flex-col gap-4">
			<DashboardWelcome name={user.name} />
			<ContentErrorBoundary
				title="Não foi possível exibir o orçamento diário"
				description="O orçamento diário não pôde ser exibido agora."
			>
				<Link href="/daily-budget">
					<DailyBudgetHero overview={dailyBudgetOverview} />
				</Link>
			</ContentErrorBoundary>
			<MonthNavigation />
			<ContentErrorBoundary
				title="Não foi possível exibir o resumo"
				description="Os indicadores do período não puderam ser exibidos agora."
			>
				<DashboardMetricsCards
					metrics={dashboardData.metrics}
					period={selectedPeriod}
					adminPayerSlug={adminPayerSlug}
				/>
			</ContentErrorBoundary>
			<ContentErrorBoundary
				title="Não foi possível exibir os widgets"
				description="Os detalhes do dashboard não puderam ser exibidos agora."
			>
				<LogoPrefetchProvider mappings={logoMappings}>
					<DashboardGridEditable
						data={dashboardData}
						period={selectedPeriod}
						initialPreferences={dashboardWidgets}
						quickActionOptions={quickActionOptions}
					/>
				</LogoPrefetchProvider>
			</ContentErrorBoundary>
		</main>
	);
}
