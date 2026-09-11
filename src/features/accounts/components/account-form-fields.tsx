"use client";

import { Checkbox } from "@/shared/components/ui/checkbox";
import { CurrencyInput } from "@/shared/components/ui/currency-input";
import { DatePicker } from "@/shared/components/ui/date-picker";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/shared/components/ui/radio-group";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { Textarea } from "@/shared/components/ui/textarea";
import { isLoanAccountType } from "@/shared/lib/loans/constants";
import {
	AccountTypeSelectContent,
	StatusSelectContent,
} from "./account-select-items";

import type { AccountFormValues } from "./types";

interface AccountFormFieldsProps {
	values: AccountFormValues;
	accountTypes: string[];
	accountStatuses: string[];
	onChange: <K extends keyof AccountFormValues>(
		field: K,
		value: AccountFormValues[K],
	) => void;
	showInitialBalance?: boolean;
}

export function AccountFormFields({
	values,
	accountTypes,
	accountStatuses,
	onChange,
	showInitialBalance = true,
}: AccountFormFieldsProps) {
	return (
		<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
			<div className="flex flex-col gap-2">
				<Label htmlFor="account-name">Nome</Label>
				<Input
					id="account-name"
					value={values.name}
					onChange={(event) => onChange("name", event.target.value)}
					placeholder="Ex.: Nubank"
					required
				/>
			</div>

			<div className="flex flex-col gap-2">
				<Label htmlFor="account-type">Tipo de conta</Label>
				<Select
					value={values.accountType}
					onValueChange={(value) => onChange("accountType", value)}
				>
					<SelectTrigger id="account-type" className="w-full">
						<SelectValue placeholder="Selecione o tipo">
							{values.accountType && (
								<AccountTypeSelectContent label={values.accountType} />
							)}
						</SelectValue>
					</SelectTrigger>
					<SelectContent>
						{accountTypes.map((type) => (
							<SelectItem key={type} value={type}>
								<AccountTypeSelectContent label={type} />
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<div className="flex flex-col gap-2 sm:col-span-2">
				<Label htmlFor="account-status">Status</Label>
				<Select
					value={values.status}
					onValueChange={(value) => onChange("status", value)}
				>
					<SelectTrigger id="account-status" className="w-full">
						<SelectValue placeholder="Selecione o status">
							{values.status && <StatusSelectContent label={values.status} />}
						</SelectValue>
					</SelectTrigger>
					<SelectContent>
						{accountStatuses.map((status) => (
							<SelectItem key={status} value={status}>
								<StatusSelectContent label={status} />
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			{isLoanAccountType(values.accountType) ? (
				<div className="flex flex-col gap-2 sm:col-span-2">
					<p className="text-sm text-muted-foreground">
						Configure valor, juros e parcelas na próxima etapa, depois de salvar
						a conta.
					</p>
				</div>
			) : showInitialBalance ? (
				<div className="flex flex-col gap-4 sm:col-span-2">
					<div className="flex flex-col gap-2 sm:flex-row">
						<div className="flex w-full flex-col gap-2 sm:w-1/2">
							<Label htmlFor="account-initial-balance">Saldo inicial</Label>
							<CurrencyInput
								id="account-initial-balance"
								value={values.initialBalance}
								onValueChange={(value) => onChange("initialBalance", value)}
								placeholder="R$ 0,00"
							/>
						</div>
						<div className="flex w-full flex-col gap-2 sm:w-1/2">
							<Label htmlFor="account-initial-balance-date">
								Data do saldo inicial
							</Label>
							<DatePicker
								id="account-initial-balance-date"
								value={values.initialBalanceDate}
								onChange={(value) => onChange("initialBalanceDate", value)}
								placeholder="Data"
							/>
						</div>
					</div>

					<RadioGroup
						value={values.initialBalanceKind}
						onValueChange={(value) =>
							onChange(
								"initialBalanceKind",
								value as AccountFormValues["initialBalanceKind"],
							)
						}
						className="flex items-center gap-6"
					>
						<div className="flex items-center gap-2">
							<RadioGroupItem value="credor" id="account-balance-credor" />
							<Label
								htmlFor="account-balance-credor"
								className="cursor-pointer font-normal"
							>
								Credor
							</Label>
						</div>
						<div className="flex items-center gap-2">
							<RadioGroupItem value="devedor" id="account-balance-devedor" />
							<Label
								htmlFor="account-balance-devedor"
								className="cursor-pointer font-normal"
							>
								Devedor
							</Label>
						</div>
					</RadioGroup>
				</div>
			) : null}

			<div className="flex flex-col gap-2 sm:col-span-2">
				<Label htmlFor="account-note">Anotação</Label>
				<Textarea
					id="account-note"
					value={values.note}
					onChange={(event) => onChange("note", event.target.value)}
					placeholder="Informações adicionais sobre a conta"
				/>
			</div>

			<div className="flex flex-col gap-3 sm:col-span-2">
				<div className="flex items-center gap-2">
					<Checkbox
						id="exclude-from-balance"
						checked={Boolean(values.excludeFromBalance)}
						onCheckedChange={(checked) =>
							onChange("excludeFromBalance", checked === true)
						}
					/>
					<Label
						htmlFor="exclude-from-balance"
						className="cursor-pointer text-sm font-normal leading-tight"
					>
						Desconsiderar do saldo total (útil para contas de investimento ou
						reserva)
					</Label>
				</div>

				<div className="flex items-center gap-2">
					<Checkbox
						id="exclude-initial-balance-from-income"
						checked={Boolean(values.excludeInitialBalanceFromIncome)}
						onCheckedChange={(checked) =>
							onChange("excludeInitialBalanceFromIncome", checked === true)
						}
					/>
					<Label
						htmlFor="exclude-initial-balance-from-income"
						className="cursor-pointer text-sm font-normal leading-tight"
					>
						Desconsiderar o saldo inicial ao calcular o total de receitas
					</Label>
				</div>
			</div>
		</div>
	);
}
