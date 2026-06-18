# Documento de Requisitos Funcionais  
## Aplicação Hotéis e Restaurantes

**Empresa responsável:** Your Lab  
**Tipo de documento:** Conversão de requisitos de stakeholder em requisitos funcionais  
**Versão:** 1.0  
**Objetivo:** Definir de forma simples, clara e mensurável o escopo inicial da aplicação, os requisitos funcionais confirmados e os pontos que ainda precisam ser fechados com o cliente.

---

## 1. Contexto do projeto

A aplicação tem como objetivo criar uma ligação direta entre os hóspedes dos hotéis e os restaurantes associados.

A ideia principal é simples: quando um hóspede estiver hospedado num hotel, ele poderá aceder à aplicação, identificar o hotel onde está, visualizar o restaurante associado e ativar um benefício, como um desconto ou cupão, válido durante a estadia.

O restaurante, por sua vez, poderá validar esse cupão e acompanhar quantos clientes chegaram através dos hotéis. A gestão do grupo poderá visualizar dados gerais de desempenho, como conversão, receita gerada e ranking entre hotéis e restaurantes.

Este documento organiza os pedidos iniciais do cliente e transforma esses pedidos em requisitos funcionais mais objetivos, para orientar o desenvolvimento do MVP da aplicação.

---

## 2. Objetivo da aplicação

A aplicação deve ajudar hotéis e restaurantes a transformar a estadia do hóspede numa oportunidade de consumo dentro dos restaurantes associados.

Na primeira versão, o sistema deve focar-se em três pontos principais:

1. Mostrar ao hóspede o restaurante associado ao hotel onde está hospedado.
2. Permitir que o hóspede gere um cupão ou benefício válido durante a estadia.
3. Permitir que o restaurante valide o cupão e que a gestão acompanhe os principais indicadores.

---

## 3. Escopo do MVP

O MVP deve ser pequeno, direto e suficiente para validar se a solução gera valor real para hotéis, restaurantes e hóspedes.

### 3.1. Incluído no MVP

O MVP inclui:

- aplicação para o hóspede;
- identificação do hotel onde o hóspede está hospedado;
- página inicial com destaque para o hotel e benefício disponível;
- lista de hotéis;
- lista de restaurantes;
- ligação entre hotel e restaurante associado;
- acesso ao site do hotel;
- acesso ao menu digital do restaurante;
- geração de cupão ou benefício;
- apresentação de QR Code para validação;
- painel simples para o restaurante validar cupões;
- painel simples para acompanhar indicadores básicos;
- gestão básica de hotéis, restaurantes e benefícios.

### 3.2. Fora do escopo do MVP

Para manter o projeto controlado e evitar complexidade desnecessária, os seguintes pontos ficam fora da primeira versão:

- pagamento dentro da aplicação;
- reserva de mesa;
- delivery;
- programa de pontos ou fidelização avançada;
- integração obrigatória com sistema de faturação/POS;
- integração obrigatória com todos os sistemas hoteleiros/PMS;
- campanhas avançadas por perfil do hóspede;
- notificações push;
- avaliações ou reviews dos restaurantes;
- chat entre hóspede e restaurante;
- CRM avançado;
- relatórios financeiros complexos;
- gestão completa de menus dentro da aplicação.

Esses pontos podem ser considerados em fases futuras, depois de validar o funcionamento do fluxo principal.

---

## 4. Stakeholders principais

### 4.1. Hóspede

Utilizador final da aplicação. Deve conseguir identificar rapidamente o hotel onde está hospedado, ver o benefício disponível e gerar um cupão para utilizar no restaurante associado.

### 4.2. Restaurante

Utilizador operacional. Deve conseguir validar o cupão apresentado pelo hóspede e acompanhar dados simples sobre os clientes vindos dos hotéis.

### 4.3. Hotel

Origem da estadia do hóspede. O hotel serve como ponto de ativação do benefício e pode estar associado a um ou mais restaurantes.

### 4.4. Gestão do grupo

Utilizador estratégico. Deve conseguir acompanhar dados consolidados, como hóspedes convertidos, receita gerada e desempenho por hotel e restaurante.

