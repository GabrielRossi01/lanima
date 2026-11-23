import { describe, expect, it } from "vitest";
import { addDays, dayMonth, daysBetween, relativeDays, todayIn, weekdayOf, weekOf } from "@/lib/dates/calendar";
import { formatDuration, goalWhen, overdueLabel, todayList, weekProgress, type GoalRow } from "@/lib/goals/goals";
import { normalizeText, searchItems, type SearchItem } from "@/lib/search/search";
import {
  formatSchedule,
  formatTimeShort,
  hasLab,
  minuteOfWeek,
  minutesToNextClass,
  parseSlots,
  type ScheduleSlot,
} from "@/lib/subjects/schedule";
import {
  assessmentPill,
  matchesFilter,
  nextAssessment,
  parseSyllabus,
  positionAt,
  progressOf,
  recentSubjects,
  sortSummaries,
  summarize,
  toSubject,
  type AssessmentRow,
  type SubjectRow,
  type TopicRow,
} from "@/lib/subjects/subjects";

describe("datas no fuso de São Paulo", () => {
  it("o dia muda à meia-noite de Brasília, não à de Greenwich", () => {
    // 02:30 UTC on the 24th is still 23:30 on the 23rd in São Paulo (UTC−3).
    expect(todayIn(new Date("2026-11-24T02:30:00Z"))).toBe("2026-11-23");
    expect(todayIn(new Date("2026-11-24T03:00:00Z"))).toBe("2026-11-24");
  });

  it("semana de segunda a domingo", () => {
    expect(weekOf("2026-11-23")).toEqual({ start: "2026-11-23", end: "2026-11-29" }); // Monday
    expect(weekOf("2026-11-29")).toEqual({ start: "2026-11-23", end: "2026-11-29" }); // Sunday
    expect(weekOf("2026-12-02")).toEqual({ start: "2026-11-30", end: "2026-12-06" }); // across months
    expect(weekdayOf("2026-11-23")).toBe(1);
    expect(weekdayOf("2026-11-29")).toBe(7);
  });

  it("conta dias e escreve datas em português", () => {
    expect(daysBetween("2026-11-23", "2026-12-05")).toBe(12);
    expect(daysBetween("2026-11-23", "2026-11-20")).toBe(-3);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-03-01", -1)).toBe("2027-02-28");
    expect(dayMonth("2026-12-05")).toBe("5 de dezembro");
    expect(["hoje", "amanhã", "em 6 dias", "ontem", "há 3 dias"]).toEqual([
      relativeDays("2026-11-23", "2026-11-23"),
      relativeDays("2026-11-23", "2026-11-24"),
      relativeDays("2026-11-23", "2026-11-29"),
      relativeDays("2026-11-23", "2026-11-22"),
      relativeDays("2026-11-23", "2026-11-20"),
    ]);
  });
});

const slot = (day: number, start: string, lab = false, room?: string): ScheduleSlot => ({ day, start, lab, room });

describe("horário das aulas", () => {
  it("escreve como nos mockups", () => {
    expect(formatSchedule([slot(3, "08:00"), slot(1, "08:00")])).toBe("Seg e Qua · 08h00");
    expect(formatSchedule([slot(1, "14:00", true)])).toBe("Seg · 14h00 · lab");
    expect(formatSchedule([slot(1, "08:00"), slot(3, "08:00"), slot(5, "08:00")])).toBe("Seg, Qua e Sex · 08h00");
    expect(formatSchedule([slot(1, "08:00"), slot(3, "10:00", true)])).toBe("Seg 08h00 · Qua 10h00 (lab)");
    expect(formatSchedule([])).toBe("");
    expect(formatTimeShort("08:00")).toBe("08h");
    expect(formatTimeShort("14:30")).toBe("14h30");
    expect(hasLab([slot(1, "08:00"), slot(2, "10:00", true)])).toBe(true);
  });

  it("ignora aulas malformadas vindas do banco", () => {
    expect(parseSlots([{ day: 1, start: "08:00", lab: false }, { day: 9, start: "x" }, "lixo"])).toEqual([
      { day: 1, start: "08:00", lab: false },
    ]);
    expect(parseSlots(null)).toEqual([]);
  });

  it("minutos até a próxima aula, no fuso de São Paulo", () => {
    // Monday 2026-11-23 10:00 in São Paulo = 13:00 UTC.
    const mondayTen = new Date("2026-11-23T13:00:00Z");
    expect(minuteOfWeek(mondayTen)).toBe(600);
    expect(minutesToNextClass([slot(1, "14:00")], mondayTen)).toBe(240);
    // A class that started 30 min ago still counts as the current one.
    expect(minutesToNextClass([slot(1, "09:30")], mondayTen)).toBe(-30);
    // One that ended long ago is next week.
    expect(minutesToNextClass([slot(1, "08:00")], mondayTen)).toBe(7 * 1440 - 120);
    expect(minutesToNextClass([], mondayTen)).toBe(Number.POSITIVE_INFINITY);
  });
});

