/**
 * Virou `src/shared/components/info-tooltip.tsx` — deixou de ser específico
 * de card de métrica do dashboard (também usado em daily-budget e balances).
 * Reexporta aqui pra não quebrar `dashboard-metrics-cards.tsx`.
 */
export { InfoTooltip as MetricsCardInfoButton } from "@/shared/components/info-tooltip";