### 4.5. Administrador da aplicação

Utilizador responsável por configurar hotéis, restaurantes, benefícios, banners e acessos.

---

## 5. Requisitos originais do cliente

Abaixo estão os pedidos iniciais recebidos, reorganizados de forma mais clara para servirem como base de rastreabilidade.

| ID | Pedido original organizado | Interpretação para o produto |
|---|---|---|
| SO-001 | A Home deve destacar o hotel onde o hóspede está. | A aplicação precisa identificar ou permitir selecionar o hotel ativo do hóspede. |
| SO-002 | A Home deve ter um CTA para ativar benefício no restaurante do hotel. | O hóspede deve ter uma ação principal clara para gerar ou ativar o benefício. |
| SO-003 | A Home deve ter banner dinâmico com campanhas como “15% OFF”. | A aplicação deve permitir destacar campanhas e benefícios ativos. |
| SO-004 | A aplicação deve sugerir outros restaurantes do grupo. | Além do restaurante associado ao hotel, o hóspede deve poder descobrir outros restaurantes. |
| SO-005 | Deve existir uma aba de Hotéis com todos os hotéis. | A aplicação deve listar os hotéis cadastrados. |
| SO-006 | Cada hotel deve ter botão para visitar o site. | O hotel precisa ter um link externo configurável. |
| SO-007 | Cada hotel deve mostrar o restaurante associado. | A relação hotel-restaurante deve ser visível para o hóspede. |
| SO-008 | Deve existir uma aba de Restaurantes. | A aplicação deve listar os restaurantes cadastrados. |
| SO-009 | Cada restaurante deve ter menu digital. | O restaurante deve ter link ou ficheiro de menu acessível. |
| SO-010 | O restaurante do hotel deve permitir gerar cupão. | O benefício principal deve estar ligado ao restaurante associado ao hotel. |
| SO-011 | O hóspede deve fazer login. | O sistema precisa identificar o utilizador antes de liberar benefícios. |
| SO-012 | O sistema deve identificar o hotel manual ou automaticamente. | A estadia pode ser validada por integração futura ou por código/manual no MVP. |
| SO-013 | O cupão deve ser válido apenas durante a estadia. | A regra de validade deve depender de check-in e check-out. |
| SO-014 | O cliente deve mostrar QR Code no restaurante. | O cupão deve gerar uma representação visual validável. |
| SO-015 | O restaurante deve validar o cupão. | O restaurante precisa de painel próprio para validar QR Code ou código. |
| SO-016 | Restaurante deve ver número de clientes vindos do hotel. | O painel deve apresentar quantidade de cupões utilizados. |
| SO-017 | Restaurante deve ver faturação gerada. | O sistema deve permitir registar ou associar valor de faturação ao cupão. |
| SO-018 | Restaurante deve ver taxa de conversão. | O sistema deve calcular relação entre cupões gerados e utilizados. |
| SO-019 | Donos/grupo devem ver dashboard geral. | A gestão precisa de visão consolidada de desempenho. |
| SO-020 | Dashboard deve mostrar percentagem de hóspedes que consumiram. | O sistema deve calcular conversão de hóspedes elegíveis em consumidores. |
| SO-021 | Dashboard deve mostrar receita por hotel e restaurante. | A gestão deve conseguir cruzar origem do hóspede com restaurante utilizado. |
| SO-022 | Dashboard deve mostrar ranking de performance. | O sistema deve comparar hotéis e restaurantes por indicadores principais. |

---

## 6. Requisitos funcionais confirmados

### RF-001 — Login do hóspede

A aplicação deve permitir que o hóspede faça login antes de gerar qualquer benefício.

O login é necessário para que o sistema consiga associar o cupão a um utilizador e evitar uso indevido.

**Origem:** SO-011  
**Critério de aceitação:** o hóspede só pode gerar cupão depois de estar autenticado.

---

### RF-002 — Identificação do hotel do hóspede

A aplicação deve identificar em qual hotel o hóspede está hospedado.

Na primeira versão, essa identificação pode ser feita de forma manual, por código de check-in ou por seleção controlada. A integração automática com sistemas do hotel pode ficar preparada para uma fase futura.

