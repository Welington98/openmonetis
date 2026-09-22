# Tasks

## 1. Geração da transferência parcelada

- [x] 1.1 Adicionar campos de parcelamento (`condition`, `installmentCount`, `installmentIntervalMonths`) ao `transferSchema` em `src/features/accounts/actions.ts`, validando que `installmentCount >= 1`; verificar com teste unitário que `installmentCount: 1` cai no fluxo "à vista" existente
- [x] 1.2 Extrair o loop de geração de parcelas (baseado em `insertLoanSchedule`, `src/features/loans/actions.ts:223-359`) para uma função reutilizável que, dado valor/data/contas/quantidade de parcelas, gera N pares de linhas (`transferId` novo por par) todos com o mesmo `seriesId`; verificar com teste unitário que N=3 gera 6 linhas com 3 `transferId`s distintos e 1 `seriesId` comum
- [x] 1.3 Atualizar `transferBetweenAccountsAction` para usar a função do 1.2 quando `condition === "Parcelado"`, mantendo o caminho atual para transferências à vista; verificar criando uma transferência parcelada via action e conferindo as linhas geradas no banco
- [x] 1.4 Calcular a data de vencimento de cada parcela com `installmentIntervalMonths` (mesma lógica de `addMonthsToPeriod` usada em `buildTransactionRecords`); verificar que a parcela N tem vencimento N-1 meses após a primeira

## 2. Formulário de transferência

- [x] 2.1 Adicionar campo de condição (à vista/parcelado) e quantidade de parcelas em `src/features/accounts/components/transfer-dialog.tsx`, escondendo o campo de parcelas quando "à vista" estiver selecionado; verificar manualmente no navegador que o formulário envia `installmentCount` corretamente
- [x] 2.2 Exibir um resumo do parcelamento no formulário (ex: "3x de R$ 100,00, primeira em dd/mm"); verificar visualmente com 1, 2 e 12 parcelas

## 3. Edição e exclusão em escopo

- [x] 3.1 Estender a resolução do escopo `current` em `deleteTransactionBulkAction`/`updateTransactionBulkAction` (`src/features/transactions/actions/bulk-actions.ts`) para casar pelo `transferId` (não só `id`) quando a linha alvo for uma perna de transferência (`transactionType === "Transferência"`); verificar com teste que excluir "apenas esta parcela" remove as duas pernas daquela parcela e nenhuma outra
- [x] 3.2 Ajustar o payload de `updateTransactionBulkAction` para aplicar o valor com o sinal correto por perna (saída negativa, entrada positiva) em vez do mesmo valor literal nas duas linhas; verificar com teste que editar o valor de uma parcela mantém uma perna negativa e outra positiva
- [x] 3.3 Reaproveitar o guard `findLoanInstallmentLegs` (já usado em `updateTransferAction`) no caminho de edição/exclusão em lote, rejeitando a operação se qualquer linha casada pertencer a uma parcela de empréstimo; verificar com teste que a ação retorna erro nesse caso
- [x] 3.4 Adicionar a variante `transfer-installment` (ou prop equivalente) ao `BulkActionDialog` (`src/features/transactions/components/dialogs/bulk-action-dialog.tsx`) que omite a opção "todas as pessoas desta parcela"; verificar visualmente que o diálogo mostra só 3 opções (esta parcela / esta e as futuras / todas) ao editar/excluir uma parcela de transferência
- [x] 3.5 Ligar o fluxo de edição/exclusão de transferência em `transactions-page.tsx` para abrir o `BulkActionDialog` (variante 3.4) quando o lançamento clicado for uma transferência com `seriesId`; verificar manualmente editando e excluindo parcelas nos três escopos

## 4. Cobertura e regressão

- [x] 4.1 Rodar `pnpm exec tsc --noEmit` e `pnpm run lint` e corrigir eventuais erros introduzidos
- [x] 4.2 Rodar a suíte de testes existente de transferências e empréstimos (`pnpm run test`, ou o comando de teste equivalente do projeto) e confirmar que nada relacionado a transferência à vista ou parcelas de empréstimo quebrou
