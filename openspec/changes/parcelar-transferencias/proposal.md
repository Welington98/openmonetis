# Proposal

## Why

Hoje toda transferência entre contas é sempre criada como um único par de lançamentos "À vista" (`transferBetweenAccountsAction`, `src/features/accounts/actions.ts:340-452`) — não existe opção de parcelamento, diferente do que já acontece para despesas e receitas comuns (`condition: "Parcelado"`). Isso obriga o usuário a criar manualmente uma transferência por parcela quando precisa enviar um valor grande de forma escalonada entre contas (ex: repasse combinado em parcelas, acerto entre pessoas fora do fluxo de empréstimo). A própria feature de empréstimos (`src/features/loans/actions.ts:223-359`) já resolve um problema equivalente — gera um novo par de transferência por parcela — mas com uma implementação própria e paralela, sem reaproveitar o mecanismo de série (`seriesId`) usado pelas parcelas de despesa/receita.

## What Changes

- Adicionar a opção de parcelamento (`condition: "Parcelado"`, quantidade de parcelas, intervalo) ao formulário de transferência entre contas (`transfer-dialog.tsx`).
- Ao confirmar uma transferência parcelada, gerar N pares de lançamentos (saída + entrada), um par por parcela, cada par com seu próprio `transferId`, todos os pares agrupados por um `seriesId` compartilhado — mesmo padrão já usado em despesas/receitas parceladas (`buildTransactionRecords`, `src/features/transactions/actions/core.ts:887-929`).
- Cada parcela mantém `installmentCount`/`currentInstallment` e a data de vencimento calculada por `installmentIntervalMonths`, replicando o comportamento já existente para despesas/receitas.
- Editar ou excluir uma transferência que faz parte de uma série parcelada deve deixar claro para o usuário se a ação afeta só aquela parcela ou a série (mesma decisão de escopo já enfrentada por `updateTransferAction`, que hoje só sabe lidar com pares "à vista"); o comportamento exato fica detalhado em `design.md`.
- Fora de escopo: qualquer mudança no fluxo de empréstimos (`loans`) — a feature de empréstimos continua com sua própria implementação de amortização/juros e não é migrada para este mecanismo nesta change.

## Capabilities

### New Capabilities
- `transfers`: transferência entre contas, incluindo a condição "À vista" já existente e a nova condição "Parcelado" (parcelamento em N transferências futuras ligadas por série).

### Modified Capabilities
(nenhuma — não há spec existente para a capacidade de transferências; esta change a introduz do zero)

## Impact

- `src/features/accounts/actions.ts` — `transferSchema`, `transferBetweenAccountsAction`, `updateTransferAction`.
- `src/features/accounts/components/transfer-dialog.tsx` — novo campo de parcelamento no formulário.
- `src/shared/lib/transfers/constants.ts` — rótulos/constantes reaproveitadas para cada parcela.
- Tabela `transactions` (`src/db/schema.ts`) — reaproveita colunas já existentes (`seriesId`, `installmentCount`, `currentInstallment`, `installmentIntervalMonths`, `transferId`); nenhuma coluna nova esperada.
- Não afeta `src/features/loans/*` (fluxo de empréstimo permanece independente).