**Origem:** SO-001, SO-012  
**Critério de aceitação:** antes de gerar cupão, o hóspede deve ter um hotel associado à sua sessão ou estadia.

---

### RF-003 — Home com destaque do hotel ativo

A página inicial deve mostrar de forma clara o hotel associado ao hóspede.

Esse destaque ajuda o utilizador a perceber que está no ambiente correto e que o benefício está ligado à sua estadia.

**Origem:** SO-001  
**Critério de aceitação:** a Home deve apresentar o nome do hotel ativo quando o hóspede tiver uma estadia válida.

---

### RF-004 — CTA para ativar benefício

A Home deve ter uma ação principal para o hóspede ativar ou gerar o benefício do restaurante associado ao hotel.

Essa ação deve ser simples e visível, evitando que o hóspede precise procurar o cupão dentro da aplicação.

**Origem:** SO-002, SO-010  
**Critério de aceitação:** a Home deve apresentar um botão principal para gerar ou ativar o benefício disponível.

---

### RF-005 — Banner de benefício ou campanha

A aplicação deve permitir apresentar um banner com o benefício ativo, como por exemplo uma campanha de desconto.

O banner deve ser usado para comunicar rapidamente a vantagem disponível para o hóspede.

**Origem:** SO-003  
**Critério de aceitação:** o sistema deve permitir configurar e apresentar pelo menos um banner ativo na Home.

---

### RF-006 — Lista de hotéis

A aplicação deve ter uma área onde o hóspede possa ver os hotéis cadastrados.

Essa lista ajuda na navegação e também permite apresentar a rede de hotéis envolvida na aplicação.

**Origem:** SO-005  
**Critério de aceitação:** a aba de Hotéis deve apresentar todos os hotéis ativos cadastrados no sistema.

---

### RF-007 — Link para o site do hotel

Cada hotel deve ter um botão ou link para o seu site oficial.

Esse link permite que o hóspede aceda rapidamente a informações externas do hotel.

**Origem:** SO-006  
**Critério de aceitação:** cada hotel ativo deve ter um campo de website configurável e acessível pela aplicação.

---

### RF-008 — Restaurante associado ao hotel

A aplicação deve mostrar qual restaurante está associado a cada hotel.

Essa ligação é importante para que o hóspede saiba onde pode utilizar o benefício principal da sua estadia.

**Origem:** SO-007, SO-010  
**Critério de aceitação:** cada hotel deve poder apresentar pelo menos um restaurante associado.

---

### RF-009 — Lista de restaurantes

A aplicação deve ter uma área com os restaurantes cadastrados.

Essa área deve permitir que o hóspede descubra tanto o restaurante do seu hotel quanto outros restaurantes do grupo.

**Origem:** SO-004, SO-008  
**Critério de aceitação:** a aba de Restaurantes deve apresentar todos os restaurantes ativos cadastrados.

---

### RF-010 — Menu digital do restaurante

Cada restaurante deve disponibilizar acesso ao seu menu digital.

Na primeira versão, esse menu pode ser um link externo ou um ficheiro simples, sem necessidade de uma gestão completa dentro da aplicação.

**Origem:** SO-009  
**Critério de aceitação:** cada restaurante ativo deve ter um botão ou link para o menu digital.

---

### RF-011 — Geração de cupão

A aplicação deve permitir que o hóspede gere um cupão para o restaurante associado ao hotel da sua estadia.

O cupão representa o benefício que será apresentado no restaurante.

**Origem:** SO-010, SO-013, SO-014  
**Critério de aceitação:** o cupão só pode ser gerado se o hóspede estiver autenticado e tiver hotel/estadia válida.

---

### RF-012 — Validade do cupão durante a estadia

O cupão deve ser válido apenas durante o período da estadia do hóspede.

A regra base é: o cupão é ativado no check-in e expira no check-out.

**Origem:** SO-013  
**Critério de aceitação:** depois do check-out, o cupão deve ficar expirado ou indisponível para validação.

---

### RF-013 — QR Code do cupão

