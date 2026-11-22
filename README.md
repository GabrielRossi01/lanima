# Lanima

Planner de estudos de Biomedicina, instalável como app (PWA) no Galaxy Tab, no iPad, em celulares e no computador. Custo zero: Vercel Hobby + Supabase Free + planos gratuitos de IA.

> **Estado atual: Fase 1 (fundação).** Sistema visual, componentes-base, AppShell responsivo, temas claro e escuro, PWA instalável com service worker. Login, dados e funcionalidades chegam nas próximas fases (ver `PROMPT_CLAUDE_CODE.md`, seção 10).

## Rodar no computador

Requisitos: Node.js 22 ou mais recente e npm.

```bash
npm install
npm run dev          # http://localhost:3000 (sem service worker em desenvolvimento)
```

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
| `npm run check`                   | Lint + typecheck + testes unitários                                                                                                                      |

Na primeira vez, instale os navegadores do Playwright: `npx playwright install chromium webkit`.

> **Windows:** alguns antivírus bloqueiam o executável do WebKit do Playwright (`Playwright.exe`, erro `EPERM`). Nesse caso, rode `npm run test:e2e:chromium` localmente: ele usa a tela, o toque e o user agent do iPad e do iPhone no Chromium. O WebKit de verdade roda no GitHub Actions a cada push. O E2E nunca reaproveita um servidor já aberto: se a porta 3100 estiver ocupada, ele falha em vez de testar o servidor errado.

> **Por que `127.0.0.1` e não `localhost` no E2E:** no Windows, `localhost` resolve primeiro para `::1`. Na máquina de desenvolvimento, as conexões locais por esse caminho eram interceptadas (provavelmente pela proteção web do antivírus): os pedidos chegavam ao `next start` 10 a 30 s atrasados, ou nunca chegavam, enquanto o servidor respondia em milissegundos. Com `127.0.0.1`, a mesma suíte passou em 6 de 6 rodadas. Para testar um servidor já aberto (por exemplo, ligado há muito tempo), use `E2E_BASE_URL=http://127.0.0.1:<porta> npx playwright test`.

## Página de componentes

`/design` mostra todos os componentes-base lado a lado nos temas claro e escuro. Os mockups aprovados ficam em `design-reference/` (só leitura).

## Publicar na Vercel Hobby (grátis)

1. Crie um repositório no GitHub e envie o projeto (`git push`).
2. Entre em [vercel.com](https://vercel.com) com a conta do GitHub, no plano **Hobby** (gratuito, uso pessoal e não comercial).
3. **Add New → Project**, escolha o repositório e clique em **Deploy**. A Vercel detecta o Next.js sozinha; não precisa mudar nenhuma configuração.
4. Ao terminar, a Vercel mostra o endereço `https://<nome>.vercel.app`. Cada `git push` na branch `main` publica de novo.

Nesta fase não há variáveis de ambiente. Nas próximas, elas são cadastradas em **Project → Settings → Environment Variables** (modelo em `.env.example`).

## Instalar o Lanima

O PWA só instala por HTTPS, então use o endereço da Vercel.

- **Galaxy Tab (Chrome):** abra o endereço, toque em **Instalar o Lanima** no menu lateral (ou em ⋮ → **Instalar app**). O ícone aparece na tela inicial e o app abre em tela cheia.
- **iPad e iPhone (Safari):** abra o endereço no **Safari**, toque em **Compartilhar → Adicionar à Tela de Início → Adicionar**. O botão **Instalar o Lanima** do app mostra esse passo a passo. Em outros navegadores do iOS a instalação não funciona.

## Versões

Versões estáveis instaladas em 22/11/2026, conferidas no npm. Onde a versão difere da “mais nova” do npm, o motivo está anotado.

| Pacote                               | Versão          | Nota                                                                                                                            |
| ------------------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| next                                 | 16.4.6          | App Router, Turbopack. `cacheComponents` e `partialPrefetching` **desligados** (ver “Por que o cacheComponents está desligado”) |
| react / react-dom                    | 19.3.0          | Fixado pelo `create-next-app` 16.4.6                                                                                            |
| tailwindcss / @tailwindcss/turbopack | 4.3.3           | Fixado pelo template do Next                                                                                                    |
| typescript                           | 5.9.3           | O npm já tem a 7.x, mas o template do Next 16.4 fixa a 5.x                                                                      |
| eslint / eslint-config-next          | 9.39.5 / 16.4.6 | O npm já tem o ESLint 10, mas o template do Next fixa o 9                                                                       |
| @serwist/turbopack / serwist         | 9.5.15          | Service worker com Turbopack                                                                                                    |
| esbuild                              | 0.28.2          | Usado pelo Serwist para empacotar o service worker                                                                              |
| lucide-react                         | 1.77.0          | Ícones, traço 1.75                                                                                                              |
| prettier                             | 3.10.1          |                                                                                                                                 |
| vitest                               | 5.1.1           | Exige `@types/node` 22+                                                                                                         |
| @testing-library/react               | 16.3.3          |                                                                                                                                 |
| @playwright/test                     | 1.65.1          |                                                                                                                                 |
| sharp                                | 0.35.5          | Só para gerar os ícones                                                                                                         |
| @types/node                          | 22.20.5         | Alinhado com o Node 22                                                                                                          |

## Decisões técnicas da Fase 1

- **Tokens:** todas as cores são CSS variables em `app/globals.css`, nos dois temas. As cores padrão do Tailwind foram removidas, então só a paleta do Lanima existe (e nunca preto puro). Um teste (`tests/unit/contrast.test.ts`) lê o CSS e garante 4,5:1 em todo par de texto usado.
- **Cores de estado como texto:** `--success` (#4F9A78) e `--danger` (#C8605A) ficam abaixo de 4,5:1 sobre o branco. Elas continuam valendo para bordas, barras e ícones (onde o mínimo é 3:1), e textos de estado usam variantes mais fechadas: `--success-text`, `--danger-text`, `--warning-text`.
- **Tema sem piscar:** um script inline no `<head>` aplica `data-theme` antes da primeira pintura, a partir da escolha salva (Claro, Escuro) ou do sistema (Automático). A escolha fica no aparelho por enquanto e passa para o perfil (`profiles.tema`) na Fase 2.
- **Service worker:** gerado pelo Serwist em `/serwist/sw.js`, pelo route handler documentado (`force-static`, `revalidate = false`): é empacotado uma vez no `next build` e servido como arquivo estático, nunca em tempo de execução. O precache inclui o app shell, as fontes (`.woff2`), os ícones, `/inicio` e a página `/~offline`.
- **Folhas e diálogos:** usam o `<dialog>` nativo com `showModal()`: foco preso, Esc fecha, o resto da página fica inerte e o foco volta para quem abriu.

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
lib/                  tema, PWA, datas, cores de matéria
tests/unit/           Vitest
tests/e2e/            Playwright
design-reference/     mockups aprovados (somente leitura)
```

## Próximas seções deste README

Chegam com as fases correspondentes: criar o projeto no Supabase, rodar as migrações, reativar o Supabase depois de uma pausa, e criar as chaves gratuitas do Gemini e do Groq.
