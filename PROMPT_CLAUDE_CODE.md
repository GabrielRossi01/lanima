# Lanima: prompt de construção para o Claude Code

Você vai construir o **Lanima**, um planner de estudos para uma estudante de Biomedicina. Ela e algumas amigas vão usar o app no dia a dia. Leia este documento inteiro antes de escrever qualquer código e siga as fases no fim, uma de cada vez.

---

## 0. Como trabalhar comigo

- Antes de cada fase, mostre um plano curto (arquivos, tabelas, componentes) e espere meu ok. Dentro da fase, siga sem pedir confirmação a cada passo.
- Ao terminar uma fase, rode lint, typecheck e testes, faça um commit com mensagem clara (`feat(foco): ...`) e me diga como testar no tablet.
- Para biblioteca, versão ou API que você não tenha certeza se ainda existe, confira a documentação atual antes de usar. Nunca invente versão: use a estável mais recente e registre no README.
- Se uma decisão for cara de desfazer (modelo de dados, autenticação, estrutura de pastas), pergunte antes.
- Código, nomes de variáveis e commits em inglês. Toda a interface em **português do Brasil**.

---

## 1. Restrição principal: custo zero

O projeto não pode gerar nenhum custo. Isso define a arquitetura:

- **Nada de App Store ou Play Store.** O Lanima é um **PWA instalável**: abre no navegador e é adicionado à tela inicial, em tela cheia.
- Hospedagem: **Vercel Hobby** (uso pessoal e não comercial). Nada de anúncio ou cobrança no app.
- Back-end: **Supabase Free** (Postgres, Auth, Storage, Realtime), sem servidor próprio.
- Limites do Supabase Free que o código tem que respeitar:
  - **500 MB de banco:** desenhos são salvos como traços vetoriais compactos, nunca como imagem.
  - **1 GB de Storage:** toda foto é comprimida no aparelho antes do upload (lado maior até 1600 px, WebP ou JPEG a cerca de 0,75, meta de até 400 KB).
  - **Pausa depois de 7 dias sem uso:** documente no README como reativar o projeto.
- Nenhum serviço pago e nenhuma biblioteca com licença comercial. Só MIT, Apache-2.0, ISC, BSD ou similares. Para os modelos 3D, CC BY-SA com crédito (ver seção 7.6).
- A IA (resumos e testes) usa **só planos gratuitos de API**, sem cartão cadastrado. Detalhes, limites e cuidados na seção 7.12.
- **Evite o tldraw**: para produção ele exige uma chave de licença.

---

## 2. Dispositivos e plataformas (prioridade de teste)

| Prioridade | Dispositivo | Navegador | Observações |
|---|---|---|---|
| 1 | **Tablet Samsung Galaxy Tab com S Pen** (dispositivo principal dela) | Chrome Android | Caneta com pressão via Pointer Events |
| 2 | iPad com Apple Pencil | Safari iPadOS | Caneta com pressão via Pointer Events |
| 3 | Celulares Android e iPhone (as amigas) | Chrome / Safari | Layout de celular com barra inferior |
| 4 | Computador | Chrome, Edge, Safari, Firefox | Layout com menu lateral |

Requisitos de compatibilidade:

- **Tela:**
  - Funcionar na horizontal e na vertical.
  - Telas-base: tablet 1194×834 na horizontal (desenhe para larguras de 768 a 1366), celular 390×844.
  - Respeite `env(safe-area-inset-*)`.
- **Instalação:**
  - Manifest completo: `name: "Lanima"`, `short_name: "Lanima"`, `display: "standalone"`, `theme_color` e `background_color` dos tokens, ícones maskable de 192 e 512, ícone para iOS.
  - Android: use `beforeinstallprompt` para mostrar um botão "Instalar o Lanima".
  - iOS: não há prompt de instalação. Mostre uma folha com o passo a passo "Compartilhar → Adicionar à Tela de Início", detectando Safari no iOS ou iPadOS e se o app já está em modo standalone.
- **Offline:**
  - Service worker com **Serwist** (`@serwist/next`).
  - Cache do app shell, das fontes e dos modelos 3D já baixados.
  - Funcionam sem internet: caderno, modo foco, leitura de resumos já gerados e resolução de testes já criados (ver seção 6). Gerar um resumo ou um teste novo exige internet.
- **Caneta (S Pen e Apple Pencil):** veja a seção 7.2.
- **Notificações push:**
  - São opcionais e ficam para a última fase.
  - No iOS, só funcionam com o app instalado na tela inicial (iOS 16.4 ou mais recente).
  - O app tem que funcionar 100% sem push.
- **APIs com suporte irregular:** não dependa de Background Sync nem de Periodic Sync, porque o iOS não suporta. Sincronize quando o app abrir ou voltar ao primeiro plano (`visibilitychange`) e ao reconectar (`online`).
- **Modo foco:**
  - Use a **Screen Wake Lock API** quando disponível, para a tela não apagar.
  - O tempo é calculado a partir de timestamps (`startedAt` e `pausedDuration`), nunca contando `setInterval`. O timer tem que continuar certo depois que o app vai para segundo plano.
- **Toque:**
  - Alvos de no mínimo 44×44 px.
  - Sem hover como única forma de chegar a uma ação.
  - `touch-action` configurado por área: canvas do caderno = `none`, listas = `pan-y`.

---

## 3. Stack

- **Next.js** (App Router) + **TypeScript** estrito + **Tailwind CSS**, com tokens como CSS variables.
- **Supabase:** `@supabase/supabase-js` + `@supabase/ssr`.
  - Auth: link mágico por e-mail e Google OAuth.
  - Postgres com RLS em todas as tabelas.
  - Storage para fotos e arquivos.
  - Realtime para o ranking.
- **Dexie** (IndexedDB) para dados locais e fila de sincronização.
- **TanStack Query** para dados remotos. **Zustand** para estado de UI (ferramenta ativa do caderno, timer, teste em andamento).
- **Zod** para validar formulários, importações e **toda resposta da IA**.
- **lucide-react** para ícones, com traço 1.75 (o design foi desenhado nesse estilo).
- **perfect-freehand** para traços com pressão no caderno.
- **@react-three/fiber + @react-three/drei + three** para o Atlas 3D.
- **browser-image-compression** para comprimir fotos.
- **jsPDF** (ou **pdf-lib**) para exportar o caderno, os resumos e os testes em PDF. **JSZip** para o backup.
- **Extração de texto dos arquivos, no aparelho** (economiza servidor e cota de IA):
  - **pdfjs-dist** para PDF.
  - **mammoth** para `.docx`.
  - **JSZip** + leitura do XML dos slides para `.pptx`.
  - **tesseract.js** com o idioma `por` para fotos e PDFs escaneados (OCR). Rode em Web Worker e guarde os dados do idioma no cache.
