# Lanima

Planner de estudos de Biomedicina, instalável como app (PWA) no Galaxy Tab, no iPad, em celulares e no computador. Custo zero: Vercel Hobby + Supabase Free + planos gratuitos de IA.

> **Estado atual: Fase 4 concluída (modo foco: cronômetro, temas, sons, tela acesa, aviso do fim e registro das sessões); Fase 5 (arquivos) em andamento.** Fase 3: Matérias com cor, ícone e aulas da semana, conteúdo do plano de ensino (importar, marcar, reordenar), avaliações com contagem regressiva, metas do dia com as atrasadas no topo, Início com métricas, busca e próxima prova. Fase 2: login por e-mail (link e código) ou Google, onboarding e perfil. Fase 1: sistema visual, AppShell, temas e PWA. As próximas fases estão em `PROMPT_CLAUDE_CODE.md`, seção 10.

## Rodar no computador

Requisitos: Node.js 22 ou mais recente, npm e o [Docker Desktop](https://www.docker.com/products/docker-desktop/) aberto (para o Supabase local).

```bash
npm install
cp .env.example .env.local   # e preencha com os valores do Supabase local (abaixo)
npm run db:start             # sobe o Supabase local: banco, login, arquivos e caixa de e-mail
npm run dev                  # http://localhost:3000 (sem service worker em desenvolvimento)
```

O `npm run db:start` mostra a **API URL** e a **Publishable key** locais: copie para `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` no `.env.local` (`npx supabase status` mostra de novo). Esses valores locais são padrão do CLI e só funcionam no seu computador.

- **E-mails de login no computador:** nenhum e-mail sai de verdade. Eles aparecem no Mailpit, em http://127.0.0.1:54324.
- **Usuária de exemplo:** `maria@lanima.test`, com as matérias dos mockups (`supabase/seed.sql`). Peça o código em /entrar e abra o Mailpit.
- **Painel do banco:** Supabase Studio em http://127.0.0.1:54323.
- `npm run db:reset` apaga o banco local e roda de novo as migrações e o seed. `npm run db:stop` desliga tudo.

Para testar o PWA de verdade (service worker, modo offline), use o build de produção:

```bash
npm run build
npm run start        # http://localhost:3000
```

### Scripts

| Script                            | O que faz                                                                                                                                                |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                     | Servidor de desenvolvimento                                                                                                                              |
| `npm run build` / `npm run start` | Build e servidor de produção                                                                                                                             |
| `npm run lint`                    | ESLint                                                                                                                                                   |
| `npm run typecheck`               | Gera os tipos de rota do Next e roda o `tsc`                                                                                                             |
| `npm run test`                    | Testes unitários (Vitest + Testing Library)                                                                                                              |
| `npm run test:e2e`                | Faz o build de produção, sobe o `next start` (service worker ativo) e roda o E2E: iPad Pro 11 e iPhone 16 no WebKit; Galaxy Tab S9 e Pixel 7 no Chromium |
| `npm run test:e2e:chromium`       | O mesmo, com os perfis do iPad e do iPhone no Chromium (veja a nota sobre Windows abaixo)                                                                |
| `npm run format`                  | Prettier                                                                                                                                                 |
| `npm run icons`                   | Gera os ícones do PWA em `public/icons` a partir do logo                                                                                                 |
| `npm run db:start` / `db:stop`    | Liga e desliga o Supabase local (Docker)                                                                                                                 |
| `npm run db:reset`                | Recria o banco local: migrações + `supabase/seed.sql`                                                                                                    |
| `npm run db:types`                | Gera `lib/supabase/database.types.ts` a partir do banco local                                                                                            |
| `npm run test:db`                 | Testes de RLS (pgTAP) no banco local: uma usuária não lê nem altera os dados de outra                                                                    |
| `npm run check`                   | Lint + typecheck + testes unitários                                                                                                                      |

Na primeira vez, instale os navegadores do Playwright: `npx playwright install chromium webkit`.

O E2E usa sempre o **Supabase local** (precisa do `npm run db:start` antes) e nunca um projeto hospedado: ele cria contas de teste, lê os e-mails no Mailpit e confere o banco direto.

> **Windows + Docker Desktop:** na máquina de desenvolvimento, uma parte pequena dos pedidos ao Supabase local (cerca de 4% sob a carga da suíte) fica parada entre o Windows e a porta do Docker: o Kong registra `499` (o cliente desistiu) e o serviço de login nunca recebe o pedido, enquanto centenas de pedidos isolados, do navegador e do Node, respondem em ~15 ms. No E2E local isso aparece como timeouts aleatórios em testes que falam com o Supabase. O CI (Linux) é a referência; localmente, rode de novo só o teste que falhou para confirmar.

> **Windows:** alguns antivírus bloqueiam o executável do WebKit do Playwright (`Playwright.exe`, erro `EPERM`). Nesse caso, rode `npm run test:e2e:chromium` localmente: ele usa a tela, o toque e o user agent do iPad e do iPhone no Chromium. O WebKit de verdade roda no GitHub Actions a cada push. O E2E nunca reaproveita um servidor já aberto: se a porta 3100 estiver ocupada, ele falha em vez de testar o servidor errado.

> **Por que `127.0.0.1` e não `localhost` no E2E:** no Windows, `localhost` resolve primeiro para `::1`. Na máquina de desenvolvimento, as conexões locais por esse caminho eram interceptadas (provavelmente pela proteção web do antivírus): os pedidos chegavam ao `next start` 10 a 30 s atrasados, ou nunca chegavam, enquanto o servidor respondia em milissegundos. Com `127.0.0.1`, a mesma suíte passou em 6 de 6 rodadas. Para testar um servidor já aberto (por exemplo, ligado há muito tempo), use `E2E_BASE_URL=http://127.0.0.1:<porta> npx playwright test`.

## Página de componentes

`/design` mostra todos os componentes-base lado a lado nos temas claro e escuro. Os mockups aprovados ficam em `design-reference/` (só leitura).

## Publicar na Vercel Hobby (grátis)

1. Crie um repositório no GitHub e envie o projeto (`git push`).
2. Entre em [vercel.com](https://vercel.com) com a conta do GitHub, no plano **Hobby** (gratuito, uso pessoal e não comercial).
3. **Add New → Project**, escolha o repositório e clique em **Deploy**. A Vercel detecta o Next.js sozinha; não precisa mudar nenhuma configuração.
4. Ao terminar, a Vercel mostra o endereço `https://<nome>.vercel.app`. Cada `git push` na branch `main` publica de novo.

Antes do primeiro deploy da Fase 2, crie o projeto no Supabase (próxima seção) e cadastre em **Project → Settings → Environment Variables**:

| Variável                               | Valor                                                                         |
| -------------------------------------- | ----------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Supabase → Project Settings → Data API → Project URL                          |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API Keys → Publishable key (`sb_publishable_…`) |
| `NEXT_PUBLIC_AUTH_PROVIDERS`           | Botões sociais ativos (`google,notion`; seção abaixo); vazio, só e-mail       |

Depois de mudar variáveis, faça **Deployments → ⋯ → Redeploy**: as `NEXT_PUBLIC_*` entram no código no momento do build.

## Supabase grátis (projeto de verdade)

### 1. Criar o projeto

1. Entre em [supabase.com](https://supabase.com) com a conta do GitHub e crie uma organização no plano **Free**.
2. **New project**: nome `lanima`, uma senha forte para o banco (guarde num gerenciador de senhas) e a região **South America (São Paulo)**.
3. Em **Project Settings → API Keys**, copie a **Publishable key**; em **Data API**, a **Project URL**. Elas vão para a Vercel (seção anterior) e, se quiser testar o app local contra o projeto real, para o `.env.local`.

### 2. Rodar as migrações

No computador, na pasta do projeto:

```bash
npx supabase login                          # abre o navegador para autorizar o CLI
npx supabase link --project-ref <ref>       # <ref> é o código em https://supabase.com/dashboard/project/<ref>
npx supabase db push --remote               # cria tabelas, RLS e o bucket "avatars" NO PROJETO HOSPEDADO
npx supabase migration list --remote        # confira: as migrações aparecem na coluna Remote
```

> **Atenção ao `--remote`:** no CLI 3.x, `db push`, `migration list` e outros comandos de banco falam com o Supabase **local** por padrão (a primeira linha da saída mostra o alvo: `Target: local stack…`). Sem `--remote`, as tabelas são criadas só no seu computador e o app publicado recebe `404` ao buscar o perfil.

O `seed.sql` (dados de exemplo) **não** vai para o projeto real. A cada fase nova, rode `npx supabase db push --remote` de novo.

Contas criadas **antes** das migrações chegarem ao projeto ficam sem perfil (o app mostra "Não foi possível carregar seu perfil" com o código `406 · PGRST116`). A migração `…_backfill_profiles.sql` cria esses perfis no próximo `db push --remote`. Se precisar resolver na hora, pelo **SQL Editor**:

```sql
insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;
```

### 3. Configurar o login

Em **Authentication → URL Configuration**:

- **Site URL:** `https://<seu-app>.vercel.app`
- **Redirect URLs:** `https://<seu-app>.vercel.app/callback` (e `http://localhost:3000/callback`, se for testar local contra o projeto real)

Em **Authentication → Emails → Templates**, nos modelos **Magic Link** e **Confirm signup**:

- **Assunto:** `Seu acesso ao Lanima`
- **Corpo:** cole o conteúdo de `supabase/templates/magic-link.html`. Ele traz o link **e** o código numérico. O código é o que funciona no iPhone e no iPad com o app instalado, porque o app instalado não compartilha o login com o Safari.

Em **Authentication → Providers → Email**, use **6** dígitos em Email OTP Length (o app aceita de 6 a 10, mas 6 é o mais fácil de digitar).

### 4. E-mail de verdade (SMTP gratuito)

O envio de e-mail que vem com o Supabase é só para testes: manda pouquíssimos e-mails por hora e só para os endereços da equipe do projeto. Para outras pessoas conseguirem entrar, configure um SMTP gratuito em **Project Settings → Authentication → SMTP Settings** (confira os limites atuais na documentação de cada serviço):

- **Gmail** (mais simples): numa conta Google com verificação em duas etapas, crie uma [senha de app](https://myaccount.google.com/apppasswords). Host `smtp.gmail.com`, porta `465`, usuário = o e-mail, senha = a senha de app, remetente = o mesmo e-mail.
- **Brevo** (plano grátis): crie a conta, verifique o e-mail remetente e use as credenciais SMTP do painel (host `smtp-relay.brevo.com`, porta `587`).

Em **Authentication → Rate Limits**, ajuste o limite de e-mails por hora ao que o SMTP escolhido permite.

### 5. Entrar com Google e Notion (opcional, grátis)

Nos dois, o endereço de retorno é `https://<ref>.supabase.co/auth/v1/callback`. As chaves secretas ficam só no painel do Supabase.

**Google**, no [Google Auth Platform](https://console.cloud.google.com/auth/overview):

1. Crie o projeto, preencha **Branding** e, em **Audience**, escolha **External** e publique (**In production**).
2. Em **Data Access**, deixe só `openid`, `userinfo.email` e `userinfo.profile`.
3. **Clients → Create client → Web application**: em **Authorized JavaScript origins**, o endereço da Vercel; em **Authorized redirect URIs**, o endereço de retorno.
4. Copie o Client ID e o Client Secret para **Supabase → Authentication → Sign In / Providers → Google** e ative.

**Notion**, no [portal de conexões](https://app.notion.com/developers/connections):

1. **New connection**: método **OAuth**, o endereço de retorno em **Redirect URI** e **Installable in: Any workspace** (não dá para mudar depois).
2. Em **Capabilities**, **User information with email addresses** (sem o e-mail, a entrada falha).
3. Copie o OAuth client ID e o OAuth client secret para **Supabase → Authentication → Sign In / Providers → Notion** e ative.

Na **Vercel**, crie a variável `NEXT_PUBLIC_AUTH_PROVIDERS` com `google,notion` e faça o redeploy. Só liste os que já estão ativos: um provedor desligado responde com uma página de erro crua. Para conferir sem entrar, abra `https://<ref>.supabase.co/auth/v1/authorize?provider=notion`: ativo, leva à tela do provedor.

A Apple ficou de fora: exige o Apple Developer Program (pago) e uma chave nova a cada 6 meses. No iPhone e no iPad com o app instalado, o provedor pode abrir no Safari e não voltar logado para o app: nesse caso, use o e-mail com código. Isso só dá para confirmar no aparelho.

### 6. Se o Supabase pausar

No plano Free, o projeto **pausa depois de 7 dias sem uso**: o app abre, mas não entra nem salva nada. Para reativar:

1. Entre em [supabase.com/dashboard](https://supabase.com/dashboard) e abra o projeto `lanima`.
2. Clique em **Restore project** e espere alguns minutos. Os dados continuam lá.
3. Não deixe pausado por muito tempo: depois de um período longo, a restauração pelo painel deixa de estar disponível. Confira o prazo atual na documentação do Supabase.

Usar o app pelo menos uma vez por semana evita a pausa.

## Instalar o Lanima

O PWA só instala por HTTPS, então use o endereço da Vercel.

- **Galaxy Tab (Chrome):** abra o endereço, toque em **Instalar o Lanima** no menu lateral (ou em ⋮ → **Instalar app**). O ícone aparece na tela inicial e o app abre em tela cheia.
- **iPad e iPhone (Safari):** abra o endereço no **Safari**, toque em **Compartilhar → Adicionar à Tela de Início → Adicionar**. O botão **Instalar o Lanima** do app mostra esse passo a passo. Em outros navegadores do iOS a instalação não funciona.

## Versões

Versões estáveis instaladas em 22/11/2026, conferidas no npm. Onde a versão difere da “mais nova” do npm, o motivo está anotado.

| Pacote                                  | Versão          | Nota                                                                                                                            |
| --------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| next                                    | 16.4.6          | App Router, Turbopack. `cacheComponents` e `partialPrefetching` **desligados** (ver “Por que o cacheComponents está desligado”) |
| react / react-dom                       | 19.3.0          | Fixado pelo `create-next-app` 16.4.6                                                                                            |
| tailwindcss / @tailwindcss/turbopack    | 4.3.3           | Fixado pelo template do Next                                                                                                    |
| typescript                              | 5.9.3           | O npm já tem a 7.x, mas o template do Next 16.4 fixa a 5.x                                                                      |
| eslint / eslint-config-next             | 9.39.5 / 16.4.6 | O npm já tem o ESLint 10, mas o template do Next fixa o 9                                                                       |
| @serwist/turbopack / serwist            | 9.5.15          | Service worker com Turbopack                                                                                                    |
| esbuild                                 | 0.28.2          | Usado pelo Serwist para empacotar o service worker                                                                              |
| lucide-react                            | 1.77.0          | Ícones, traço 1.75                                                                                                              |
| prettier                                | 3.10.1          |                                                                                                                                 |
| vitest                                  | 5.1.1           | Exige `@types/node` 22+                                                                                                         |
| @testing-library/react                  | 16.3.3          |                                                                                                                                 |
| @playwright/test                        | 1.65.1          |                                                                                                                                 |
| sharp                                   | 0.35.5          | Só para gerar os ícones                                                                                                         |
| @types/node                             | 22.20.5         | Alinhado com o Node 22                                                                                                          |
| @supabase/supabase-js                   | 2.119.2         | Banco, login e arquivos                                                                                                         |
| @supabase/ssr                           | 0.12.7          | Sessão em cookies (proxy, `/callback`)                                                                                          |
| supabase (CLI)                          | 3.2.0           | Supabase local, migrações, tipos e testes de RLS                                                                                |
| @tanstack/react-query                   | 5.108.3         | Dados remotos com cache                                                                                                         |
| zod                                     | 4.6.7           | Validação de formulários                                                                                                        |
| browser-image-compression               | 2.0.2           | Reduz a foto antes do corte (sem o modo worker, que baixa código de um CDN)                                                     |
| react-easy-crop                         | 6.2.5           | Corte quadrado da foto com toque e pinça                                                                                        |
| server-only                             | 0.0.1           | Garante que `lib/supabase/server.ts` nunca vá para o navegador                                                                  |
| @dnd-kit/core / @dnd-kit/sortable       | 6.3.1 / 10.0.0  | Reordenar o conteúdo da matéria com dedo, caneta ou teclado (e o kanban da fase 8)                                              |
| @tanstack/react-query-persist-client    | 5.108.4         | Guarda matérias, conteúdo, avaliações e metas no aparelho (abre offline)                                                        |
| @tanstack/query-async-storage-persister | 5.108.4         | Persistência no `localStorage` (o persister síncrono está descontinuado)                                                        |

## Decisões técnicas da Fase 1

- **Tokens:** todas as cores são CSS variables em `app/globals.css`, nos dois temas. As cores padrão do Tailwind foram removidas, então só a paleta do Lanima existe (e nunca preto puro). Um teste (`tests/unit/contrast.test.ts`) lê o CSS e garante 4,5:1 em todo par de texto usado.
- **Cores de estado como texto:** `--success` (#4F9A78) e `--danger` (#C8605A) ficam abaixo de 4,5:1 sobre o branco. Elas continuam valendo para bordas, barras e ícones (onde o mínimo é 3:1), e textos de estado usam variantes mais fechadas: `--success-text`, `--danger-text`, `--warning-text`.
- **Tema sem piscar:** um script inline no `<head>` aplica `data-theme` antes da primeira pintura, a partir da escolha salva (Claro, Escuro) ou do sistema (Automático). A escolha fica no aparelho por enquanto e passa para o perfil (`profiles.tema`) na Fase 2.
- **Service worker:** gerado pelo Serwist em `/serwist/sw.js`, pelo route handler documentado (`force-static`, `revalidate = false`): é empacotado uma vez no `next build` e servido como arquivo estático, nunca em tempo de execução. O precache inclui o app shell, as fontes (`.woff2`), os ícones, `/inicio` e a página `/~offline`.
- **Folhas e diálogos:** usam o `<dialog>` nativo com `showModal()`: foco preso, Esc fecha, o resto da página fica inerte e o foco volta para quem abriu.

## Decisões técnicas da Fase 2

- **Colunas do banco em inglês** (`name`, `daily_focus_goal_min`, `show_in_ranking`…), interface em português. As cores das matérias continuam com as chaves da spec (`amarelo`, `rosa`…).
- **Quem decide "login, onboarding ou app" é o aparelho**, não o servidor (`features/auth/auth-gate.tsx`, regra pura em `lib/auth/gate.ts`). As páginas são cascas estáticas e os dados vêm do Supabase no navegador, protegidos pelo RLS. Um redirecionamento no servidor quebraria o uso offline e poderia fazer o service worker guardar a tela de login no lugar do `/inicio`. O `proxy.ts` só renova o cookie da sessão.
- **Offline:** a última conta e o último perfil ficam no aparelho; sem internet, o app abre com eles em vez de mandar para o login.
- **Entrar e Criar conta são telas separadas.** `/entrar` tem e-mail, Google e Notion. `/criar-conta` é o **passo 1 de 3** (só e-mail) e, depois do código, segue para o passo 2 em `/boas-vindas`. Uma conta nova por Entrar (ou pelo link do e-mail) começa em `/boas-vindas` no passo 1. Em Criar conta, um e-mail que já tinha conta entra nela e avisa. Em Entrar, a resposta nunca revela se um e-mail tinha conta. O Supabase junta os logins do mesmo e-mail.
- **E-mail com link e código:** o link entra direto em qualquer navegador (`/callback?token_hash=…`, sem depender do navegador que pediu); o código resolve o iPhone e o iPad com o app instalado.
- **`/callback` redireciona com endereço relativo** (`Location: /inicio`). O `next start` informa `localhost` como origem mesmo atendendo `127.0.0.1`; um redirecionamento absoluto levava a pessoa para outro host, sem o cookie da sessão.
- **O service worker nunca guarda respostas da API do Supabase** (`app/sw.ts`). A regra padrão do Serwist para outras origens guardaria perfil e matérias num cache que a próxima pessoa num tablet compartilhado poderia ver offline. Exceção: as fotos de perfil (cada envio tem um nome novo).
- **Foto de perfil:** recorte quadrado no aparelho, 512 px, WebP (ou JPEG quando o navegador não codifica WebP), em `avatars/<id da usuária>/avatar-<data>.webp`, bucket privado com URL assinada.
- **Tema na conta:** a escolha vale em todos os aparelhos (`profiles.theme`). O `localStorage` continua aplicando o tema antes da primeira pintura. Uma troca fica pendente, ligada à conta, até o servidor confirmar: se o app fechar antes (ou estiver offline), ela é enviada na próxima vez que o perfil carregar.

## Decisões técnicas da Fase 3

- **Horário estruturado, não texto livre.** A spec pede "horário (texto livre)", mas os mockups ordenam por próxima aula, marcam laboratório ("· lab") e mostram a agenda da semana no desktop. Cada matéria guarda suas aulas em `subjects.schedule_slots` (dia da semana, hora, sala, laboratório); o app escreve "Seg e Qua · 08h00" a partir disso. Decidido na aprovação do plano da fase 3.
- **Dono garantido pelo banco:** `subject_topics`, `assessments` e `goals` têm `user_id` e uma chave estrangeira composta `(subject_id, user_id)` para `subjects (id, user_id)`. Uma linha nunca aponta para a matéria de outra pessoa, mesmo que o RLS falhe. Excluir uma matéria apaga o conteúdo e as avaliações; as metas ficam, sem matéria.
- **Permissões explícitas em toda tabela nova** (`grant`), testadas no pgTAP: o projeto hospedado não dá permissões automáticas às tabelas novas.
- **Datas no fuso de São Paulo**, sempre como dia de calendário (`YYYY-MM-DD`), com a semana de segunda a domingo (`lib/dates/calendar.ts`).
- **Datas sempre em dd/mm/aaaa**, com campo próprio (`components/ui/date-field.tsx`): o `<input type="date">` segue o idioma do navegador ou do sistema e o site não consegue mudar. Exceções em texto: a saudação por extenso (spec) e os dias da agenda da semana. Pelo mesmo motivo, as **horas** são digitadas em 24 horas (`components/ui/time-field.tsx`).
- **10 cores de matéria:** as 5 da spec mais pêssego, lima, turquesa, índigo e orquídea, na mesma faixa de claridade. O marca-texto do caderno continua com as 5 da spec.
- **Exame** (recuperação) é um tipo de avaliação, sempre em vermelho (`--exam`). **Concluída** é marcada por quem estuda (`assessments.completed_at`), nunca deduzida da data; concluída deixa de contar como próxima.
- **Próximas provas** (Início) mostra provas, práticas e exames das matérias ativas, cada uma de uma cor: a da matéria se estiver livre, senão outra da paleta; exame é sempre vermelho. Seminários e entregas ficam na página da matéria. O card escuro "Próxima prova" da spec continua.
- **Metas atrasadas** (até 14 dias) aparecem no topo de "Metas de hoje" com "Mover para hoje". Os pontos de meta (fase 9) saem de `completed_at`: desmarcar desfaz.
- **Reordenar** escreve só a posição do tópico movido (ponto médio entre os vizinhos).
- **Offline:** matérias e metas são "online-first" (seção 6). A última cópia fica no aparelho (TanStack Query persistido), então as telas abrem sem internet com o aviso "Offline · mostrando dados salvos no aparelho". Alterações offline são recusadas com aviso; só as sessões de foco entram numa fila (fase 4).
- **Sair vale só para este aparelho** (`scope: "local"`): os outros continuam logados, e funciona sem internet (a sessão é removida antes do pedido ao servidor). Nada roda depois da resposta, que pode atrasar: quem leva para `/entrar` é só o AuthGate, uma vez. A cópia das listas é apagada na hora; também quando a sessão termina sozinha ou outra conta entra no aparelho (`lib/query/device-cache.ts`). As fotos de perfil já abertas continuam no cache do service worker por até 7 dias.

## Decisões técnicas da Fase 4 (modo foco: cronômetro e temas)

- **Cronômetro por horários** (`lib/focus/timer.ts`): o tempo sai de `startedAt` e `pausedDuration`, nunca de contar segundos. Fica no Dexie (`lib/db/local.ts`) por conta, vale entre abas e é apagado ao sair. Só `timer-dial.tsx` se redesenha a cada segundo.
- **O tema é só a pele:** `features/focus/themes/registry.ts` liga cada som às cores e à camada decorativa. As cores dos temas existem só ali, como variáveis CSS. Um teste confere 4,5:1 dos textos em todos os fundos, inclusive com cabeçalho e rodapé em repouso (Deep Focus) e com uma janela acesa por trás (Lo-fi).
- **Partículas com seed** (`lib/focus/particles.ts`): a metade, em aparelho fraco, é um recorte da lista inteira. Aparelho fraco: 4 núcleos ou menos, ou menos de 50 fps nos 3 primeiros segundos visíveis. Nos aparelhos Apple, só o FPS decide, porque o Safari limita os núcleos informados. `/foco?fps=1` mostra o FPS.
- **"Reduzir movimento" é do aparelho:** a animação começa desligada e não muda a escolha da conta; ligada à mão, a camada aparece parada.
- **Áudio:** Web Audio faz o loop sem intervalo entre `loopStart` e `loopEnd`; cada arquivo traz meio segundo de si mesmo antes e depois, para o atraso do codificador não aparecer. O som toca enquanto a sessão corre. A tela de bloqueio precisa de um elemento de mídia tocando, então um `<audio>` toca silêncio gerado na hora (`silent-track.ts`). Os arquivos só entram no cache depois de tocar (`app/sw.ts`); créditos em `public/sounds/CREDITS.md`.
- **Só `.m4a`:** todos os navegadores-alvo tocam AAC. Falta o `.ogg` alternativo, por não haver codificador Vorbis na máquina. Os testes usam um tom em WAV, porque o Chromium do Playwright não decodifica AAC.
- **Tailwind só no `globals.css`:** a regra do Turbopack que valia para todo `*.css` transformava CSS Modules em CSS comum.
- **Sessões (`focus_sessions`):** só a concluída é registrada; pular, reiniciar e o tempo em pausa não contam. O dia é o do **fim** da sessão, em São Paulo, e com o app fechado vale a hora em que o tempo acabou. A tabela aceita só leitura e inclusão; uma sessão por início (`unique (user_id, started_at)`), então reenviar não duplica. As pausas (`kind = 'pausa'`) existem na tabela, mas ainda não são gravadas.
- **Fim em qualquer tela:** `FocusWatcher` fica nos dois layouts, grava sessão e cronômetro na mesma transação do Dexie e avisa. Quem decide é o cronômetro salvo: uma aba que dormiu não conclui o que outra já pausou.
- **Minimizar e Encerrar:** com sessão em andamento, "Minimizar" volta para a última tela com menu e tudo continua; "Encerrar" pergunta antes, porque só a sessão concluída conta. Fora do Modo foco, `FocusIndicator` mostra o tempo, pausa e silencia (menu lateral, trilho ou acima da barra do celular); uma pausa não iniciada some dele em 30 min. O som vive na raiz (`FocusAudio` em `app/providers.tsx`), porque trocar de tela troca o layout; é solto quando não há sessão ou ao sair da conta. Os controles de mídia só existem com sessão em andamento.
- **Fila no aparelho** (`features/focus/session-store.ts`): a sessão conta na hora e sobe quando houver rede (ao concluir, abrir, voltar ao app ou reconectar; sem repetir em laço). A cópia enviada fica 2 dias, porque outra aba pode ainda não ter a lista nova; a soma junta as duas pelo início. Sair com sessão não enviada pede confirmação.
- **Números do dia** (`lib/focus/sessions.ts`): minutos, sessões, pontos (10 por hora, sem arredondar para cima) e sequência (dias com 25 min; hoje só soma). Os 30 dias recentes vêm sessão a sessão; os anteriores, somados por dia pela view `focus_days`.
- **Sons com nome novo quando mudam:** o arquivo antigo continua no cache de quem já tocou. A chuva atual foi escolhida pela medição (4% da energia abaixo de 150 Hz; a anterior tinha 80%).
- **Tela acesa** (`features/focus/use-wake-lock.ts`): Wake Lock enquanto a sessão corre, também minimizada; solto na pausa e pedido de novo ao voltar do segundo plano (o navegador o solta lá).
- **Aviso do fim** (`features/focus/end-alert.ts`): dois tons suaves feitos na hora com Web Audio (sem arquivo) e vibração no Android (o Safari não vibra). Só se o fim for percebido em até 10 s: voltar ao app bem depois mostra só o aviso. No iOS o som só sai depois de um toque, então os toques com sessão destravam o áudio; sem sessão ele é suspenso. Com o som silenciado, só vibra.

### Por que o cacheComponents está desligado

O template do Next 16.4 vem com `cacheComponents` e `partialPrefetching` ligados. No Lanima eles estão desligados por causa do service worker:

- O Serwist gera o `sw.js` num route handler que depende de `dynamic = "force-static"` e `revalidate = false` para ser empacotado só no build. O `cacheComponents` proíbe essas configurações.
- A alternativa (envolver o empacotamento em `use cache`) herda um tempo de vida de cache: depois de 15 minutos, o servidor reempacotava o service worker em tempo de execução (glob, hash e esbuild) e **travava por 7 a 10 s**, derrubando a navegação. Nenhum perfil do `cacheLife` desliga a revalidação, e na Vercel o reempacotamento rodaria numa função sem os arquivos de `.next/static`, gerando um service worker com precache vazio.
- Hoje nenhuma tela depende do PPR nem da preservação de estado entre rotas: os dados vêm do Supabase no cliente.

**Alternativa futura para religar a flag:** o “configurator mode” do Serwist (`@serwist/next/config` + rodar `serwist build` depois do `next build`), que gera o service worker como arquivo estático, fora de qualquer route handler. Um teste E2E de regressão (“service worker é estático…”) garante que o `sw.js` continue com `s-maxage` de 1 ano.

## Estrutura

```
app/                  rotas (App Router); (app) com menu, (full) em tela cheia
  globals.css         tokens, escala tipográfica, utilitários
  sw.ts               fonte do service worker
  serwist/[path]/     gera /serwist/sw.js
  design/             página de componentes
components/ui/        componentes-base
components/layout/    AppShell, navegação, instalação, tema
features/             telas e lógica por módulo (auth, onboarding, perfil, matérias)
lib/                  tema, PWA, datas, cores, Supabase, regras de login e perfil
proxy.ts              renova o cookie da sessão (Next 16: antigo middleware)
supabase/             config local, migrações, seed, testes de RLS e modelo de e-mail
tests/unit/           Vitest
tests/e2e/            Playwright
design-reference/     mockups aprovados (somente leitura)
```

## Próximas seções deste README

Chegam com as fases correspondentes: as chaves gratuitas do Gemini e do Groq (fase 6), grupos e ranking (fase 9).
