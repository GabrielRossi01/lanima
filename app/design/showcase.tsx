"use client";

import {
  Bell,
  BookOpen,
  Check,
  Dna,
  Flame,
  FolderOpen,
  House,
  PersonStanding,
  Plus,
  Target,
  Timer,
  Trophy,
  Upload,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { InstallSheet } from "@/components/layout/install-entry";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { FilterChip, SubjectChip } from "@/components/ui/chip";
import { DifficultyBadge, TypeBadge } from "@/components/ui/difficulty-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { IconButton } from "@/components/ui/icon-button";
import { Field, SearchField } from "@/components/ui/input";
import { MetricCard } from "@/components/ui/metric-card";
import { NavItem, TabBarItem } from "@/components/ui/nav-item";
import { ProgressBar } from "@/components/ui/progress-bar";
import { QuestionCard } from "@/components/ui/question-card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Sheet } from "@/components/ui/sheet";
import { SourceTag } from "@/components/ui/source-tag";
import { SubjectCard } from "@/components/ui/subject-card";
import { Switch } from "@/components/ui/switch";
import { TabList, TabPanel, Tabs } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { SUBJECT_COLOR_LABEL, SUBJECT_COLORS } from "@/lib/subjects/colors";

const TOKENS = [
  "bg",
  "surface",
  "surface-alt",
  "subtle",
  "text",
  "text-2",
  "accent",
  "brand",
  "btn",
  "active",
  "deep",
  "border",
  "border-strong",
  "success",
  "warning",
  "danger",
] as const;

const MARKERS = ["yellow", "pink", "green", "sky", "lilac"] as const;

const ALTERNATIVES = [
  { id: "a", text: "Aumento da atividade dos osteoblastos, com excesso de matriz óssea." },
  { id: "b", text: "Reabsorção pelos osteoclastos maior que a formação pelos osteoblastos." },
  { id: "c", text: "Falha da hematopoese na medula óssea amarela." },
  { id: "d", text: "Calcificação excessiva das epífises dos ossos longos." },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <h2 className="type-overline m-0 text-fg-2">{title}</h2>
      {children}
    </section>
  );
}