- **Vercel AI SDK** (`ai`, com `@ai-sdk/google` e `@ai-sdk/groq`) para chamar a IA com saída estruturada (`generateObject` + schema Zod) e trocar de provedor sem reescrever código.
- Testes: **Vitest** + Testing Library. **Playwright** com emulação de Galaxy Tab S, iPad Pro 11 e iPhone, com toque e caneta simulados via `pointerType`.
- Qualidade: ESLint + Prettier. GitHub Actions rodando lint, typecheck e testes, que é gratuito para repositório público ou dentro da cota grátis.

**Sem back-end Java ou Spring nesta versão.** Lógica que precisar de servidor fica em funções SQL ou RPC no Supabase, ou em Route Handlers do Next.js. As chamadas de IA ficam **só em Route Handlers**: a chave da API nunca vai para o navegador.

---

## 4. Referência visual

A pasta `design-reference/` traz os mockups aprovados em HTML. São markup com estilos inline: **leia como referência de layout, cor e texto, não como código para copiar**, e não tente executar (eles dependem de um runtime de canvas que não está no pacote). Arquivos:

- `Main.html`: sistema visual (paleta, tipografia, componentes-base).
- `Mapa.html`: mapa de navegação do app.
- Telas de tablet, tema claro:
  - `Onboarding.html`, `Inicio.html`, `Materias.html`, `Materia.html`, `Caderno.html`
  - `Atlas3D.html`, `Foco.html`, `Extensao.html`, `Arquivos.html`, `Ranking.html`, `Perfil.html`
- Celular e desktop: `iPhoneInicio.html`, `iPhoneFoco.html`, `iPhoneRanking.html`, `Desktop.html`.
- Resumos e testes (fluxo novo):
  - `Estudo.html`: central com resumos, testes e "Para revisar".
  - `Resumo.html`: resumo em tópicos com fontes, marca-texto, termos-chave e pontos de atenção.
  - `TesteConfig.html`: passo 2 do assistente (níveis com quantidade, tipos, modo, resumo do teste).
  - `TesteSelecao.html`: passo 3, escolha das questões com filtros, contador e ações por questão.
  - `Questao.html`: questão no modo treino, com correção e explicação.
  - `Resultado.html`: nota, desempenho por tópico e por nível, questões erradas.
  - O passo 1 (conteúdo) não tem mockup próprio: use uma lista de arquivos e resumos com checkbox e os chips de tópicos, no mesmo cabeçalho com etapas do `TesteConfig.html`.
- Tema escuro: `*-Escuro.html` (todas as telas acima têm versão escura) e `Tokens-Escuro.html`.

Reproduza fielmente: hierarquia, espaçamentos, raios, cores, tipografia e os textos em português. Os dados dos mockups ("Maria", "Júlia", notas, números) são **exemplos**. No app, tudo vem do banco, e o estado vazio de cada tela precisa ser desenhado.

> **Mudança de escopo: os flashcards saíram do app.** A estudante achou que eles deixavam o estudo confuso e limitado. No lugar, entra o módulo **Resumos e testes** (seção 7.5). Os mockups já foram atualizados com estas trocas; a lista fica aqui como referência:
> - Menu e barra inferior: "Flashcards" → **"Resumos e testes"** (ícone `list-checks` do lucide), na mesma posição.
> - Início:
>   - O cartão "Cards para revisar" vira **"Acerto médio"**, com o % dos testes dos últimos 7 dias e o ícone `target`.
>   - No card "Próxima prova", o botão "Revisar N cards" vira **"Criar teste para a prova"**.
> - Matéria:
>   - A aba "Flashcards" vira **"Resumos e testes"**.
>   - O bloco lateral do deck vira **"Último teste"**, com nota, data e o botão "Refazer erradas".
> - Caderno: "Criar flashcard da seleção" vira **"Usar no resumo"** (ver 7.2).
> - Atlas 3D: "Criar flashcard" vira **"Gerar questões sobre isto"**.
> - Arquivos:
>   - Em cada arquivo entram as ações **"Resumir em tópicos"** e **"Criar teste"**.
>   - A exportação "Flashcards CSV/Anki" vira **"Resumos e testes em PDF"**.
>   - Remova a importação do Anki.
> - As telas novas de Resumos e testes estão nos mockups listados acima, nos temas claro e escuro.

### 4.1 Tokens de cor (CSS variables, os dois temas)

A identidade é **azul cimento queimado**. O tema segue o sistema por padrão, e ela pode escolher Claro, Escuro ou Automático no Perfil.

| Token | Claro | Escuro | Uso |
|---|---|---|---|
| `--bg` | `#F5F6F5` | `#12181D` | Fundo do app |
| `--surface` | `#FFFFFF` | `#1B232A` | Cards, menu lateral |
| `--surface-alt` | `#EEF2F5` | `#222D35` | Áreas secundárias, linhas de lista |
| `--subtle` | `#ECEEED` | `#28333C` | Campos, trilhas de progresso, segmentados |
| `--text` | `#1F2A33` | `#ECEEED` | Texto principal |
| `--text-2` | `#60676B` | `#A3AFB8` | Texto secundário, metadados |
| `--accent` | `#3E5566` | `#C2CFD8` | Links, valores em destaque, ícone ativo |
| `--brand` | `#5D7A8C` | `#7E97A7` | Preenchimento de progresso, bordas de destaque |
| `--btn` | `#4B6577` | `#4B6577` | Botão principal (texto branco) |
| `--active` | `#DCE4EA` | `#2B3D4A` | Item ativo do menu, a linha "você" no ranking |
| `--deep` | `#1F2A33` | `#3E5566` | Card de destaque ("Próxima prova"), cartão de resultado do teste |
| `--border` | `#DDE0E0` | `#2C3740` | Bordas |
| `--border-strong` | `#C6CACB` | `#3E4A54` | Bordas de botão secundário e campos |
| `--ink` | `#1F2A33` | `#1F2A33` | Texto **sempre escuro** sobre pastel |
| `--success` / `--warning` / `--danger` | `#4F9A78` / `#D4A03F` / `#C8605A` | iguais | Estados |

