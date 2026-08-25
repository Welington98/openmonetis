import { asc, eq } from "drizzle-orm";
import { savingsGoals } from "@/db/schema";
import { fetchDashboardAccounts } from "@/features/dashboard/lib/accounts-queries";
import {
	computeSavingsGoalProgress,
	computeSuggestedMonthlyContribution,
} from "@/features/savings-goals/lib/progress";
import { db } from "@/shared/lib/db";
import { toDateOnlyString } from "@/shared/utils/date";
import { safeToNumber as toNumber } from "@/shared/utils/number";

export type SavingsGoalAccountOption = {
	id: string;
	name: string;
	logo: string | null;
};

export type SavingsGoalData = {
	id: string;
	description: string;
	targetAmount: number;
	startDate: string;
	targetDate: string;
	startingBalance: number;
	currentBalance: number;
	progress: number;
	percent: number;
	isReached: boolean;
	suggestedMonthlyContribution: number | null;
	destinationAccount: {
		id: string;
		name: string;
		logo: string | null;
	} | null;
};

export async function fetchSavingsGoalsForUser(userId: string): Promise<{
	goals: SavingsGoalData[];
	accountsOptions: SavingsGoalAccountOption[];
}> {
	const [goalRows, { accounts }] = await Promise.all([
		db.query.savingsGoals.findMany({
			where: eq(savingsGoals.userId, userId),
			with: {
				destinationAccount: {
					columns: { id: true, name: true, logo: true },
				},
			},
			orderBy: asc(savingsGoals.targetDate),
		}),
		fetchDashboardAccounts(userId),
	]);

	const balanceByAccountId = new Map(
		accounts.map((account) => [account.id, account.balance]),
	);

	const today = new Date();

	const goals = goalRows.map((goal): SavingsGoalData => {
		const targetAmount = toNumber(goal.targetAmount);
		const startingBalance = toNumber(goal.startingBalance);
		const currentBalance =
			balanceByAccountId.get(goal.destinationAccountId) ?? startingBalance;

		const { progress, isReached, percent } = computeSavingsGoalProgress({
			targetAmount,
			startingBalance,
			currentBalance,
		});

		const suggestedMonthlyContribution = computeSuggestedMonthlyContribution({
			targetAmount,
			progress,
			today,
			targetDate: goal.targetDate,
		});

		return {
			id: goal.id,
			description: goal.description,
			targetAmount,
			startDate: toDateOnlyString(goal.startDate) ?? "",
			targetDate: toDateOnlyString(goal.targetDate) ?? "",
			startingBalance,
			currentBalance,
			progress,
			percent,
			isReached,
			suggestedMonthlyContribution,
			destinationAccount: goal.destinationAccount
				? {
						id: goal.destinationAccount.id,
						name: goal.destinationAccount.name,
						logo: goal.destinationAccount.logo,
					}
				: null,
		};
	});

	const accountsOptions: SavingsGoalAccountOption[] = accounts.map(
		(account) => ({
			id: account.id,
			name: account.name,
			logo: account.logo,
		}),
	);

	return { goals, accountsOptions };
}

export async function fetchAccountCurrentBalance(
	userId: string,
	accountId: string,
): Promise<number | null> {
	const { accounts } = await fetchDashboardAccounts(userId);
	const account = accounts.find((item) => item.id === accountId);
	return account ? account.balance : null;
}