Depois de gerar o cupão, a aplicação deve apresentar um QR Code para o hóspede mostrar no restaurante.

O QR Code deve representar o cupão de forma segura e simples de validar.

**Origem:** SO-014  
**Critério de aceitação:** cada cupão gerado deve ter um QR Code único associado.

---

### RF-014 — Login do restaurante

Cada restaurante deve ter acesso próprio ao painel operacional.

Esse acesso deve limitar o restaurante aos seus próprios dados e validações.

**Origem:** SO-015, SO-016, SO-017, SO-018  
**Critério de aceitação:** um utilizador de restaurante deve aceder apenas às informações do restaurante ao qual está associado.

---

### RF-015 — Validação de cupão pelo restaurante

O restaurante deve conseguir validar o cupão apresentado pelo hóspede.

A validação pode ser feita por leitura do QR Code ou por inserção manual de um código, caso necessário.

**Origem:** SO-015  
**Critério de aceitação:** o sistema deve indicar se o cupão está válido, expirado, inválido ou já utilizado.

---

### RF-016 — Controlo de utilização do cupão

O sistema deve controlar se um cupão já foi utilizado.

Essa regra evita que o mesmo benefício seja usado indevidamente mais vezes do que o permitido.

**Origem:** SO-013, SO-015  
**Critério de aceitação:** depois de validado, o cupão deve mudar para o estado “utilizado”, quando a regra for de uso único.

---

### RF-017 — Indicadores do restaurante

O painel do restaurante deve mostrar indicadores simples relacionados aos clientes vindos dos hotéis.

Na primeira versão, o painel deve focar apenas nos dados mais úteis para operação e validação do modelo.

**Origem:** SO-016, SO-017, SO-018  
**Critério de aceitação:** o restaurante deve conseguir ver cupões gerados, cupões utilizados, taxa de conversão e faturação associada.

---

### RF-018 — Registo de faturação associada ao cupão

O sistema deve permitir associar um valor de faturação a um cupão utilizado.

No MVP, esse valor pode ser inserido manualmente pelo restaurante. Integrações automáticas podem ser avaliadas depois.

**Origem:** SO-017, SO-021  
**Critério de aceitação:** um cupão utilizado deve poder ter um valor de receita associado.

---

### RF-019 — Dashboard geral da gestão

A gestão do grupo deve ter acesso a um painel geral com os principais resultados da aplicação.

Esse painel deve ajudar a perceber se a aplicação está realmente a levar hóspedes aos restaurantes.

**Origem:** SO-019, SO-020, SO-021, SO-022  
**Critério de aceitação:** o dashboard deve apresentar indicadores consolidados de conversão, receita e performance.

---

### RF-020 — Conversão de hóspedes em clientes

O sistema deve calcular a percentagem de hóspedes que utilizaram o benefício no restaurante.

Esse indicador mostra se a aplicação está a cumprir o seu objetivo principal.

**Origem:** SO-020  
**Critério de aceitação:** o sistema deve calcular a relação entre hóspedes elegíveis e cupões utilizados.

---

### RF-021 — Receita por hotel e restaurante

O sistema deve permitir analisar a receita gerada por relação entre hotel de origem e restaurante utilizado.

Essa informação ajuda a gestão a perceber quais hotéis geram mais consumo e quais restaurantes convertem melhor.

**Origem:** SO-021  
**Critério de aceitação:** o dashboard deve permitir visualizar receita por hotel e por restaurante.

---

### RF-022 — Ranking de performance

O sistema deve apresentar um ranking simples de desempenho.

O ranking pode considerar métricas como número de cupões utilizados, taxa de conversão e receita gerada.

**Origem:** SO-022  
**Critério de aceitação:** o dashboard deve ordenar hotéis ou restaurantes por pelo menos um indicador de performance.

---

### RF-023 — Gestão de hotéis

O administrador deve conseguir criar, editar, ativar e desativar hotéis.

Essa funcionalidade é necessária para manter a aplicação atualizada sem depender de alterações técnicas.

**Origem:** SO-005, SO-006, SO-007  
**Critério de aceitação:** o administrador deve conseguir gerir nome, imagem, website, estado e restaurante associado de cada hotel.

