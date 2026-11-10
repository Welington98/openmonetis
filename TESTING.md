# Testes

O projeto tem três camadas de teste, com papéis diferentes. Nenhuma delas
substitui as outras: lint, typecheck e build são verificações complementares,
não testes de comportamento.

| Camada | Comando | Precisa de banco? | O que prova |
| --- | --- | --- | --- |
| Unitária | `pnpm test` | não | Regras puras em `src/**/lib/**` |
| Cobertura | `pnpm test:coverage` | não | Piso mínimo de cobertura da suíte unitária |
| Integração | `pnpm test:integration` | sim (PostgreSQL) | Persistência, ownership e conservação de valores |
| Migrations | `pnpm db:migrations:check` | não | Histórico forward-only e migrations imutáveis |

## Suíte unitária

```bash
pnpm test
```

Roda com Vitest apenas arquivos `*.test.ts` dentro de `src/**/lib/**` (ver
`vitest.config.ts`). O contrato é simples: essas funções não tocam banco,
Next.js nem React — são cálculo puro, testável sem infraestrutura.

Ao adicionar um teste, prefira resultados observáveis: conservação de
centavos, fronteiras de período, transições de estado, rejeições. Um arquivo
de teste por módulo não significa cobertura das suas ramificações.

## Cobertura

```bash
pnpm test:coverage
```

O piso fica em `vitest.config.ts` (`coverage.thresholds`) e é medido **somente
sobre o que a suíte unitária carrega** — não é a cobertura do sistema inteiro.
O CI falha abaixo do piso. Ajuste os números apenas para cima; reduzir exige
justificativa no PR.

O relatório HTML sai em `coverage/index.html` e o resumo em
`coverage/coverage-summary.json` (publicado como artefato no CI).

## Suíte de integração

```bash
pnpm docker:db          # PostgreSQL local (porta 5432)
pnpm test:integration
```

`src/test/integration/global-setup.ts` cria um banco descartável
(`openmonetis_test_*`), aplica o schema e o apaga ao final. O schema é aplicado
com `drizzle-kit push --force` — o mesmo caminho do `docker-entrypoint.sh` —
para o teste rodar contra exatamente o schema que a aplicação usa.

Para apontar para outro servidor de teste, defina `TEST_DATABASE_URL` com uma
conexão ao banco de manutenção (normalmente `postgres`). A suíte recusa
`NODE_ENV=production`, aponta para host remoto sem `TEST_DATABASE_URL`
explícito, e nunca opera em banco sem o prefixo `openmonetis_test_`.

Cada teste limpa as tabelas do schema `public` no `beforeEach` (ver
`src/test/integration/harness.ts`), então os cenários não compartilham estado.
Os arquivos rodam em sequência (`fileParallelism: false`) porque compartilham
o mesmo banco temporário.

Cobertura atual:

- **ownership** — conta, pessoa e categoria de outro usuário são recusadas sem
  gravar nada; consultas escopadas por `userId` não vazam dados;
- **transferência** — um par de lançamentos opostos por parcela, vinculados
  pelo mesmo `transferId`, com saldo líquido zero e períodos mensais; conta de
  outro usuário e transferência para a mesma conta são recusadas.

As Server Actions chamam `revalidatePath`/`revalidateTag`, que lançam fora de
uma requisição do Next. Nos testes essas funções viram no-op via alias de
`next/cache` em `vitest.integration.config.ts`.

Falta cobrir (próximos passos, ver sprint 2): liquidação e estorno de fatura,
concorrência de saldo (duas transferências disputando a mesma conta) e upgrade
de migration com dados reais.

## Histórico de migrations

```bash
pnpm db:migrations:check          # valida
pnpm db:migrations:check --update # grava o hash de migrations novas
```

`scripts/validate-migrations.mjs` congela o conteúdo das migrations publicadas
em `drizzle/meta/migrations.lock.json` (hash SHA-256) e exige que migrations
novas sejam incrementais (`idx` contíguo, timestamp crescente). Editar ou
remover um arquivo já publicado falha o CI.

O histórico anterior a `0058_previsao_diario_itens` tem dívida conhecida e
está explicitado no lock:

- 4 arquivos `.sql` fora do journal (`0024`–`0027`), listados em
  `knownOrphans`;
- `idx` com buracos e dois timestamps fora de ordem.

Esses pontos **não são corrigidos reescrevendo o passado** — isso poderia
invalidar bancos existentes. A regra vale daqui para frente. Quando a
aplicação migrar de `drizzle-kit push` para `drizzle-kit migrate` em produção,
essa dívida precisa ser resolvida com uma baseline e um teste de upgrade.
