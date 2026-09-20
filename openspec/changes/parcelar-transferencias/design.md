# Design

## Context

Ver `proposal.md - Why` para a motivação. Hoje:

- Uma transferência é sempre um par de linhas em `transactions` ligadas por `transferId` (uuid gerado em `transferBetweenAccountsAction`, `src/features/accounts/actions.ts:340-452`), sempre `condition: "À vista"`. `updateTransferAction` (linha 454-586) edita as duas pernas em conjunto, localizando a "sibling" via `eq(transactions.transferId, existing.transferId)`, e bloqueia a edição quando qualquer uma das pernas pertence a um empréstimo (`findLoanInstallmentLegs`).
- Despesas/receitas parceladas usam um mecanismo diferente: `buildTransactionRecords` (`src/features/transactions/actions/core.ts:840-929`) gera N linhas independentes compartilhando um `seriesId`. Edição/exclusão em escopo (`current` | `period` | `future` | `all`) é feita por `updateTransactionBulkAction` / `deleteTransactionBulkAction` (`src/features/transactions/actions/bulk-actions.ts`), que filtram por `seriesId` (+ `period` quando aplicável) — ver `core.ts:1023-1036` (`updateBulkSchema`/`deleteBulkSchema`). A UI que deixa o usuário escolher o escopo é `BulkActionDialog` (`src/features/transactions/components/dialogs/bulk-action-dialog.tsx`), com um `RadioGroup` fixo de 4 opções (`current`, `period`, `future`, `all`) — hoje sem nenhuma opção condicional.
- A feature de empréstimos (`src/features/loans/actions.ts:223-359`, `insertLoanSchedule`) já gera N pares de transferência (um `transferId` novo por parcela), mas não usa `seriesId` — as parcelas só se conectam via `loanInstallments.loanId`. Essa implementação não é tocada por esta change.

## Goals / Non-Goals

**Goals:**
- Permitir criar uma transferência em N parcelas mensais, reaproveitando ao máximo os dois mecanismos existentes (`transferId` para a dupla saída/entrada de cada parcela, `seriesId` para ligar as parcelas entre si).
- Reaproveitar o componente e o fluxo de escopo (`current`/`future`/`all`) já usados em despesas/receitas parceladas, mantendo as duas pernas de cada parcela sempre sincronizadas.

**Non-Goals:**
- Migrar a feature de empréstimos para este mecanismo, ou alterar seu cálculo de amortização/juros.
- Suportar transferência parcelada dividida entre múltiplas pessoas (transferências continuam usando sempre o pagador admin).
- Alterar o comportamento de transferências à vista existentes.

## Decisions

**1. Parcelas de transferência compartilham um `seriesId`, cada parcela mantém seu próprio `transferId`.**
Assim como despesas/receitas parceladas, todas as `2N` linhas (N pares saída/entrada) recebem o mesmo `seriesId`. Isso faz os filtros de escopo `future` (`seriesId` + `period >=`) e `all` (`seriesId`) já funcionarem sem alteração, pois ambas as pernas de uma parcela sempre compartilham o mesmo `period`.
*Alternativa considerada*: replicar o padrão do empréstimo (ligação só via uma tabela própria, sem `seriesId`). Rejeitada porque exigiria reimplementar do zero a lógica de escopo já existente em `bulk-actions.ts`.

**2. Escopo "apenas esta parcela" localiza a parcela pelo `transferId`, não pelo `id` da linha clicada.**
`deleteTransactionBulkAction`/`updateTransactionBulkAction` hoje resolvem o escopo `current` como `eq(transactions.id, data.id)` — afeta só a linha exata. Para transferências isso deixaria a outra perna da mesma parcela sem ser atualizada/excluída. A resolução do escopo `current` passa a expandir para `eq(transactions.transferId, existing.transferId)` sempre que a linha alvo for uma perna de transferência (`transactionType === "Transferência" && transferId`).
*Alternativa considerada*: manter `current` restrito à linha única e exigir duas edições manuais (uma por perna). Rejeitada por quebrar a invariante de que as duas pernas de uma transferência sempre espelham uma à outra — a mesma invariante que `updateTransferAction` já garante hoje para transferências à vista.

**3. Escopo "todas as pessoas desta parcela" (`period`) é ocultado no diálogo de escopo para transferências.**
`BulkActionDialog` hoje sempre renderiza as 4 opções (`bulk-action-dialog.tsx:109-183`), sem nenhuma renderização condicional. Como transferências nunca são divididas entre pessoas, essa opção não tem sentido aqui. O componente ganha uma variante (`seriesType: "installment" | "recurring" | "transfer-installment"`, ou um prop booleano equivalente) que omite a opção `period` quando o alvo é uma transferência.

**4. Edição de valor respeita o sinal por perna, não copia o valor literal para as duas linhas.**
`updateTransactionBulkAction` hoje aplica o mesmo conjunto de campos a todas as linhas casadas pelo escopo. Para transferências, o novo valor deve virar `-Math.abs(valor)` na perna de saída e `+Math.abs(valor)` na perna de entrada — mesma convenção já usada em `transferBetweenAccountsAction`/`updateTransferAction`. A conta de cada perna não muda por uma edição de escopo (segue a mesma trava de UX que `updateTransferAction` já aplica: a conta de destino só muda a partir da perna de saída).

**5. Parcelas de empréstimo continuam bloqueadas nas ferramentas gerais de transferência.**
O guard já existente em `updateTransferAction` (`findLoanInstallmentLegs`) se estende ao caminho de edição/exclusão em lote, para que nenhuma parcela de empréstimo seja alcançada por um escopo `future`/`all` de uma transferência comum (na prática, isso não deve ocorrer porque empréstimos não usam `seriesId`, mas o guard evita qualquer regressão futura caso isso mude).

## Risks / Trade-offs

- [Risco] Estender `bulk-actions.ts` (arquivo já extenso) com uma ramificação específica para pernas de transferência aumenta a complexidade do fluxo de escopo → Mitigação: isolar a expansão "escopo → conjunto de linhas casadas, incluindo pernas espelhadas" em uma função auxiliar única, reutilizada pelos 4 ramos de escopo, em vez de duplicar a lógica em cada um.
- [Risco] Aplicar o mesmo payload de atualização a todas as linhas casadas (comportamento atual do bulk edit) quebraria o sinal do valor em transferências se não for tratado → Mitigação: decisão 4 acima; cobrir com teste que edita uma parcela e verifica o sinal das duas pernas.
- [Risco] Duas transferências no mesmo `seriesId` podem, teoricamente, ter vencimentos que caem no mesmo período que outra transferência do usuário — mas como o filtro de escopo já usa `seriesId` (não só `period`), isso não gera colisão.

## Migration Plan

Mudança aditiva: transferências existentes continuam sendo pares únicos "À vista", sem `seriesId`, e não são afetadas. Nenhuma migração de dados é necessária.