const now = "2026-11-23T12:00:00Z";
function subjectRow(id: string, name: string, extra: Partial<SubjectRow> = {}): SubjectRow {
  return {
    id,
    user_id: "u",
    name,
    color: "celeste",
    icon: "book-open",
    professor: null,
    archived: false,
    schedule_slots: [],
    created_at: now,
    updated_at: now,
    ...extra,
  };
}
function topic(subject_id: string, done: boolean, position: number, updated_at = now): TopicRow {
  return {
    id: `${subject_id}-${position}`,
    user_id: "u",
    subject_id,
    title: `T${position}`,
    done,
    position,
    created_at: now,
    updated_at,
  };
}
function assessment(subject_id: string, title: string, date: string): AssessmentRow {
  return {
    id: `${subject_id}-${title}`,
    user_id: "u",
    subject_id,
    title,
    kind: "prova",
    date,
    description: null,
    created_at: now,
    updated_at: now,
  };
}

describe("matérias", () => {
  it("progresso pelos tópicos concluídos", () => {
    expect(progressOf([])).toBe(0);
    expect(progressOf([{ done: true }, { done: false }, { done: false }])).toBe(33);
    expect(progressOf([{ done: true }, { done: true }])).toBe(100);
  });

  it("próxima avaliação a partir de hoje, e a pílula", () => {
    const list = [
      assessment("s", "P2", "2026-12-10"),
      assessment("s", "Antiga", "2026-11-01"),
      assessment("s", "P1", "2026-11-29"),
    ];
    expect(nextAssessment(list, "2026-11-23")?.title).toBe("P1");
    expect(assessmentPill(nextAssessment(list, "2026-11-23")!, "2026-11-23")).toBe("P1 em 6 dias");
    expect(assessmentPill(assessment("s", "Prova", "2026-11-23"), "2026-11-23")).toBe("Prova hoje");
    expect(nextAssessment([assessment("s", "Antiga", "2026-11-01")], "2026-11-23")).toBeUndefined();
  });

  it("filtros e ordenação", () => {
    const subjects = [
      toSubject(subjectRow("a", "Anatomia", { schedule_slots: [slot(3, "08:00")] })),
      toSubject(subjectRow("b", "Bioquímica", { schedule_slots: [slot(1, "14:00")] })),
      toSubject(subjectRow("h", "Histologia", { schedule_slots: [slot(2, "14:00", true)] })),
      toSubject(subjectRow("x", "Arquivada", { archived: true })),
    ];
    const summaries = summarize(
      subjects,
      [],
      [assessment("b", "P1", "2026-11-29"), assessment("a", "P1", "2026-12-20")],
      "2026-11-23",
    );
    const ids = (filter: Parameters<typeof matchesFilter>[1]) =>
      summaries.filter((s) => matchesFilter(s, filter, "2026-11-23")).map((s) => s.subject.id);
    expect(ids("todas")).toEqual(["a", "b", "h"]);
    expect(ids("prova")).toEqual(["b"]); // within 14 days
    expect(ids("lab")).toEqual(["h"]);
    expect(ids("arquivadas")).toEqual(["x"]);

    const mondayTen = new Date("2026-11-23T13:00:00Z");
    const order = (sort: Parameters<typeof sortSummaries>[1]) =>
      sortSummaries(summaries.slice(0, 3), sort, mondayTen, "2026-11-23").map((s) => s.subject.id);
    expect(order("proxima-aula")).toEqual(["b", "h", "a"]); // Mon 14h, Tue 14h, Wed 8h
    expect(order("proxima-avaliacao")).toEqual(["b", "a", "h"]);
    expect(order("nome")).toEqual(["a", "b", "h"]);
  });

  it("continuar estudando: as mexidas mais recentemente", () => {
    const subjects = ["a", "b", "c", "d"].map((id) => toSubject(subjectRow(id, id.toUpperCase())));
    const topics = [topic("c", true, 1, "2026-11-23T15:00:00Z"), topic("a", false, 1, "2026-11-23T14:00:00Z")];
    expect(recentSubjects(summarize(subjects, topics, [], "2026-11-23")).map((s) => s.subject.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("reordenar escreve só a posição do item movido", () => {
    const list = [{ position: 1 }, { position: 2 }, { position: 3 }];
    expect(positionAt(list, 0)).toBe(0);
    expect(positionAt(list, 1)).toBe(1.5);
    expect(positionAt(list, 3)).toBe(4);
    expect(positionAt([], 0)).toBe(1);
  });

  it("lê o plano de ensino colado", () => {
    const pasted = `
      1. Introdução e planos anatômicos
      2) Sistema esquelético
      - Articulações
      • Sistema   muscular
      a) Sistema nervoso
      1.2 Sistema cardiovascular
      sistema esquelético

      3D da coluna vertebral
    `;
    expect(parseSyllabus(pasted)).toEqual([
      "Introdução e planos anatômicos",
      "Sistema esquelético",
      "Articulações",
      "Sistema muscular",
      "Sistema nervoso",
      "Sistema cardiovascular",
      "3D da coluna vertebral",
    ]);
  });
});

function goal(id: string, date: string, extra: Partial<GoalRow> = {}): GoalRow {
  return {
    id,
    user_id: "u",
    subject_id: null,
    title: id,
    duration_min: 30,
    time_of_day: null,
    date,
    completed_at: null,
    created_at: now,
    updated_at: now,
    ...extra,
  };
}

describe("metas", () => {
  it("duração ou horário", () => {
    expect(formatDuration(30)).toBe("30 min");
    expect(formatDuration(60)).toBe("1h");
    expect(formatDuration(90)).toBe("1h30");
    expect(goalWhen({ duration_min: 40, time_of_day: null })).toBe("40 min");
    expect(goalWhen({ duration_min: null, time_of_day: "16:00:00" })).toBe("16h");
    expect(goalWhen({ duration_min: 30, time_of_day: "16:30" })).toBe("16h30");
    expect(goalWhen({ duration_min: null, time_of_day: null })).toBe("");
  });

  it("metas de hoje com as atrasadas no topo", () => {
    const goals = [
      goal("hoje-sem-hora", "2026-11-23"),
      goal("hoje-16h", "2026-11-23", { time_of_day: "16:00:00" }),
      goal("ontem", "2026-11-22"),
      goal("ontem-feita", "2026-11-22", { completed_at: now }),
      goal("antiga-demais", "2026-11-01"),
      goal("amanha", "2026-11-24"),
    ];
    const list = todayList(goals, "2026-11-23");
    expect(list.overdue.map((g) => g.id)).toEqual(["ontem"]);
    expect(list.today.map((g) => g.id)).toEqual(["hoje-16h", "hoje-sem-hora"]);
    expect(overdueLabel(goal("x", "2026-11-22"), "2026-11-23")).toBe("de ontem");
    expect(overdueLabel(goal("x", "2026-11-20"), "2026-11-23")).toBe("de 20 nov");
  });

  it("metas da semana contam de segunda a domingo", () => {
    const goals = [
      goal("seg", "2026-11-23", { completed_at: now }),
      goal("qua", "2026-11-25"),
      goal("dom", "2026-11-29", { completed_at: now }),
      goal("domingo-passado", "2026-11-22", { completed_at: now }),
    ];
    expect(weekProgress(goals, "2026-11-26")).toEqual({ done: 2, total: 3 });
  });
});

describe("busca", () => {
  const items: SearchItem[] = [
    { kind: "materia", id: "1", title: "Bioquímica", detail: "Ter e Qui · 10h00", href: "/materias/1" },
    { kind: "topico", id: "2", title: "Enzimas e cinética", detail: "Bioquímica", href: "/materias/1" },
    { kind: "avaliacao", id: "3", title: "P1", detail: "Bioquímica · 29 nov", href: "/materias/1" },
    { kind: "materia", id: "4", title: "Anatomia Humana", detail: "", href: "/materias/4" },
  ];

  it("ignora acentos e maiúsculas", () => {
    expect(normalizeText("Bioquímica CINÉTICA")).toBe("bioquimica cinetica");
    // Title match first; then alphabetical among equal matches.
    expect(searchItems(items, "bioquimica").map((i) => i.id)).toEqual(["1", "2", "3"]);
    expect(searchItems(items, "enzimas bioq").map((i) => i.id)).toEqual(["2"]);
    expect(searchItems(items, "  ")).toEqual([]);
    expect(searchItems(items, "farmaco")).toEqual([]);
  });
});