---

### RF-024 — Gestão de restaurantes

O administrador deve conseguir criar, editar, ativar e desativar restaurantes.

Essa gestão deve permitir controlar quais restaurantes aparecem na aplicação e quais estão associados a hotéis.

**Origem:** SO-004, SO-008, SO-009, SO-010  
**Critério de aceitação:** o administrador deve conseguir gerir nome, imagem, menu digital, estado e hotel associado de cada restaurante.

---

### RF-025 — Gestão de benefícios

O administrador deve conseguir configurar os benefícios disponíveis.

Isso inclui definir o desconto, restaurante aplicável, período de validade e regra de utilização.

**Origem:** SO-002, SO-003, SO-010, SO-013  
**Critério de aceitação:** o administrador deve conseguir criar e editar um benefício sem intervenção técnica.

---

## 7. Tabela geral dos requisitos funcionais

| ID | Requisito funcional | Origem | Estado | Observação |
|---|---|---|---|---|
| RF-001 | Login do hóspede | SO-011 | Confirmado | Necessário para liberar cupões. |
| RF-002 | Identificação do hotel do hóspede | SO-001, SO-012 | Confirmado com detalhe pendente | Falta definir método inicial. |
| RF-003 | Home com destaque do hotel ativo | SO-001 | Confirmado | Parte central da experiência. |
| RF-004 | CTA para ativar benefício | SO-002, SO-010 | Confirmado | Ação principal da Home. |
| RF-005 | Banner de benefício ou campanha | SO-003 | Confirmado | Pode ser simples no MVP. |
| RF-006 | Lista de hotéis | SO-005 | Confirmado | Apenas hotéis ativos. |
| RF-007 | Link para site do hotel | SO-006 | Confirmado | Link externo configurável. |
| RF-008 | Restaurante associado ao hotel | SO-007, SO-010 | Confirmado | Relação central do sistema. |
| RF-009 | Lista de restaurantes | SO-004, SO-008 | Confirmado | Inclui restaurantes do grupo. |
| RF-010 | Menu digital do restaurante | SO-009 | Confirmado | Link ou ficheiro no MVP. |
| RF-011 | Geração de cupão | SO-010, SO-013, SO-014 | Confirmado | Depende de login e hotel ativo. |
| RF-012 | Validade durante a estadia | SO-013 | Confirmado | Check-in ativa, check-out expira. |
| RF-013 | QR Code do cupão | SO-014 | Confirmado | Código único por cupão. |
| RF-014 | Login do restaurante | SO-015 a SO-018 | Confirmado | Acesso restrito por restaurante. |
| RF-015 | Validação do cupão | SO-015 | Confirmado | Via QR Code ou código manual. |
| RF-016 | Controlo de utilização do cupão | SO-013, SO-015 | Confirmado | Evita reutilização indevida. |
| RF-017 | Indicadores do restaurante | SO-016 a SO-018 | Confirmado | Dados operacionais simples. |
| RF-018 | Registo de faturação | SO-017, SO-021 | Confirmado com detalhe pendente | Falta definir se manual ou integrado. |
| RF-019 | Dashboard geral da gestão | SO-019 a SO-022 | Confirmado | Visão consolidada. |
| RF-020 | Conversão de hóspedes em clientes | SO-020 | Confirmado | Métrica principal do produto. |
| RF-021 | Receita por hotel e restaurante | SO-021 | Confirmado | Depende do registo de receita. |
| RF-022 | Ranking de performance | SO-022 | Confirmado | Ranking simples no MVP. |
| RF-023 | Gestão de hotéis | SO-005 a SO-007 | Confirmado | Necessário para administração. |
| RF-024 | Gestão de restaurantes | SO-004, SO-008 a SO-010 | Confirmado | Necessário para administração. |
| RF-025 | Gestão de benefícios | SO-002, SO-003, SO-010, SO-013 | Confirmado | Configuração sem intervenção técnica. |

---

## 8. Requisitos não funcionais mínimos

Estes requisitos não são funcionalidades visíveis diretamente, mas são importantes para que o sistema seja seguro, simples e confiável.

