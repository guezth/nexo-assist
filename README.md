# Nexo Assist

Agent de atendimento para o service desk de TI da Nexo, feito para o desafio técnico da Beyond the Bytes.

O funcionário conversa com o agent para tirar dúvidas, abrir, atualizar ou reabrir chamados e consultar o andamento deles. O agent decide a ação a cada mensagem, pede confirmação antes de mexer em qualquer chamado e transfere para um analista quando precisa. O analista atende pelo console: assume a conversa (o agent pausa), responde, devolve ao agent ou encerra. Em cada resposta dá para abrir um painel e ver o que o agent entendeu, o que fez, com que segurança e por quê.

## Sumário

1. [Como rodar](#como-rodar)
2. [Visão geral da arquitetura](#visão-geral-da-arquitetura)
3. [Como o agent decide o que fazer](#como-o-agent-decide-o-que-fazer)
4. [Como garanti a qualidade das decisões](#como-garanti-a-qualidade-das-decisões)
5. [Decisões e trade-offs](#decisões-e-trade-offs)
6. [O que faria com mais tempo](#o-que-faria-com-mais-tempo)
7. [Melhorias implementadas](#melhorias-implementadas)
8. [Uso de IA](#uso-de-ia)
9. [Deploy com Docker e Portainer](#deploy-com-docker-e-portainer)

## Como rodar

> **Para entrar:** use qualquer e-mail da tabela de [usuários de exemplo](#usuários-de-exemplo) com a senha **`nexo123`**. Ela é a senha cadastrada no banco; qualquer outra é recusada. Exemplo: `ana.souza@nexo.com.br` / `nexo123` (funcionária) e `rafael.lima@nexo.com.br` / `nexo123` (analista).

Requisitos: **Node 22.13 ou superior** (o Mastra 1.x exige; há um `.nvmrc`) e acesso ao servidor Ollama.

```bash
npm install
cp .env.example .env     # no Windows: copy .env.example .env
npm run dev              # http://localhost:3000
```

O `.env.example` já traz o endereço do Ollama, os dois modelos e as demais variáveis. Em desenvolvimento nada mais precisa ser preenchido (o `SESSION_SECRET` tem um valor provisório, que **não** é aceito em produção).

### Usuários de exemplo

A senha de todos é a cadastrada, `nexo123`: ela fica **no banco**, guardada como hash (scrypt, com sal próprio por pessoa), e é o que o login confere. Qualquer outra senha é recusada.

> **Sobre o enunciado.** O PRD sugere que o login do protótipo aceite os funcionários de exemplo "com qualquer senha". Preferi o caminho mais próximo de um sistema real: as pessoas e as senhas ficam no banco e o login confere o hash cadastrado. O custo é que é preciso usar `nexo123` (indicada acima, na tela de login do README e no formulário da entrega). Aceitar qualquer senha seria uma mudança de poucas linhas em `authenticate` (`src/server/auth/users.ts`), mas deixaria qualquer pessoa entrar como qualquer funcionário ou analista, o que não quero num deploy público.

| Papel | E-mail | Observação |
| --- | --- | --- |
| Funcionária | `ana.souza@nexo.com.br` | Windows 11. Tem chamado vencido (INC-20311) e um resolvido há dias |
| Funcionária | `carla.mendes@nexo.com.br` | Tem chamado resolvido há 4 dias (dá para reabrir) |
| Funcionário | `bruno.tavares@nexo.com.br` | Windows 10; chamado de VPN aberto (serve para testar privacidade) e conversa na fila |
| Funcionário | `fabio.nunes@nexo.com.br` | Chamado resolvido há 8 dias (não dá para reabrir) |
| Outros | `diego.ramos@`, `elisa.prado@`, `gabriela.rocha@` `nexo.com.br` | |
| Analista N2 | `rafael.lima@nexo.com.br` | Suporte N2: atende todos os casos, inclusive os críticos |
| Analista N1 | `juliana.costa@nexo.com.br` | Suporte N1: não assume conversas transferidas como críticas |

Ao abrir o banco pela primeira vez, o sistema cria 7 conversas de exemplo no console (3 na fila, 2 com o agent e 2 resolvidas). Ana, Carla e Bruno já começam transferidos para um analista, então o agent fica mudo para eles até alguém devolver ou encerrar a conversa. Para usar um deles com o agent, entre como Rafael, abra a conversa e clique em **Devolver ao agent** (ou **Encerrar atendimento**, que abre uma sessão nova). Fábio, Gabriela, Diego e Elisa já podem conversar com o agent.

### Níveis de acesso

Cada pessoa tem um nível de acesso cadastrado na tabela `users`, e o servidor o confere **em toda requisição** (o cookie só identifica a pessoa; o nível vem sempre do banco, então um cookie adulterado não sobe de nível). As permissões estão em `src/domain/access.ts`.

| Nível | Área | O que pode |
| --- | --- | --- |
| Funcionário | `/chat`, `/historico`, `/perfil` | Conversar com o agent, ver o histórico e o perfil |
| Suporte N1 | `/console` | Ver as conversas, assumir, responder, devolver ao agent e encerrar, **exceto** assumir as transferidas como críticas |
| Suporte N2 | `/console` | Tudo do N1, mais assumir as conversas críticas |

Funcionário não abre o console e analista não abre o chat: as páginas, as ações e os streams recusam.

### Roteiro para testar

Os passos 2, 4, 5 e 6 supõem a Ana (ou a Carla) já devolvida ao agent, como explicado acima.

1. **Dúvida resolvida pela central de ajuda:** como Fábio, "esqueci minha senha da rede". O agent responde com o artigo KB-003.
2. **Artigo que não se aplica:** como Ana (Windows 11) numa conversa nova, "minha VPN dá erro 809". O artigo KB-001 só vale para Windows 10: o agent explica e segue para abrir um chamado, com perguntas curtas e botões.
3. **Rascunho e confirmação:** responda às perguntas e confira o cartão do rascunho. Só ao clicar em **Confirmar** o chamado nasce.
4. **Duplicidade:** peça para abrir um chamado de "notebook lento depois da atualização do Windows". Existe o INC-20311 aberto: o agent pergunta se é o mesmo problema.
5. **Reabertura:** como Carla, peça para reabrir o INC-20150 (resolvido há 4 dias). Como Fábio, o INC-20255 (há 8 dias) é recusado.
6. **Privacidade:** como Ana, pergunte pelo INC-20402 (é do Bruno): a resposta é a mesma de um chamado que não existe.
7. **Fora de TI:** "quantos dias de férias eu tenho?" é redirecionado.
8. **Transferência:** "quero falar com um analista". Abra o console em outra janela (Rafael), assuma, responda e veja a resposta aparecer para o funcionário em tempo real (SSE). Depois devolva ao agent ou encerre.
9. **Transparência:** em qualquer resposta do agent, clique em **detalhes**. O painel agora mostra também a latência, o modelo usado, os tokens e o custo estimado.
10. **Feedback:** depois de cada resposta do agent, avalie com **Ótimo** ou **Precisa melhorar**.
11. **Nova sessão:** envie 30 mensagens (ou mude `MAX_SESSION_MESSAGES` no código) e veja o botão **Iniciar nova sessão**, que fecha a conversa atual e abre outra.
12. **Histórico:** no menu lateral, acesse **Histórico** para ver todas as conversas passadas e retomar as abertas.
13. **Queda do sistema de chamados:** o sistema legado simulado falha em 10% das chamadas. Com `TICKET_SERVICE_FAILURE_RATE=1` no `.env`, dá para ver as novas tentativas e o aviso. Os chamados agora são persistentes (SQLite).

### Comandos

```bash
npm test           # testes (vitest)
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm run eval       # avaliação com modelo real (5 cenários)
npm run build      # build de produção
```

### Variáveis de ambiente

| Variável | Padrão | Para que serve |
| --- | --- | --- |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Servidor Ollama (sem chave, autorização por IP) |
| `OLLAMA_MODEL_MAIN` | `kimi-k2.6:cloud` | Modelo principal (raciocínio e ferramentas) |
| `OLLAMA_MODEL_FAST` | `gemma4:31b-cloud` | Modelo leve (roteamento e respostas simples) |
| `SESSION_SECRET` | provisório em dev | Assina o cookie de sessão. **Obrigatório em produção**, 32+ caracteres |
| `SESSION_COOKIE_SECURE` | `true` em produção | Use `false` se publicar em HTTP puro |
| `DATABASE_URL` | `file:./data/nexo.db` | Arquivo SQLite das conversas |
| `SEED_DEMO_CONVERSATIONS` | `true` | Cria as conversas de exemplo do console no banco vazio |
| `TICKET_SERVICE_FAILURE_RATE` | `0.1` | Chance de cada chamada derrubar o sistema de chamados simulado |
| `TICKET_SERVICE_OUTAGE_MS` | `3000` | Quanto tempo ele fica fora |
| `TICKET_SERVICE_LATENCY_MIN_MS` / `_MAX_MS` | `80` / `400` | Latência simulada |

## Visão geral da arquitetura

```
Navegador ──► Next.js (App Router)
               ├─ /chat, /perfil, /historico  telas do funcionário
               ├─ /chat/stream (POST)         um turno do agent, em streaming (uma linha JSON por evento)
               ├─ /chat/events (SSE)          notificações push para o funcionário
               ├─ /console                    console do analista (SSE em tempo real)
               ├─ /console/events (SSE)       atualizações em tempo real da lista
               └─ proxy.ts                    redireciona por papel (a sessão é checada de novo nas páginas e nas ações)

src/domain     regras puras, sem I/O: SLA, prioridade, duplicidade, reabertura, transferência,
               montagem da resposta (TurnAssembler) e os tipos que a tela desenha
src/server
  agent/       Mastra: modelos, instruções, ferramentas, confirmação de rascunhos, orquestração do turno
  services/    sistema de chamados (SQLite, com latência e quedas simuladas) e central de ajuda (busca por palavras)
  tickets/     repositório SQLite dos chamados e do histórico de cada um
  push/        notificações SSE para o funcionário (em memória, uma instância)
  conversations/  repositório SQLite das conversas (employee, agent e analista)
  auth/        sessão assinada (HMAC), conferência da senha cadastrada (scrypt), bloqueio por tentativas
  users/       repositório da tabela de pessoas e o seed das pessoas de exemplo
  console/     monta o que o console desenha
src/data/seed  funcionários, 9 artigos e 11 chamados em situações variadas
```

Pontos centrais:

- **Separação de responsabilidades.** A tela só desenha *view models* já formatados (`src/domain/chat.ts`). O agent os produz. O sistema de chamados é uma interface (`TicketService`) com uma implementação simulada, então trocar pelo real não toca no agent.
- **O agent fica dentro de um turno controlado** (`handle-turn.ts`). O turno é quem aplica o limite de mensagens, decide se o agent pode falar, executa confirmações e realiza transferências. O modelo não tem como pular essas regras.
- **Pessoas e acesso.** A tabela `users` guarda nome, e-mail, nível de acesso, departamento, sistema operacional e o hash da senha. O seed cria as 9 pessoas de exemplo na primeira vez que o banco abre. As permissões vêm de `can(nível, capacidade)` em `src/domain/access.ts`, usada por páginas, ações e rotas.
- **Persistência.** SQLite (`@libsql/client`), com migrações por `PRAGMA user_version`. Guarda as mensagens já no formato que a tela desenha, o modo da conversa (agent, analista ou encerrada), quem assumiu, o motivo e o resumo da transferência.
- **Analistas online.** O console avisa o servidor a cada 15 s que está aberto; quem passou de 40 s sem avisar (ou saiu pelo botão Sair) deixa de contar. A tela de login mostra esse número real e o atualiza sozinha.
- **Tempo real.** O funcionário recebe o turno do agent em streaming; enquanto espera um analista, a tela usa SSE (`/chat/events`) com fallback de polling. O console usa SSE (`/console/events`) para atualizações em tempo real. Indicador de "digitando" nos dois lados.

## Como o agent decide o que fazer

Cada mensagem do funcionário passa por este caminho:

1. **Limite e voz.** O servidor conta a mensagem (máximo de 30 por sessão, em uma única instrução SQL, então requisições simultâneas não passam do limite). Se a conversa está com um analista, o agent **não responde**: a mensagem fica para o analista.
2. **Cliques da tela.** Confirmar ou cancelar um rascunho é executado **por código**, sem modelo. Escolher uma opção ou um chamado da lista vira uma mensagem normal.
3. **Roteador (modelo leve, gemma4).** Em menos de 1 s, decide se a mensagem é de TI, social (cumprimento, agradecimento) ou fora do escopo (RH, financeiro, facilities). Nos dois últimos casos, o próprio modelo leve responde. Só se ele tiver confiança de 75% ou mais; qualquer dúvida ou falha segue para o modelo principal.
4. **Agent principal (kimi-k2.6, via Mastra).** Recebe as últimas 24 mensagens (as mais antigas são sumarizadas pelo modelo leve, para manter contexto sem estourar o limite de tokens). Inclui o que a tela mostrou: botões, cartões, rascunhos. O **primeiro passo é obrigatório**: registrar o que entendeu, o que vai fazer, a confiança e o porquê (`record_decision`). Depois usa as ferramentas que precisar, até 8 passos. Se o modelo principal falhar, o sistema tenta o modelo leve; se ambos falharem, transfere automaticamente para um analista:

| Ferramenta | O que faz |
| --- | --- |
| `search_help_center` | Busca artigos (cada um diz para quais sistemas vale) |
| `list_my_tickets`, `get_ticket` | Consulta chamados **da própria pessoa** e mostra cartões; informa se estão vencidos |
| `classify_priority` | Explica a prioridade e o prazo |
| `propose_new_ticket` | Monta o **rascunho** de um chamado novo, depois de checar duplicidade |
| `propose_ticket_update` | Rascunho de informação nova num chamado aberto |
| `propose_ticket_reopen` | Rascunho de reabertura (resolvido há até 7 dias) |
| `ask_options` | Pergunta com botões de resposta rápida |
| `handoff_to_analyst` | Transfere para o suporte N2 com resumo |

5. **Fim do turno.** O texto e os cartões viram uma mensagem, gravada com os passos e a decisão. Se houve transferência, ela é feita **depois** de gravar a resposta, para a linha do tempo sair na ordem certa.

### Quando o agent transfere

A pedido da pessoa, em caso crítico, em chamado vencido (se a pessoa aceitar) e quando não tem segurança (confiança abaixo de 60%). O resumo vai junto e o prazo de retorno é calculado pelo código: 1 hora corrida para crítico, 2 horas úteis nos demais. Um chamado **crítico** é transferido pelo próprio código assim que é criado, sem depender do modelo.

### Transparência

Acima de cada resposta ficam os passos ("consultou seus chamados", "classificou a prioridade"). O botão **detalhes** (no chat e, para o analista, no console) abre um painel lateral com: o que o agent entendeu, o que fez, a confiança (barra e nível), o porquê, **quem decidiu** (modelo principal, modelo leve ou regra do sistema, com o id do modelo), cada consulta com seu detalhe (artigos encontrados e relevância, chamados vistos, prazo, tentativas contra o sistema instável) e as **métricas do turno**: duração, modelo usado, tokens de entrada/saída e custo estimado em USD. O formato é nosso: o protótipo não traz esse painel.

## Como garanti a qualidade das decisões

A ideia central: **o modelo propõe, o código dispõe**. O que não pode errar não foi deixado para o prompt.

| Regra do service desk | Como é garantida |
| --- | --- |
| Confirmar antes de agir | As ferramentas só montam rascunhos. Criar, atualizar ou reabrir é feito pelo código ao clicar em Confirmar, com os dados guardados na mensagem (nunca os que vêm da tela) |
| Privacidade | O id do funcionário vem da sessão assinada e as ferramentas são criadas em volta dele: não existe parâmetro de usuário. Chamado de outra pessoa responde "não encontrado", igual a um que não existe |
| Prioridade (impacto x urgência) | O agent só descreve os fatos (quem é afetado, trabalho parado, compromisso hoje); `classifyPriority` decide, seguindo a tabela do Anexo A |
| Prazos e "vencido" | `src/domain/sla.ts`: 1 h corrida, 4 h úteis, 3 e 5 dias úteis; horário útil seg-sex 8h-18h (UTC-3, sem feriados); o relógio conta da última atualização |
| Sem duplicidade | Antes de qualquer rascunho novo o código procura chamado aberto parecido (mesma categoria, 2 ou mais palavras em comum). O agent só pode ignorar o aviso se a pessoa já o tiver visto e respondido |
| Reabrir só até 7 dias | Regra de domínio, aplicada na ferramenta e no serviço |
| Agent mudo com o analista | `handle-turn.ts` nem chama o modelo |
| Limite de 30 mensagens | Contagem atômica no banco |
| Sistema de chamados instável | 4 tentativas com espera crescente, cada uma visível como passo; se falhar, o rascunho continua aberto |
| Falha do modelo | Se o principal falha, o leve assume; se os dois falham, a conversa é transferida para um analista, com aviso claro (timeout de 90 s por modelo) |
| Conversa encerrada | Somente leitura: o servidor recusa mensagens nela, mesmo vinda do histórico |

**Testes (120, `npm test`).** Os que mais importam não dependem de modelo: injeto um agent falso e verifico as regras em volta dele.

- Privacidade (consulta, listagem, atualização e reabertura de chamado alheio).
- Confirmação (nada é criado sem clique; confirmar duas vezes não duplica; cancelar não toca no sistema).
- Crítico vai direto ao analista; sistema fora do ar mantém o rascunho; agent mudo; limite de 30, inclusive com requisições simultâneas.
- Sistema de chamados persistente (privacidade, atualização, reabertura, status, sequência de códigos). Duplicidade e reabertura. SLA, prioridade, sessão e autenticação. Repositório de conversas, console e persistência após reabrir o arquivo.

**Verificação com o modelo real.** Além dos testes, percorri os casos do roteiro acima no navegador, com o kimi e o gemma de verdade. Isso revelou problemas que os testes não pegariam, e cada um virou correção: o modelo repetia o texto depois dos botões, copiava as notas internas do histórico para as respostas e perguntava de novo quando a pessoa já tinha pedido um analista.

## Decisões e trade-offs

- **Dois modelos.** O modelo leve (gemma) decide em menos de 1 s se vale acionar o principal: assuntos fora de TI e cumprimentos não gastam o modelo caro nem esperam 15 segundos. O kimi, mais lento e mais capaz, fica com o raciocínio e as ferramentas. Em troca, o roteador pode errar; por isso só age com confiança alta e, na dúvida, passa adiante.
- **Mastra 1.x com o AI SDK v6.** O modelo é acessado pelo endpoint compatível com OpenAI do Ollama (`@ai-sdk/openai-compatible`). As ferramentas são tipadas com zod 4 e criadas por turno, em volta do contexto do funcionário.
- **SQLite via `@libsql/client`.** O `better-sqlite3` precisa compilar código nativo; o libsql traz binário pronto e é o que o Mastra usa. Arquivo único, simples de colocar num volume.
- **Login com a senha cadastrada, não com qualquer senha.** Os usuários, os níveis de acesso e os hashes (scrypt, sal por pessoa) ficam na tabela `users`. É uma divergência consciente do PRD, justificada em "Usuários de exemplo". O nível de acesso é lido do banco a cada requisição, então um cookie adulterado não sobe de nível.
- **Busca por palavras na central de ajuda.** Explicável (a relevância aparece no painel) e sem dependência externa. Não entende sinônimos; uma busca semântica entraria no lugar sem mudar quem a chama (`KnowledgeBase`).
- **SSE para tempo real.** O console usa Server-Sent Events (`/console/events`) para atualizações instantâneas. O funcionário usa SSE (`/chat/events`) com fallback de polling a cada 5 s. Mantém o deploy simples sem WebSocket.
- **A confiança vem do próprio modelo.** É um indício, não uma medida calibrada. Por isso as regras importantes (crítico, duplicidade, confirmação) não dependem dela.
- **Chamados persistentes.** O sistema de chamados agora usa SQLite (`tickets` e `ticket_history`), então os dados sobrevivem a reinicializações.
- **Sumarização de histórico.** Conversas longas têm as mensagens mais antigas sumarizadas pelo modelo leve antes de serem enviadas ao principal, mantendo contexto sem estourar o limite de tokens.

Pontos conhecidos:

- Uma resposta com ferramentas leva de 15 a 20 segundos com o kimi. Os passos aparecem ao vivo, mas é o ponto mais lento.
- A mensagem enviada conta no limite de 30 mesmo quando o modelo falha.
- O link de "Redefinir senha" no perfil é simulado (não há serviço de e-mail), e "Alterada há N dias" vem dos dados de exemplo.
- O protótipo foi seguido por medidas (a comparação foi feita pelas dimensões e espaçamentos dos quadros, não lado a lado); o ícone da marca ficou inteiro, onde o protótipo recorta um pouco.

## O que faria com mais tempo

- **Latência do agent:** menos idas e voltas ao modelo (ferramentas que já devolvam o contexto), cache de consultas dentro do turno e teste de modelos mais rápidos para o passo de decisão.
- **Busca semântica** na central de ajuda, com a relevância no painel.
- **Feriados** no cálculo de prazo SLA.
- **Acessibilidade e responsivo** do console, hoje pensado para desktop.
- **WebSocket** como alternativa ao SSE para cenários de maior escala.

## Melhorias implementadas

Além do escopo original, foram implementadas as seguintes melhorias:

| # | Melhoria | Commit |
|---|----------|--------|
| 1 | **Fallback para modelo leve:** se o modelo principal falha, o sistema tenta o modelo leve; se ambos falharem, transfere automaticamente para um analista | `20c4ce5` |
| 2 | **Nova sessão após limite:** ao atingir 30 mensagens, o funcionário pode iniciar uma nova sessão sem perder o histórico | `f64169a` |
| 3 | **Métricas por turno:** cada turno registra duração, modelo usado, tokens e custo estimado (USD), exibidos no painel de transparência | `8364a36` |
| 4 | **Sumarização de histórico:** mensagens além das últimas 24 são sumarizadas pelo modelo leve antes de enviar ao principal | `8e8e2bc` |
| 5 | **Feedback do funcionário:** botões "Ótimo" e "Precisa melhorar" em cada resposta do agent, com persistência no banco | `4778cb6` |
| 6 | **Avaliação com modelo real:** `npm run eval` executa 5 cenários contra os modelos reais para detectar regressões | `351bb45` |
| 7 | **Indicador de "digitando":** o funcionário vê quando o analista está digitando; o console mostra quando o colega digita | `18aa071` |
| 8 | **Console em tempo real:** SSE (`/console/events`) substitui o polling de 5s na lista de conversas | `1b16ce7` |
| 9 | **Histórico de conversas:** página `/historico` permite ao funcionário ver e retomar conversas passadas | `05af7ec` |
| 10 | **Tickets persistentes:** sistema de chamados agora usa SQLite em vez de memória, com seed automático de demo | `19f5472` |
| 11 | **Notificações push:** SSE (`/chat/events`) notifica o funcionário em tempo real quando o analista envia mensagem ou assume a conversa | `bc30b64` |
| 12 | **Refatorações SOLID:** extração do hook `useChat` (SRP), interfaces especializadas para `ConversationRepository` (ISP) e abstração `AgentPort` (DIP) | `fd897aa`, `8eaa839`, `67a1e6a` |

## Uso de IA

O projeto foi desenvolvido com o Claude Code, em passos pequenos acompanhados e testados pelo autor, que fez os commits. A IA escreveu a maior parte do código e dos testes sob direção do autor, que definiu a stack, os modelos, as regras e a ordem do trabalho, e revisou o resultado. Alguns exemplos do que mudou por causa dessa revisão: ids numéricos com código de exibição separado, regra de "há 6 dias" nos dados de exemplo, a decisão de executar confirmações por código, e a verificação de cada tela contra o protótipo.

No produto, a IA aparece de dois modos: os modelos do Ollama (gemma4 e kimi-k2.6) que conversam com o funcionário, e o Mastra, que orquestra as ferramentas.

## Deploy com Docker e Portainer

O repositório traz um `Dockerfile` (3 estágios, Node 22, usuário sem privilégios, healthcheck) e um `docker-compose.yml`.

### Com docker compose

```bash
export SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
export OLLAMA_BASE_URL=http://SEU_SERVIDOR:11434
docker compose up -d --build        # http://localhost:3000
```

As conversas ficam no volume `nexo-data` e sobrevivem a novos deploys. Se publicar atrás de HTTPS, defina também `SESSION_COOKIE_SECURE=true`.

### Com Portainer

1. **Stacks > Add stack > Repository**, apontando para este repositório (arquivo `docker-compose.yml`).
2. Em **Environment variables**, preencha `SESSION_SECRET` (32+ caracteres) e `OLLAMA_BASE_URL`. As demais têm padrão.
3. Faça o deploy e acesse a porta publicada (`PORT`, padrão 3000).

O Ollama autoriza por IP: o IP do servidor onde o Portainer roda precisa estar liberado.

Para limitar o uso em um deploy público, mantenha as contas de exemplo (o limite de 30 mensagens por sessão já controla o custo) e considere um proxy reverso com limite de requisições.
