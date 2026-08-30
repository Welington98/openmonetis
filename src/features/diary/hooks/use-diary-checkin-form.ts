import type {
	DiaryCategory,
	DiaryClassification,
} from "@/features/diary/lib/constants";
import { useFormState } from "@/shared/hooks/use-form-state";

export type DiaryCheckinFormState = {
	hadExpense: boolean | null;
	amount: string;
	category: DiaryCategory | null;
	classification: DiaryClassification | null;
	note: string;
};

const EMPTY_FORM_STATE: DiaryCheckinFormState = {
	hadExpense: null,
	amount: "",
	category: null,
	classification: null,
	note: "",
};

export function useDiaryCheckinForm(initial?: Partial<DiaryCheckinFormState>) {
	return useFormState<DiaryCheckinFormState>({
		...EMPTY_FORM_STATE,
		...initial,
	});
}