### RNF-001 — Segurança de acesso

Cada tipo de utilizador deve aceder apenas às áreas permitidas.

**Critério:** um restaurante não deve conseguir ver dados de outro restaurante.

---

### RNF-002 — Simplicidade de uso

O fluxo principal deve ser rápido e fácil.

**Critério:** o hóspede deve conseguir gerar um cupão em poucos passos: login, hotel identificado, gerar cupão e apresentar QR Code.

---

### RNF-003 — Rastreabilidade

O sistema deve guardar o histórico das ações principais.

**Critério:** cada cupão deve guardar data de criação, validação, utilização e expiração.

---

### RNF-004 — Desempenho

As principais ações devem responder rapidamente.

**Critério:** geração e validação de cupões devem responder em poucos segundos em condições normais de rede.

---

### RNF-005 — Escalabilidade inicial

A arquitetura deve permitir crescer sem refazer o sistema.

**Critério:** o MVP deve suportar múltiplos hotéis, múltiplos restaurantes e expansão futura para integrações.

---

## 9. Requisitos ainda não clarificados

Estes pontos devem ser fechados em conversa com o cliente antes do desenvolvimento completo.

| ID | Ponto a clarificar | Por que é importante | Decisão necessária |
|---|---|---|---|
| RC-001 | Método de identificação da estadia | Define a complexidade inicial do MVP. | Código manual, seleção controlada, receção ou integração. |
| RC-002 | Tipo de login do hóspede | Afeta UX, segurança e esforço técnico. | Email, telefone, código de reserva ou outro método. |
| RC-003 | Regra de uso do cupão | Evita ambiguidades na validação. | Um por estadia, um por dia ou múltiplos usos. |
| RC-004 | Percentagem do desconto | Define como os benefícios serão configurados. | Desconto fixo, exemplo 15%, ou configurável. |
| RC-005 | Registo da faturação | Afeta dashboards e operação do restaurante. | Manual no MVP ou integração futura. |
| RC-006 | Associação hotel-restaurante | Afeta o modelo de dados e a experiência. | Um restaurante por hotel ou vários restaurantes. |
| RC-007 | Idiomas da aplicação | Afeta interface e conteúdo. | Português apenas ou português/inglês desde o MVP. |
| RC-008 | Validação no restaurante | Afeta operação real no balcão. | Scanner de QR Code, inserção manual ou ambos. |
| RC-009 | Responsável pela configuração | Define permissões administrativas. | Your Lab, cliente, grupo ou cada restaurante. |
| RC-010 | Nome final da aplicação | Afeta identidade visual, domínio e publicação. | Nome comercial a definir. |

---

## 10. Fases sugeridas

### Fase 1 — MVP funcional

Objetivo: validar o fluxo principal.

Inclui:

- login simples;
- identificação manual ou por código do hotel;
- Home com benefício;
- listagem de hotéis e restaurantes;
- geração de cupão;
- QR Code;
- validação pelo restaurante;
- dashboard simples.

### Fase 2 — Operação e automação

Objetivo: reduzir trabalho manual e melhorar dados.

Pode incluir:

- integração com sistema do hotel;
- integração com faturação/POS;
- relatórios exportáveis;
- gestão mais avançada de campanhas;
- melhorias no dashboard.

### Fase 3 — Produto avançado

Objetivo: transformar a aplicação numa plataforma mais completa.

Pode incluir:

- notificações;
- reservas;
- programa de fidelização;
- campanhas segmentadas;
- recomendações personalizadas;
- BI avançado.

---

## 11. Resumo final

A primeira versão da aplicação deve ser simples e focada no fluxo que gera valor direto:

1. o hóspede identifica o hotel;
2. vê o restaurante associado;
3. gera um benefício;
4. apresenta o QR Code;
5. o restaurante valida;
6. a gestão acompanha os resultados.

A recomendação da Your Lab é manter o MVP sem integrações complexas no início, usando validação manual ou por código sempre que possível. Isso reduz o risco técnico, permite testar a aceitação da solução e cria uma base clara para evoluir depois para integrações com sistemas hoteleiros e de faturação.