**Cores de matéria e de marca-texto:** amarelo `#F7E38A`, rosa `#F6BACB`, verde `#BFE5CB`, celeste `#B3D8F2`, lilás `#D6C8F0`.
- Chips e ícones de matéria usam o pastel com texto `--ink` nos dois temas.
- O **marca-texto do caderno no tema escuro** usa versões fechadas: amarelo `#6E6230`, rosa `#6E3F50`, verde `#3D6651`, celeste `#34586E`, lilás `#54486E`.
- O modo foco, o Atlas 3D e o onboarding são escuros nos dois temas (gradiente radial de `#2E404D` para `#1F2A33` e `#141B21`).
- Nunca use preto puro.
- O contraste mínimo do texto é 4,5:1. Valide os tokens com um teste automatizado de contraste.

### 4.2 Tipografia, espaço e forma

- **Fraunces** (títulos e cronômetro, pesos 300, 400 e 600) + **DM Sans** (interface, pesos 400, 500, 600 e 700) + **Caveat** (só no exemplo de letra à mão do onboarding). Use `next/font` com as fontes servidas pelo próprio app (funciona offline).
- Escala:

  | Estilo | Fonte | Tamanho / altura de linha |
  |---|---|---|
  | Display | Fraunces 600 | 44/52 |
  | Título de página | Fraunces 600 | 32/40, letter-spacing −0,5 |
  | Cronômetro | Fraunces 300 | 104–120 no tablet, 76 no celular, com tabular-nums |
  | H1 | DM Sans 700 | 24/32 |
  | H2 de card | DM Sans 600 | 16/24 |
  | Corpo | DM Sans | 14/20 |
  | Legenda | DM Sans | 12/16 |
  | Sobretítulo | DM Sans 600 | 11/16, caixa alta, letter-spacing 1 |

- Espaçamento base 4: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.
- Raios: 8 (sm), 12 (md, tiles e itens de menu), 16 (lg), 20 (cards), 28 (card de questão e visualizador 3D), 999 (pílulas, botões, chips).
- Sombras (só no tema claro):
  - Card: `0 1px 2px rgba(31,42,51,.05), 0 6px 16px rgba(31,42,51,.06)`.
  - Flutuante: `0 16px 40px -4px rgba(31,42,51,.14)`.
  - No escuro, os cards se separam por superfície e borda, sem sombra.
- Movimento:
  - Transições de 150 a 250 ms.
  - Na correção de uma questão, a alternativa certa ganha borda `--success` e a errada `--danger`, com transição de 200 ms.
  - Respeite `prefers-reduced-motion`.
- Sem emoji na interface. Ícones sempre do lucide.

### 4.3 Componentes-base (crie em `components/ui`)

Button (primário, secundário, fantasma; tamanhos M=44 e S=40; ícone opcional), IconButton, Chip de matéria (5 cores + neutro), NavItem, TabBarItem, Card, MetricCard (tile com ícone + valor em Fraunces + rótulo), SubjectCard, ProgressBar, Avatar (iniciais ou foto, anel opcional), SegmentedControl, Switch, Input e Label, SearchField, Tabs, EmptyState, Sheet ou Dialog (acessível, com foco preso), Toast. Para os testes, crie também QuestionCard (enunciado + alternativas como botões de rádio grandes), DifficultyBadge (Fácil, Médio, Difícil) e SourceTag ("Fonte: Slides Aula 07 · p. 12").

### 4.4 Layout responsivo

- **Tablet e desktop (≥ 768 px):**
  - Menu lateral de 248 px: logo Lanima (ícone DNA em tile) e os itens Início, Matérias, Caderno, Resumos e testes, Atlas 3D, Modo foco, Extensão, Arquivos, Grupo e ranking.
  - No rodapé do menu, o cartão do perfil.
  - O conteúdo tem padding de 28 a 32 px.
  - Na vertical, entre 768 e 1023 px, o menu vira uma faixa só de ícones (72 px) que abre por cima ao tocar.
- **Celular (< 768 px):** barra inferior com Início, Matérias, Foco, Ranking e Mais. "Mais" abre uma folha com o resto.
- **Caderno e modo foco:** sem menu, em tela cheia, com botão de voltar.

---

## 5. Modelo de dados (Supabase)

Crie migrações SQL versionadas em `supabase/migrations`. Use `uuid` em todas as chaves e `created_at` e `updated_at` em tudo. **RLS em todas as tabelas:** cada usuária só lê e escreve os próprios dados. A exceção são as tabelas de grupo e ranking, que membros do mesmo grupo podem ler, e só ler.

Tabelas:

- **`profiles`:** id = auth.uid, nome, curso (padrão "Biomedicina"), instituição, semestre, avatar_path, meta_diaria_foco_min (padrão 120), tema, aparece_no_ranking (padrão true).
- **`subjects`:** user_id, nome, cor (amarelo | rosa | verde | celeste | lilas), ícone, horário (texto livre), professor (opcional), arquivada.
- **`subject_topics`:** subject_id, título, concluído, ordem. É o conteúdo do plano de ensino.
- **`assessments`:** subject_id, título, tipo (prova | prática | seminário | entrega), data.
- **`goals`:** user_id, subject_id (opcional), título, duração estimada, data, concluída_em. São as metas do dia.
- **`notebooks`:** subject_id, título. **`notebook_pages`:** notebook_id, ordem, fundo (pontilhado | pautado | liso), strokes (jsonb, formato na seção 7.2), elementos (jsonb: imagens e caixas de texto com posição), versão.
- **`focus_sessions`:** user_id, subject_id, início, fim, duração_planejada, duração_real, tipo (foco | pausa), concluída.
- **`files`:** user_id, subject_id, nome, tipo, tamanho, storage_path. Pode estar ligado a extensão.
- **Resumos e testes:**
  - **`documents`:** file_id (ou notebook_page_id), user_id, subject_id, content_hash (sha-256 do texto), idioma, total de páginas, status (extraindo | pronto | erro).
  - **`document_chunks`:** document_id, ordem, página, texto. São trechos de cerca de 1.500 tokens, com a página de origem.
  - **`summaries`:** user_id, subject_id, título, document_ids (array), conteúdo (jsonb, formato em 7.5), nível de detalhe (curto | médio | completo), modelo e provedor usados, editado_pela_usuária (bool), versão.
  - **`questions`:** user_id, subject_id, document_id, summary_id (opcional), tópico, dificuldade (facil | medio | dificil), tipo, enunciado, alternativas (jsonb), resposta correta, explicação, fonte (página + trecho curto), status (gerada | aprovada | descartada | sinalizada).
    - Tipos: multipla_escolha, verdadeiro_falso, associacao, caso_clinico, resposta_curta.
    - Este é o **banco de questões**: elas são reaproveitadas entre testes.
  - **`tests`:** user_id, subject_id, título, configuração (jsonb: dificuldades, tipos, tópicos, quantidade, modo, tempo-limite), questão_ids em ordem.
  - **`test_attempts`:** test_id, início, fim, modo (treino | prova), nota (%), concluída.
  - **`attempt_answers`:** attempt_id, question_id, resposta, correta (bool), tempo_ms, autoavaliação (só para resposta curta: acertei | parcial | errei).
  - **`ai_usage`:** user_id, dia, operação (resumo | questões), tokens_entrada, tokens_saída, provedor. É usada para o limite diário (7.12).