function Row({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex min-w-0 flex-wrap items-center gap-3", className)}>{children}</div>;
}

/** Every base component, rendered inside one theme scope. */
export function Showcase({ theme }: { theme: "light" | "dark" }) {
  const [segment, setSegment] = useState<"ossos" | "musculos" | "celulas">("ossos");
  const [switchOn, setSwitchOn] = useState(true);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("visao");
  const [filter, setFilter] = useState("todas");
  const [picked, setPicked] = useState<string | null>(null);
  const [graded, setGraded] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);

  return (
    <div data-theme={theme} className="flex min-w-0 flex-col gap-8 rounded-xl bg-bg p-5 text-fg md:p-8">
      <h2 className="type-page-title m-0">{theme === "light" ? "Tema claro" : "Tema escuro"}</h2>

      <Section title="Paleta">
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
          {TOKENS.map((t) => (
            <div key={t} className="flex min-w-0 flex-col gap-1">
              <div className="h-12 rounded-md border border-line" style={{ background: `var(--${t})` }} />
              <code className="type-caption font-sans wrap-anywhere text-fg-2">--{t}</code>
            </div>
          ))}
        </div>
        <Row>
          {SUBJECT_COLORS.map((c) => (
            <SubjectChip key={c} color={c}>
              {SUBJECT_COLOR_LABEL[c]}
            </SubjectChip>
          ))}
          <SubjectChip color="neutro">Neutro</SubjectChip>
        </Row>
        <div className="flex flex-col gap-1">
          <span className="type-caption text-fg-2">Marca-texto do caderno</span>
          {/* A wrapping flex row: mapped <mark>s have no whitespace between them, so as inline text
              they formed one unbreakable ~495 px run that scrolled the page on phones. */}
          <p className="type-body m-0 flex flex-wrap gap-2">
            {MARKERS.map((m) => (
              <mark
                key={m}
                className="rounded-sm px-1 text-fg [mix-blend-mode:var(--marker-blend)]"
                style={{ background: `var(--marker-${m})` }}
              >
                osteoclastos
              </mark>
            ))}
          </p>
        </div>
      </Section>

      <Section title="Tipografia">
        <span className="type-display wrap-break-word">Bom dia, Maria</span>
        <span className="type-page-title wrap-break-word">Título de página</span>
        <span className="type-timer text-accent">25:00</span>
        <span className="type-h1">Título de seção 24</span>
        <span className="type-h2">Subtítulo 16 semibold</span>
        <span className="type-body">Texto de corpo 14 · usado em notas, listas e cards.</span>
        <span className="type-caption text-fg-2">Legenda 12 · metadados e datas</span>
        <span className="type-overline text-fg-2">Sobretítulo</span>
      </Section>

      <Section title="Botões">
        <Row>
          <Button icon={Plus}>Nova anotação</Button>
          <Button variant="secondary" icon={Upload}>
            Importar
          </Button>
          <Button variant="ghost">Ver tudo</Button>
          <Button size="s">Tamanho S</Button>
          <Button disabled>Desativado</Button>
        </Row>
        <Row>
          <IconButton icon={Bell} label="Notificações" />
          <IconButton icon={Plus} label="Adicionar" variant="primary" />
          <IconButton icon={FolderOpen} label="Abrir pasta" variant="ghost" />
        </Row>
      </Section>

      <Section title="Filtros">
        <Row>
          {[
            ["todas", "Todas", 6],
            ["prova", "Com prova próxima", 3],
            ["lab", "Com laboratório", 2],
          ].map(([value, label, count]) => (
            <FilterChip
              key={value as string}
              selected={filter === value}
              count={count as number}
              onClick={() => setFilter(value as string)}
            >
              {label}
            </FilterChip>
          ))}
        </Row>
      </Section>

      <Section title="Cards">
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <MetricCard icon={Timer} value="1h 45m" label="Foco hoje · meta 2h" />
          <MetricCard icon={Flame} color="amarelo" value="12 dias" label="Sequência de estudo" />
          <MetricCard icon={Check} color="verde" value="7 de 10" label="Metas da semana" />
          <MetricCard icon={Target} color="rosa" value="78%" label="Acerto médio nos testes" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SubjectCard
            href="#"
            name="Anatomia Humana"
            color="celeste"
            icon={PersonStanding}
            schedule="Seg e Qua · 08h00"
            nextAssessment="Prova em 14 dias"
            progress={62}
            counts={{ notes: 12, summaries: 4, files: 3 }}
          />
          <div className="flex min-w-0 flex-col gap-4">
            <Card>
              <CardHeader title="Card padrão" action={<a href="#">Ver tudo</a>} />
              <p className="type-body m-0 text-fg-2">Superfície com borda e sombra só no tema claro.</p>
            </Card>
            <Card tone="deep" className="gap-2">
              <span className="type-overline text-on-deep-2">Resultado</span>
              <span className="font-serif text-[30px] leading-9 font-semibold wrap-break-word">70% · 14 de 20</span>
              <span className="type-caption text-on-deep-2">Para revisar: tecido ósseo.</span>
            </Card>
          </div>
        </div>
      </Section>

      <Section title="Progresso e avatares">
        <ProgressBar value={62} label="Progresso" showValue />
        <ProgressBar value={53} label="Horas de extensão" tone="success" />
        <Row>
          <Avatar name="Maria Alves" />
          <Avatar name="Júlia" color="rosa" ring />
          <Avatar name="Carol" color="verde" size={48} />
          <Avatar size={48} />
        </Row>
      </Section>

      <Section title="Controles">
        <SegmentedControl
          label="Camadas"
          value={segment}
          onChange={setSegment}
          options={[
            { value: "ossos", label: "Ossos" },
            { value: "musculos", label: "Músculos" },
            { value: "celulas", label: "Células" },
          ]}
          className="max-w-full self-start"
        />
        <Switch
          checked={switchOn}
          onChange={setSwitchOn}
          label="Aparecer no ranking"
          description="Suas amigas veem só pontos e horas."
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nome" placeholder="Como quer ser chamada" />
          <Field label="Instituição" defaultValue="x" error="Escreva o nome completo da instituição." />
        </div>
        <SearchField value={query} onValueChange={setQuery} />
      </Section>

      <Section title="Abas">
        <Tabs value={tab} onChange={setTab} className="min-w-0">
          <TabList
            label="Seções da matéria"
            tabs={[
              { value: "visao", label: "Visão geral" },
              { value: "anotacoes", label: "Anotações", count: 12 },
              { value: "estudo", label: "Resumos e testes" },
              { value: "arquivos", label: "Arquivos" },
            ]}
          />
          {["visao", "anotacoes", "estudo", "arquivos"].map((v) => (
            <TabPanel key={v} value={v} className="pt-4">
              <p className="type-body m-0 text-fg-2">Conteúdo da aba “{v}”.</p>
            </TabPanel>
          ))}
        </Tabs>
      </Section>

      <Section title="Navegação">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-1 rounded-card border border-line bg-surface p-3">
            <NavItem href="#" label="Início" icon={House} active />
            <NavItem href="#" label="Matérias" icon={BookOpen} active={false} />
          </div>
          <div className="flex min-w-0 items-stretch rounded-card border border-line bg-surface p-2">
            <TabBarItem href="#" label="Início" icon={House} active />
            <TabBarItem href="#" label="Foco" icon={Timer} active={false} />
            <TabBarItem href="#" label="Ranking" icon={Trophy} active={false} />
          </div>
        </div>
      </Section>

      <Section title="Questão">
        <QuestionCard
          difficulty="dificil"
          typeLabel="Caso clínico"
          topic="Tecido ósseo"
          statement="Paciente de 68 anos tem fraturas após quedas leves, e a densitometria mostra baixa massa óssea. Qual desequilíbrio celular explica o quadro?"
          alternatives={ALTERNATIVES}
          selectedId={picked}
          onSelect={setPicked}
          correctId={graded ? "b" : null}
          feedback={
            graded ? (
              <>
                <span
                  className={cn("text-[15px] font-bold", picked === "b" ? "text-success-text" : "text-danger-text")}
                >
                  {picked === "b" ? "Correta!" : "Não foi dessa vez. A correta é a B."}
                </span>
                <p className="m-0 text-sm leading-[21px]">
                  Na osteoporose, a reabsorção óssea pelos osteoclastos supera a formação pelos osteoblastos.
                </p>
                <SourceTag name="Slides Aula 07" page={8} href="#" />
              </>
            ) : undefined
          }
          footer={
            graded ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setGraded(false);
                  setPicked(null);
                }}
              >
                Tentar de novo
              </Button>
            ) : (
              <Button disabled={!picked} onClick={() => setGraded(true)} className="ml-auto">
                Confirmar resposta
              </Button>
            )
          }
        />
        <Row>
          <DifficultyBadge level="facil" />
          <DifficultyBadge level="medio" />
          <DifficultyBadge level="dificil" />
          <TypeBadge>Múltipla escolha</TypeBadge>
          <SourceTag name="Slides Aula 07" page={12} prefixed />
        </Row>
      </Section>

      <Section title="Estado vazio">
        <EmptyState
          icon={Dna}
          title="Nenhum resumo ainda"
          description="Envie um arquivo e toque em “Resumir em tópicos”."
          action={<Button icon={Plus}>Novo resumo</Button>}
        />
      </Section>

      <Section title="Sobreposições">
        <Row>
          <Button variant="secondary" onClick={() => setSheetOpen(true)}>
            Abrir folha
          </Button>
          <Button variant="secondary" onClick={() => setInstallOpen(true)}>
            Folha de instalação (iOS)
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              toast({
                title: "Arquivo enviado",
                description: "Slides Aula 07.pdf · pronto para resumir",
                tone: "success",
                actions: [
                  { label: "Resumir em tópicos", onClick: () => {} },
                  { label: "Criar teste", onClick: () => {} },
                ],
              })
            }
          >
            Mostrar aviso
          </Button>
        </Row>
        <Sheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          title="Nova meta"
          description="Folha acessível: Esc fecha e o foco fica preso aqui dentro."
          footer={
            <>
              <Button variant="ghost" onClick={() => setSheetOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={() => setSheetOpen(false)}>Salvar meta</Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <Field label="Meta" placeholder="Revisar sistema esquelético" />
            <Field label="Duração" placeholder="30 min" />
          </div>
        </Sheet>
        <InstallSheet open={installOpen} onClose={() => setInstallOpen(false)} />
      </Section>
    </div>
  );
}
