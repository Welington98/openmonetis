# Spec Delta

## Purpose

Cobre a transferência de valores entre contas do usuário, incluindo transferências à vista e transferências parceladas em múltiplas datas futuras.

## ADDED Requirements

### Requirement: Transferência à vista entre contas
O sistema SHALL permitir que o usuário registre uma transferência de um valor entre duas contas financeiras suas, criando dois lançamentos ligados (uma saída na conta de origem e uma entrada na conta de destino) com o mesmo valor absoluto, mesma data e mesmo período.

#### Scenario: Transferência simples entre duas contas
- **WHEN** o usuário informa conta de origem, conta de destino, valor, data e não seleciona parcelamento
- **THEN** o sistema cria um lançamento de saída na conta de origem e um lançamento de entrada na conta de destino, ambos vinculados como uma única transferência

#### Scenario: Origem e destino iguais são rejeitados
- **WHEN** o usuário seleciona a mesma conta como origem e destino
- **THEN** o sistema rejeita a operação com uma mensagem informando que as contas devem ser diferentes

### Requirement: Transferência parcelada entre contas
O sistema SHALL permitir que o usuário registre uma transferência dividida em várias parcelas mensais, gerando uma transferência (saída + entrada) por parcela, cada uma com sua própria data de vencimento.

#### Scenario: Criação de transferência em N parcelas
- **WHEN** o usuário informa conta de origem, conta de destino, valor da parcela, data da primeira parcela e uma quantidade de parcelas maior que 1
- **THEN** o sistema cria N transferências (uma por parcela), cada uma com seu próprio par de lançamentos (saída/entrada), com vencimentos mensais consecutivos a partir da data informada
- **AND** todas as parcelas dessa transferência ficam identificáveis como pertencentes à mesma série

#### Scenario: Quantidade de parcelas mínima
- **WHEN** o usuário informa 1 parcela (ou não seleciona parcelamento)
- **THEN** o sistema trata a transferência como uma transferência à vista comum (um único par de lançamentos)

### Requirement: Edição de uma transferência parcelada
O sistema SHALL permitir que o usuário escolha o alcance da edição ao alterar uma transferência que faz parte de uma série parcelada: apenas aquela parcela, aquela parcela e as futuras, ou todas as parcelas da série. Em qualquer alcance, os dois lançamentos (saída e entrada) de cada parcela afetada permanecem sincronizados em valor, data e período.

#### Scenario: Editar apenas a parcela atual
- **WHEN** o usuário edita uma parcela de uma transferência parcelada e escolhe o alcance "apenas esta parcela"
- **THEN** somente os dois lançamentos (saída e entrada) daquela parcela são atualizados, e as demais parcelas da série permanecem inalteradas

#### Scenario: Editar esta parcela e as futuras
- **WHEN** o usuário escolhe o alcance "esta e as próximas parcelas"
- **THEN** os lançamentos (saída e entrada) da parcela atual e de todas as parcelas com vencimento posterior são atualizados; as parcelas anteriores permanecem inalteradas

#### Scenario: Editar todas as parcelas
- **WHEN** o usuário escolhe o alcance "todas as parcelas"
- **THEN** os lançamentos (saída e entrada) de todas as parcelas da série são atualizados

#### Scenario: Alcance por pessoa não se aplica
- **WHEN** o usuário edita uma parcela de uma transferência
- **THEN** o sistema não oferece a opção de alcance "todas as pessoas desta parcela", pois transferências não são divididas entre pessoas

### Requirement: Exclusão de uma transferência parcelada
O sistema SHALL permitir que o usuário escolha o alcance da exclusão ao remover uma transferência que faz parte de uma série parcelada: apenas aquela parcela, aquela parcela e as futuras, ou todas as parcelas da série. Em qualquer alcance, os dois lançamentos de cada parcela removida são excluídos juntos.

#### Scenario: Excluir apenas a parcela atual
- **WHEN** o usuário exclui uma parcela e escolhe o alcance "apenas esta parcela"
- **THEN** os dois lançamentos (saída e entrada) daquela parcela são removidos, e as demais parcelas da série permanecem

#### Scenario: Excluir esta parcela e as futuras
- **WHEN** o usuário escolhe o alcance "esta e as próximas parcelas"
- **THEN** os lançamentos (saída e entrada) da parcela atual e de todas as parcelas futuras são removidos

#### Scenario: Excluir todas as parcelas
- **WHEN** o usuário escolhe o alcance "todas as parcelas"
- **THEN** os lançamentos (saída e entrada) de todas as parcelas da série são removidos

### Requirement: Transferências de empréstimo não são afetadas
O sistema SHALL continuar impedindo a edição ou exclusão de transferências vinculadas a um empréstimo através das ferramentas gerais de transferência, direcionando o usuário para a tela do empréstimo.

#### Scenario: Tentativa de editar parcela de empréstimo pela transferência
- **WHEN** o usuário tenta editar ou excluir, pelas ações gerais de transferência, um lançamento que é parcela de um empréstimo
- **THEN** o sistema rejeita a operação e informa que parcelas de empréstimo têm ferramentas próprias de edição