- **Projeto de extensão:**
  - `extension_projects`: nome, orientação, data de entrega, horas exigidas.
  - `extension_members`.
  - `extension_tasks`: coluna a fazer | fazendo | feito, etiqueta, responsáveis, data.
  - `extension_hours`.
  - `extension_photos`.
  - `extension_events`.
- **Grupo e ranking:**
  - `groups`: nome, invite_code de 7 caracteres, como "BIO-4K2".
  - `group_members`.
  - `activity_events`: tipo, payload mínimo, sem conteúdo de notas.

**Pontuação do ranking:**
- 1 hora de foco = 10 pontos, proporcional por minuto e só para sessões concluídas.
- Meta concluída = 5 pontos.
- Teste concluído = 5 pontos, mais 3 de bônus com acerto de 70% ou mais. Só a primeira tentativa de cada teste por dia conta, para ninguém refazer o mesmo teste só para pontuar.
- Dia de sequência = 3 pontos.
- Um dia conta na sequência quando há pelo menos 25 minutos de foco **ou** um teste concluído.
- Implemente como uma **view ou função SQL** `group_leaderboard(group_id, period)` com período semana, mês ou semestre. A semana começa na segunda, no fuso `America/Sao_Paulo`.
- **Privacidade:** membros do grupo veem só nome, avatar, pontos, horas, metas, testes concluídos e sequência. Nunca notas, resumos, questões, arquivos, notas dos testes ou títulos de metas. Quem desliga "Aparecer no ranking" some da lista. Garanta isso via RLS e cubra com testes.

---

## 6. Local-first e sincronização

- **Caderno, sessões de foco e respostas de testes** são escritos primeiro no IndexedDB (Dexie) e entram numa fila `outbox`, que sincroniza com o Supabase quando houver rede.
- Resumos e testes já gerados ficam no Dexie, para ler e resolver offline. Um teste começado offline é corrigido no aparelho, porque o gabarito vem junto. A tentativa sobe quando a conexão voltar.
- **Conflitos:**
  - Páginas do caderno usam `versão` + last-write-wins por página.
  - Resumos editados também usam `versão` + last-write-wins.
  - Tentativas e respostas só acrescentam registros, então não conflitam.
- Um indicador discreto mostra "Salvo", "Salvando…" ou "Offline · será sincronizado".
- O resto (matérias, metas, arquivos, ranking) pode ser online-first com cache do TanStack Query, desde que mostre estado offline claro.

---

## 7. Funcionalidades, tela por tela

### 7.1 Onboarding e autenticação
- **Entrada:** login por link mágico ou Google.
- **Passo 1, boas-vindas:** painel escuro com "Seus estudos de Biomedicina, num lugar só."
- **Passo 2, perfil:**
  - Foto com câmera ou galeria. Corte quadrado no aparelho, comprima para 512 px e envie ao bucket `avatars` (privado, URL assinada).
  - Campos: nome, semestre, curso, instituição.
  - Seleção das matérias em chips: cria `subjects` com a cor de cada chip e permite "+ Outra".
- **Passo 3:** meta diária de foco e um convite opcional para entrar num grupo por código.
- Mostre a folha de "Instalar o Lanima" no fim do onboarding.

### 7.2 Caderno (crítico: Samsung S Pen e Apple Pencil)
- **Entrada da caneta:**
  - Canvas com **Pointer Events**: `pointerType === "pen"` desenha, com `pressure` controlando a espessura via perfect-freehand.
  - Use `getCoalescedEvents()` quando existir, para traços suaves, e `getPredictedEvents()` quando existir, para baixa latência.
  - Defina `touch-action: none` e chame `setPointerCapture`.
- **Rejeição da palma:**
  - Enquanto houver uma caneta ativa, ignore `pointerType === "touch"`.
  - Com caneta, um dedo rola a página e dois dedos fazem pinça para zoom.
  - Opção "Desenhar com o dedo" no menu, para quem não tem caneta. Aí um dedo desenha e dois rolam.
  - Teste com a S Pen no Chrome Android: confirme que `pressure` varia e que o botão lateral não quebra nada. Se o evento informar o botão, use-o como borracha temporária.
- **Ferramentas (barra flutuante centralizada no topo, igual ao mockup):**
  - Caneta: com pressão, opacidade 1.
  - Lápis: com pressão, textura leve, opacidade 0,85.
  - Marca-texto: largura fixa, opacidade 0,4, `mix-blend-mode: multiply` no claro, e no escuro as cores fechadas da seção 4.1. Fica atrás da tinta.
  - Borracha: por traço inteiro e por área.
  - Laço: selecionar, mover e apagar.
  - Caixa de texto.
  - Inserir imagem ou foto, comprimida.
- **Cores:** grafite (no escuro vira branco), azul cimento e os três marca-textos. **Espessura:** 3 níveis. **Desfazer e refazer**, com atalho de dois dedos tocando.
- **Formato dos traços:**
  - `{ id, tool, color, size, points: [[x, y, pressure], ...] }`.
  - Coordenadas em espaço de página (A4 virtual com 1000 de largura), quantizadas em 1 casa decimal.
  - Simplifique os pontos (Ramer–Douglas–Peucker leve) antes de salvar.
