export type SavingsGoalAccount = {
	id: string;
	name: string;
	logo: string | null;
};

export type SavingsGoal = {
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
	destinationAccount: SavingsGoalAccount | null;
};

export type SavingsGoalFormValues = {
	description: string;
	targetAmount: string;
	startDate: string;
	targetDate: string;
	destinationAccountId: string;
};
