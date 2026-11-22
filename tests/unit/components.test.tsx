import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Timer } from "lucide-react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "@/components/ui/button";
import { DifficultyBadge } from "@/components/ui/difficulty-badge";
import { IconButton } from "@/components/ui/icon-button";
import { Field } from "@/components/ui/input";
import { ProgressBar } from "@/components/ui/progress-bar";
import { QuestionCard } from "@/components/ui/question-card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SourceTag } from "@/components/ui/source-tag";
import { Switch } from "@/components/ui/switch";
import { TabList, TabPanel, Tabs } from "@/components/ui/tabs";

describe("Button e IconButton", () => {
  it("botão é type=button por padrão (não envia formulários sem querer)", () => {
    render(<Button>Salvar</Button>);
    expect(screen.getByRole("button", { name: "Salvar" })).toHaveAttribute("type", "button");
  });

  it("botão só de ícone tem nome acessível", () => {
    render(<IconButton icon={Timer} label="Iniciar foco" />);
    expect(screen.getByRole("button", { name: "Iniciar foco" })).toBeInTheDocument();
  });
});

describe("SegmentedControl", () => {
  function Harness() {
    const [value, setValue] = useState<"claro" | "escuro" | "auto">("claro");
    return (
      <SegmentedControl
        label="Tema"
        value={value}
        onChange={setValue}
        options={[
          { value: "claro", label: "Claro" },
          { value: "escuro", label: "Escuro" },
          { value: "auto", label: "Automático" },
        ]}
      />
    );
  }

  it("é um radiogroup navegável pelas setas", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByRole("radiogroup", { name: "Tema" })).toBeInTheDocument();
    const claro = screen.getByRole("radio", { name: "Claro" });
    expect(claro).toHaveAttribute("aria-checked", "true");

    await user.click(claro);
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Escuro" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Escuro" })).toHaveFocus();

    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(screen.getByRole("radio", { name: "Automático" })).toHaveAttribute("aria-checked", "true");
  });
});

describe("Switch", () => {
  it("alterna e expõe role=switch com rótulo", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} label="Aparecer no ranking" />);
    const toggle = screen.getByRole("switch", { name: "Aparecer no ranking" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    await user.click(toggle);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe("Field", () => {
  it("liga rótulo e mensagem de erro ao campo", () => {
    render(<Field label="Nome" error="Escreva seu nome." />);
    const input = screen.getByLabelText("Nome");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Escreva seu nome.");
  });
});

describe("Tabs", () => {
  function Harness() {
    const [tab, setTab] = useState("a");
    return (
      <Tabs value={tab} onChange={setTab}>
        <TabList
          label="Seções"
          tabs={[
            { value: "a", label: "Visão geral" },
            { value: "b", label: "Anotações" },
          ]}
        />
        <TabPanel value="a">Painel A</TabPanel>
        <TabPanel value="b">Painel B</TabPanel>
      </Tabs>
    );
  }

  it("troca de aba com as setas e mostra o painel certo", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Painel A");
    await user.click(screen.getByRole("tab", { name: "Visão geral" }));
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Anotações" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Painel B");
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName("Anotações");
  });
});

describe("QuestionCard", () => {
  const alternatives = [
    { id: "a", text: "Osteoblastos em excesso" },
    { id: "b", text: "Reabsorção maior que formação" },
  ];

  function Harness({ correctId }: { correctId?: string }) {
    const [picked, setPicked] = useState<string | null>(null);
    return (
      <QuestionCard
        difficulty="dificil"
        typeLabel="Caso clínico"
        statement="Qual desequilíbrio explica a osteoporose?"
        alternatives={alternatives}
        selectedId={picked}
        onSelect={setPicked}
        correctId={correctId}
      />
    );
  }

  it("alternativas são rádios dentro de um radiogroup", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByRole("radiogroup", { name: "Alternativas" })).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: /Reabsorção/ }));
    expect(screen.getByRole("radio", { name: /Reabsorção/ })).toHaveAttribute("aria-checked", "true");
  });

  it("depois da correção, anuncia a correta e trava a escolha", async () => {
    const user = userEvent.setup();
    render(<Harness correctId="b" />);
    expect(screen.getByRole("radio", { name: /Reabsorção.*alternativa correta/ })).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: /Osteoblastos/ }));
    expect(screen.getByRole("radio", { name: /Osteoblastos/ })).toHaveAttribute("aria-checked", "false");
  });
});

describe("selos e barras", () => {
  it("DifficultyBadge mostra o nível em português", () => {
    render(
      <>
        <DifficultyBadge level="facil" />
        <DifficultyBadge level="medio" />
        <DifficultyBadge level="dificil" />
      </>,
    );
    expect(screen.getByText("Fácil")).toBeInTheDocument();
    expect(screen.getByText("Médio")).toBeInTheDocument();
    expect(screen.getByText("Difícil")).toBeInTheDocument();
  });

  it("SourceTag segue o formato “Fonte: Slides Aula 07 · p. 12”", () => {
    render(<SourceTag name="Slides Aula 07" page={12} prefixed />);
    expect(screen.getByText("Fonte: Slides Aula 07 · p. 12")).toBeInTheDocument();
  });

  it("ProgressBar limita o valor entre 0 e 100", () => {
    render(<ProgressBar value={140} label="Progresso" />);
    expect(screen.getByRole("progressbar", { name: "Progresso" })).toHaveAttribute("aria-valuenow", "100");
  });
});