- **Páginas:** fundo pontilhado, pautado ou liso; miniaturas na lateral direita; adicionar página; zoom de 50% a 400%; rolagem vertical.
- **Ações do topo:**
  - "Usar no resumo": envia o texto das caixas de texto da página e o OCR das imagens coladas (tesseract.js) como fonte para Resumos e testes.
    - A letra à mão não passa por OCR nesta versão, porque o resultado em português é fraco.
    - Deixe essa possibilidade documentada como melhoria futura.
  - Exportar a página ou o caderno em PDF (vetorial quando possível).
  - Compartilhar com a Web Share API e arquivo como alternativa.
- **Desempenho:** 60 fps com 2.000 traços na página. Desenhe os traços finalizados num canvas em cache e só o traço ativo em tempo real.

### 7.3 Início
- **Saudação:** "Bom dia, Nome", e "Boa tarde" ou "Boa noite" conforme a hora, mais a data por extenso.
- **Topo:** busca global (notas, resumos, questões, arquivos, matérias), sino e o botão "Iniciar foco".
- **4 cartões de métrica:**
  - Foco hoje, com a meta.
  - Sequência em dias.
  - Metas da semana (concluídas de total).
  - Acerto médio nos testes dos últimos 7 dias.
- **Metas de hoje:** checklist com chip da matéria e duração. Marcar é otimista; desmarcar desfaz os pontos.
- **"Continuar estudando":** as 3 matérias mais recentes com progresso.
- **Coluna direita:** mini ranking da semana (top 3 + você) e o card escuro "Próxima prova em N dias" com o botão "Criar teste para a prova". O botão abre o criador de teste já com a matéria da avaliação e os arquivos dela selecionados.

### 7.4 Matérias e página da matéria
- **Lista de matérias:**
  - Grade de 3 colunas no tablet, 2 na vertical e 1 no celular.
  - Cada card tem faixa de cor no topo, tile com ícone, nome, horário, pílula da próxima avaliação, progresso (% de tópicos concluídos) e contadores de notas, resumos e arquivos.
  - Filtros: Todas, Com prova próxima, Com laboratório, Arquivadas.
  - Botão "Nova matéria".
- **Página da matéria:** trilha, cabeçalho com tile grande e as abas Visão geral, Anotações, Resumos e testes, Arquivos, Atlas 3D e Avaliações.
  - Visão geral: anotações recentes com miniaturas reais das páginas, conteúdo do plano de ensino em checklist de duas colunas, o bloco "Último teste" (nota, data, "Refazer erradas"), arquivos recentes e avaliações com contagem regressiva.
  - Os tópicos do plano de ensino aparecem como opções de filtro no criador de testes.

### 7.5 Resumos e testes (substitui os flashcards)

O fluxo de estudo é: **enviar arquivos → resumo em tópicos → teste com níveis e questões escolhidas → resultado → refazer o que errou.**

**Ponto de partida.** Ela pode começar de três lugares:
- Em **Arquivos**: logo depois do upload, um toast oferece "Resumir em tópicos" e "Criar teste". As mesmas ações ficam no menu de cada arquivo.
- Na aba **Resumos e testes** de uma matéria ou no item do menu: botões "Novo resumo" e "Novo teste".
- No card **"Próxima prova"** do Início.

Em todos os casos dá para selecionar **um ou vários arquivos** (PDF, slides, Word, fotos de lâmina e de páginas de livro) e, opcionalmente, páginas do caderno.

**1. Extração do texto (no aparelho)**
- Tipos de arquivo:
  - PDF com texto: pdfjs-dist, guardando o número da página.
  - PDF escaneado ou foto: OCR com tesseract.js (`por`), com barra de progresso "Lendo página 3 de 12…".
  - `.docx`: mammoth.
  - `.pptx`: texto de cada slide e das notas do apresentador.
- Gere o `content_hash` e salve `documents` e `document_chunks`. Se o hash já existir, reaproveite e não extraia de novo.
- Mostre uma prévia do texto extraído, com a opção de excluir páginas (capa, referências) antes de mandar para a IA.

**2. Resumo em tópicos**
- **Opções antes de gerar:**
  - Nível de detalhe: Curto (só os pontos-chave), Médio ou Completo.
  - Foco opcional: "Para a prova de [data]" ou um tópico do plano de ensino.
- **Formato salvo** (validado com Zod):
  ```ts
  { titulo: string,
    topicos: Array<{ titulo: string,
                     pontos: Array<{ texto: string, fonte: { documentId: string, pagina: number } }>,
                     subtopicos?: Array<...mesmo formato...> }>,
    termosChave: Array<{ termo: string, definicao: string }>,
    pontosDeAtencao: string[] }        // "costuma cair", confusões comuns, desde que estejam no material
  ```
- **Tela do resumo:**
  - Tópicos em acordeão (abre e fecha), com numeração 1, 1.1, 1.2…
  - Cada ponto tem um SourceTag tocável que abre o arquivo na página de origem.
  - "Termos-chave" em lista de definição e "Pontos de atenção" num card `--surface-alt`.
  - Marca-texto: tocar e segurar um ponto deixa ele destacado, usando as cores de matéria.
  - **Edição:** cada ponto pode ser editado, excluído ou reordenado (arrastar). Um ponto novo pode ser adicionado à mão. Edições marcam `editado_pela_usuária` e nunca são sobrescritas por uma nova geração sem confirmação.
  - Ações no topo:
    - "Criar teste deste resumo".
    - "Exportar em PDF", com layout limpo em Fraunces + DM Sans, uma coluna e as fontes no rodapé.
    - "Salvar no caderno", que cria uma página com caixas de texto.
    - "Gerar de novo", com aviso se houver edições.

**3. Criar teste (assistente em 3 passos, numa Sheet grande)**
- **Passo 1, conteúdo:**
  - Arquivos ou resumos de origem, já vindos do ponto de partida.
  - Tópicos: chips com os tópicos do resumo e do plano de ensino, todos marcados por padrão.
- **Passo 2, configuração:**
  - **Níveis**, com seleção múltipla e quantidade por nível:
    - **Fácil:** lembrar e reconhecer. Definições, nomes, classificações.
    - **Médio:** compreender e aplicar. Relacionar conceitos, interpretar um exame ou uma figura descrita, explicar um mecanismo.
    - **Difícil:** analisar. Caso clínico ou laboratorial curto, questão integrando dois tópicos, alternativa "pegadinha" plausível.
  - **Tipos de questão** (seleção múltipla): múltipla escolha (4 ou 5 alternativas), verdadeiro ou falso, associação de colunas, caso clínico e resposta curta.
  - **Quantidade total:** 5 a 40.
  - **Modo:**
    - **Treino:** correção e explicação a cada questão.
    - **Prova:** cronômetro opcional e resultado só no fim.
  - Opções extras: embaralhar alternativas e, como opção ligada por padrão, "Usar questões do meu banco antes de gerar novas".
- **Passo 3, seleção de questões:**
  - A IA gera **cerca de 1,5× a quantidade pedida**. A lista mostra cada questão com DifficultyBadge, tipo, tópico e SourceTag.
  - Ela **escolhe quais entram**: checkbox em cada uma, filtros por nível, tipo e tópico, e o contador "18 de 20 selecionadas".
  - Pode editar o enunciado, as alternativas, o gabarito e a explicação; trocar uma questão ("Gerar outra parecida"); excluir; ou sinalizar como "errada ou confusa". Questões sinalizadas não voltam a ser sugeridas.
  - Pode adicionar uma questão escrita à mão.
  - As escolhidas vão para o teste e para o banco (`status = aprovada`). As não escolhidas ficam como `descartada`.
- **Teste salvo:** com título e matéria, dá para refazer quando quiser.

**4. Fazer o teste**
- **Layout:**
  - Uma questão por vez, num QuestionCard grande (raio 28).
  - Alternativas como botões de rádio de pelo menos 56 px de altura, boas para dedo e caneta.
  - Navegação Anterior e Próxima e um mapa de questões numerado (respondida, em branco, marcada para revisar).
- **Por tipo de questão:**
  - Associação: arrastar ou tocar em pares.
  - Resposta curta: campo de texto e, depois de responder, a resposta esperada e a autoavaliação "Acertei / Parcial / Errei". Não chame a IA para corrigir: economiza cota e funciona offline.
- **Por modo:**
  - **Treino:** ao confirmar, mostra certo ou errado, a explicação e a fonte.
  - **Prova:** sem feedback até o fim e com cronômetro discreto.
  - O Modo foco pode ser iniciado junto, com a matéria do teste.

**5. Resultado e revisão**
- Card `--deep` com a nota em %, em Fraunces grande, o tempo e os pontos ganhos.
- Desempenho **por tópico** e **por nível**, em barras horizontais. Os tópicos com menos de 60% aparecem como "Para revisar", com link para o trecho do resumo.
- Lista das questões com a resposta dela, o gabarito, a explicação e a fonte.
- Ações:
  - **"Refazer só as erradas"**: novo teste com as questões erradas, embaralhadas.
  - "Novo teste com os tópicos fracos".
  - "Exportar em PDF", com a opção de ter o gabarito separado no fim.
- Histórico de tentativas por teste, com a evolução da nota.

**6. Estados e mensagens**
- **Carregando:** skeleton com mensagens de progresso reais ("Lendo o arquivo…", "Organizando os tópicos…", "Escrevendo as questões…"). Use streaming quando o SDK permitir.
- **Erros:**
  - Limite diário atingido: "Você usou as gerações de hoje. Amanhã libera de novo, e os testes salvos continuam disponíveis."
  - Arquivo sem texto legível.
  - Falha do provedor: tenta o provedor reserva automaticamente.
- **Aviso fixo e discreto** no rodapé de todo resumo e teste gerado: "Gerado por IA a partir dos seus arquivos. Confira com o material da aula."

### 7.6 Atlas 3D
- **Visualizador:**
  - R3F com OrbitControls: arrastar gira, pinça dá zoom, dois dedos deslocam.
  - Botões laterais: girar, aproximar, afastar, modo raio-x (transparência) e camadas.
  - Dica no rodapé: "Arraste para girar · pinça para zoom · toque num ponto".
- **Camadas:** controle segmentado Ossos, Músculos, Células e Tecidos.
  - Ossos e Músculos usam o modelo do corpo.
  - Células e Tecidos usam modelos menores (neurônio, célula, cortes de tecido).
- **Interação:** tocar numa estrutura a destaca e abre o painel lateral com nome, 3 fatos curtos e os botões "Salvar no caderno" e "Gerar questões sobre isto". Esse segundo botão abre o criador de teste com os fatos da estrutura como fonte e com o tópico preenchido. O texto dos fatos fica num JSON revisável em `content/atlas/*.json`.
- **Modelos:**
  - Use os do **Z-Anatomy** (derivados do BodyParts3D, licença **CC BY-SA 4.0**).
  - Converta para `.glb` com compressão Draco ou Meshopt, separe por sistema e carregue sob demanda. Meta de até 8 MB por camada.
  - Guarde no cache do service worker depois do primeiro download.
  - Crie a tela "Sobre e créditos" com a atribuição exigida: "BodyParts3D, The Database Center for Life Science, CC BY-SA 2.1 Japan" e "Z-Anatomy, The libre 3D atlas of anatomy, CC BY-SA 4.0".
  - Enquanto os modelos reais não estiverem prontos, use primitivas como substitutas, para não travar o resto.
- **Fallback:** em aparelho fraco ou sem WebGL, mostre ilustrações 2D com os mesmos pontos clicáveis.

### 7.7 Modo foco
- **Layout:**
  - Tela cheia escura.
  - No topo: "Sair do foco", "Não perturbe ativado" e os botões de som e de ajustes.
  - Seletor de matéria e tópico.
  - Anel de progresso circular com o tempo em Fraunces Light.
  - Botões reiniciar, iniciar ou pausar (círculo branco de 72 px) e pular para a pausa.
  - Predefinições 25/5, 50/10, 90/15 e Personalizar.
- **Rodapé:**
  - Sessões de hoje em bolinhas.
  - Total focado hoje.
  - Pontos ganhos hoje.
  - Som ambiente: Chuva, Lo-fi, Ruído marrom, Silêncio. Os áudios ficam em loop, são arquivos livres com licença CC0 e ficam no cache.
- **Timer:**
  - Baseado em timestamps, persistido no Dexie: se o app fechar, ao voltar mostra o tempo certo.
  - Wake Lock ligado durante a sessão.
  - Ao terminar, som suave + vibração (`navigator.vibrate`, onde existir) + registro em `focus_sessions`.

### 7.8 Projeto de extensão
- **Cabeçalho:** nome do projeto, equipe, orientação e data de entrega.
- **Abas:** Quadro, Galeria, Cronograma, Documentos, Equipe.
- **Quadro:** kanban com 3 colunas (A fazer, Fazendo, Feito), arrastar e soltar com toque e caneta (use `@dnd-kit`), cards com etiqueta colorida, responsáveis em avatares e data.
- **Lateral:**
  - Horas de extensão "32h de 60h", com barra verde e o botão "Registrar horas".
  - Prévia da galeria.
  - Próximo encontro.
- **Galeria:** envio de várias fotos com compressão, legenda e data, e visualizador em tela cheia.
- **Exportar** um relatório em PDF com as horas, as tarefas concluídas e as fotos.

### 7.9 Arquivos
- Área de soltar arquivos + "Escolher arquivos" + "Tirar foto" (`<input type="file" accept="image/*" capture>`).
- Filtros por tipo e tabela com nome, matéria, tipo, tamanho, data e ações. As ações de cada arquivo incluem **"Resumir em tópicos"** e **"Criar teste"**.
- Seleção múltipla com a barra "3 selecionados · Resumir juntos · Criar teste".
- Depois de cada upload:
  - Um toast oferece "Resumir em tópicos" e "Criar teste".
  - Um selo no arquivo mostra o estado da extração de texto: "Lendo…", "Pronto para resumir" ou "Sem texto legível".
- Lateral com o armazenamento usado (o total de 1 GB), exportações (caderno em PDF, resumos e testes em PDF, backup completo em `.zip`) e importações.
- **Importações:** arquivos do aparelho, o que inclui Google Drive e iCloud via o seletor do sistema. Não integre APIs do Drive nesta versão.
- Limite de upload: 25 MB por arquivo, com aviso claro.

### 7.10 Grupo e ranking
- **Sem grupo:** criar um grupo ou entrar com código.
- **Pódio:** os 3 primeiros em degraus (o 1º no centro, com troféu).
- **Lista:** a linha "Você" destacada com "Faltam N pts para o 1º" e os demais em lista.
- **Período:** Semana, Mês ou Semestre.
- **Atualização:** ranking ao vivo via Supabase Realtime, assinando `focus_sessions`, `goals` e `activity_events` do grupo, com debounce.
- **Lateral:** "Como ganhar pontos" (foco, metas, testes e sequência), convite com código + copiar + compartilhar link (`/entrar/BIO-4K2`) e feed de atividade ("Júlia fez 2h de foco em Bioquímica").
- **Nada de conteúdo privado no feed.**

### 7.11 Perfil e configurações
- Trocar a foto.
- Campos editáveis.
- Meta diária com slider de 30 min a 6 h.
- Tema: Claro, Escuro ou Automático.
- Notificações:
  - Lembrete de estudo: tópicos marcados como "Para revisar" e testes começados e não terminados.
  - Provas e entregas, 3 dias e 1 dia antes.
  - Atividade do grupo.
- Aparecer no ranking.
- "Exportar meus dados" (zip com JSON + arquivos) e "Excluir conta", com confirmação.
- Tela "Sobre e créditos".

### 7.12 IA: provedores, custo zero e qualidade

- **Provedores (só planos gratuitos, sem cartão cadastrado):**
  - **Principal: Gemini API** (Google AI Studio), por aceitar documentos longos e PDF com imagens.
  - **Reserva: Groq**, chamado automaticamente se o principal falhar ou devolver 429.
  - O nome do modelo **não fica no código**. Vai em variáveis de ambiente (`AI_PRIMARY_PROVIDER`, `AI_PRIMARY_MODEL`, `AI_FALLBACK_PROVIDER`, `AI_FALLBACK_MODEL`), porque os nomes e as cotas desses planos mudam com frequência. Antes de configurar, confira os modelos gratuitos atuais na documentação de cada provedor.
  - Documente no README como criar as duas chaves de graça.
- **Privacidade:**
  - No plano gratuito do Gemini, o Google pode usar os textos enviados para melhorar os produtos dele, e pessoas podem revisá-los.
  - Na primeira geração, mostre um aviso único: "Para resumir e criar testes, o texto dos arquivos é enviado a um serviço de IA gratuito. Não envie dados pessoais ou de pacientes." Ela precisa tocar em "Entendi".
  - Envie **só o texto extraído** dos trechos necessários, nunca o arquivo inteiro nem metadados do perfil.
- **Controle de cota:**
  - Limite por usuária por dia, configurável. Padrão: 10 resumos e 15 gerações de questões.
  - Use a tabela `ai_usage` e mostre "Restam N gerações hoje".
  - Cache por `content_hash` + parâmetros: o mesmo pedido não gasta cota de novo.
  - Rate limit por IP no Route Handler.
- **Documentos grandes:**
  - Resumo map-reduce: resume cada grupo de trechos e depois junta tudo num resumo final, preservando as páginas de origem.
  - Questões: distribua entre os tópicos escolhidos e envie só os trechos relevantes de cada tópico.
- **Qualidade e segurança do conteúdo** (vale para o prompt de sistema e a validação):
  - Responder **somente com base nos trechos enviados**, em português do Brasil, com terminologia de Biomedicina.
  - Cada ponto do resumo e cada questão **precisa citar a página de origem**. Item sem fonte válida é descartado no servidor.
  - Nas questões:
    - Exatamente uma alternativa correta.
    - Distratores plausíveis, do mesmo tema.
    - Explicação de 1 a 3 frases.
    - Sem "todas as anteriores" nem "nenhuma das anteriores".
    - A dificuldade segue as definições do passo 2.
  - Valide toda saída com Zod. Se não passar, tente uma vez de novo com o erro e, se falhar de novo, mostre a mensagem de erro amigável.
  - Remova questões duplicadas ou quase iguais (normalize o texto e compare).
- **Avaliação:** crie em `tests/ai-fixtures/` dois PDFs de exemplo, um de Anatomia e um de Bioquímica, escritos por você e sem direitos autorais, com testes que verificam o formato, a presença das fontes e a distribuição por nível. Nos testes automatizados, simule o provedor (mock): nenhum teste de CI chama a API de verdade.

---

## 8. Acessibilidade, desempenho e qualidade

- WCAG 2.2 AA:
  - Contraste 4,5:1.
  - Foco visível.
  - Navegação por teclado no desktop.
  - `aria-label` em botões só de ícone.
  - Elementos semânticos de verdade (`button`, `a`, `label`).
  - Respeito ao `prefers-reduced-motion`.
- Desempenho:
  - Lighthouse PWA instalável.
  - Performance ≥ 85 no tablet.
  - JS inicial da rota Início ≤ 200 KB gzip.
  - O Atlas 3D e o caderno são carregados sob demanda (`dynamic import`).
- Estados de carregando (skeletons), vazio e erro em toda tela.
- Testes mínimos:
  - Extração de texto de PDF, docx e pptx de exemplo, com páginas corretas.
  - Schemas Zod de resumo e questão; descarte de itens sem fonte; deduplicação de questões.
  - Correção dos testes por tipo de questão; cálculo da nota por tópico e por nível.
  - Limite diário de IA e cache por hash.
  - Cálculo de pontos e sequência no fuso de São Paulo.
  - Timer resistente a ir para segundo plano.
  - Serialização dos traços.
  - RLS: uma usuária não lê os dados de outra; um membro do grupo não lê notas.
  - E2E: onboarding, criar matéria, sessão de foco, enviar arquivo → resumo → teste → resultado (com provedor de IA simulado).

---

## 9. Estrutura sugerida

```
app/
  (auth)/entrar, (auth)/callback
  (app)/inicio, materias, materias/[id], caderno/[pageId], estudo, estudo/resumos/[id], estudo/testes/novo,
        estudo/testes/[id], estudo/testes/[id]/tentativa/[attemptId], estudo/testes/[id]/resultado/[attemptId],
        atlas, foco, extensao, arquivos, grupo, perfil, sobre
  entrar/[codigo]          # convite de grupo
  api/ai/resumo, api/ai/questoes   # Route Handlers de IA (chave só no servidor)
  manifest.ts, sw.ts       # Serwist
components/ui, components/layout (Sidebar, TabBar, AppShell), features/<módulo>/...
lib/supabase, lib/db (Dexie + sync), lib/points, lib/ink (perfect-freehand + serialização),
lib/extract (pdf, docx, pptx, ocr em Web Worker), lib/ai (provedores, prompts, schemas Zod, cota, cache), lib/grading
content/atlas/*.json
public/models/*.glb, public/sounds/*, public/icons/*
supabase/migrations, supabase/seed.sql
design-reference/          # mockups aprovados (somente leitura)
```

Crie também o `.env.example` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` só no servidor, `GOOGLE_GENERATIVE_AI_API_KEY`, `GROQ_API_KEY`, `AI_PRIMARY_PROVIDER`, `AI_PRIMARY_MODEL`, `AI_FALLBACK_PROVIDER`, `AI_FALLBACK_MODEL`, `AI_DAILY_SUMMARIES`, `AI_DAILY_QUESTION_RUNS`), um `seed.sql` com dados de exemplo iguais aos dos mockups, para desenvolvimento, e um **README** em português explicando:
1. Como criar o projeto grátis no Supabase.
2. Como rodar as migrações.
3. Como fazer o deploy na Vercel Hobby.
4. Como instalar o PWA no Galaxy Tab (Chrome → menu → Instalar app) e no iPad (Safari → Compartilhar → Adicionar à Tela de Início).
5. Como reativar o Supabase se ele pausar.
6. Como criar as chaves gratuitas do Gemini (Google AI Studio) e do Groq, sem cadastrar cartão, e o que fazer quando a cota do dia acaba.

---

## 10. Fases (faça uma por vez e espere meu ok entre elas)

1. **Fundação:**
   - Projeto Next.js, Tailwind com os tokens dos dois temas, fontes servidas pelo próprio app e componentes-base.
   - AppShell responsivo (menu lateral, faixa de ícones, barra inferior).
   - PWA (manifest, Serwist, folha de instalação para Android e iOS).
   - Página `/design` mostrando todos os componentes nos dois temas.
   - **Aceite:** instala no Galaxy Tab e no iPad e abre em tela cheia; os temas trocam sem piscar.
2. **Auth, perfil e onboarding:** Supabase, RLS, `profiles`, avatar com compressão, seleção de matérias.
3. **Matérias, metas e Início:** CRUD de matérias, tópicos e avaliações; metas do dia; métricas.
4. **Modo foco:** timer resistente, Wake Lock, sons, registro de sessões, pontos.
5. **Arquivos e extração de texto:**
   - Storage, compressão, tabela e filtros.
   - Extração de PDF, docx e pptx e OCR em Web Worker, `documents` e `document_chunks`, prévia do texto.
   - **Aceite:** um PDF de slides e uma foto de livro viram texto com as páginas certas, no Galaxy Tab.
6. **Resumos e testes:**
   - Siga os mockups `Estudo`, `Resumo`, `TesteConfig`, `TesteSelecao`, `Questao` e `Resultado` (claros e escuros). Desenhe só o passo 1 do assistente, como descrito na seção 4, e me mostre antes de implementar.
   - Depois: camada `lib/ai` com provedor principal e reserva, cota e cache; resumo em tópicos editável; banco de questões; criador de teste com níveis, tipos e seleção de questões; modos treino e prova; resultado por tópico e nível; "Refazer só as erradas"; PDFs; offline para resolver.
   - **Aceite:** com o provedor simulado, todo o fluxo funciona no E2E. Com a chave real, um PDF de 30 páginas gera um resumo com fontes e um teste de 20 questões (5 fáceis, 10 médias, 5 difíceis) sem estourar a cota do dia.
7. **Caderno:**
   - Canvas com caneta, rejeição de palma, ferramentas, páginas, sincronização offline, exportação PDF e "Usar no resumo".
   - **Aceite:** testado de verdade com a S Pen no Chrome Android e com o Apple Pencil no Safari.
8. **Projeto de extensão:** kanban, horas, galeria, relatório em PDF.
9. **Grupo e ranking:** convites, leaderboard em SQL (incluindo os pontos de testes), Realtime, privacidade testada.
10. **Atlas 3D:** substitutos primeiro, depois os modelos Z-Anatomy convertidos, painel de informações, "Gerar questões sobre isto" e créditos.
11. **Acabamento:**
    - Modo escuro revisado tela a tela contra os mockups `*-Escuro.html`.
    - Notificações push opcionais.
    - Exportar e excluir dados.
    - Auditoria Lighthouse e de acessibilidade.
    - README final.

Comece pela **Fase 1**: me mostre o plano e espere a aprovação.
