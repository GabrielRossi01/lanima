"use client";

import { BookOpen, Check, Flame, Play, Target, Timer } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricCard } from "@/components/ui/metric-card";
import { SearchField } from "@/components/ui/input";
import { greetingFor, longDate } from "@/lib/dates/greeting";
import { useNow } from "@/lib/hooks/use-now";

/**
 * Phase 1 home: real greeting and layout, empty states instead of data.
 * Metrics, goals and ranking are wired to Supabase in phase 3.
 */
export function HomeView() {
  const now = useNow();
  const [query, setQuery] = useState("");

  return (
    <>
      <PageHeader
        title={now ? `${greetingFor(now)}!` : " "}
        subtitle={now ? longDate(now) : " "}
        actions={
          <>
            <SearchField value={query} onValueChange={setQuery} className="w-full md:w-60" />
            <ButtonLink href="/foco" icon={Play}>
              Iniciar foco
            </ButtonLink>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard icon={Timer} value="0m" label="Foco hoje · meta 2h" />
        <MetricCard icon={Flame} color="amarelo" value="0 dias" label="Sequência de estudo" />
        <MetricCard icon={Check} color="verde" value="0 de 0" label="Metas da semana" />
        <MetricCard icon={Target} color="rosa" value="–" label="Acerto médio nos testes" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_290px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <CardHeader title="Metas de hoje" />
            <p className="type-body m-0 text-fg-2">Nenhuma meta para hoje. As metas chegam na fase 3.</p>
          </Card>
          <EmptyState
            icon={BookOpen}
            title="Nenhuma matéria ainda"
            description="Suas matérias aparecem aqui com o progresso de cada uma."
          />
        </div>
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title="Ranking da semana" />
            <p className="type-body m-0 text-fg-2">Entre num grupo para ver o ranking com as amigas.</p>
          </Card>
          <Card tone="deep" className="gap-2.5">
            <span className="type-overline text-on-deep-2">Próxima prova</span>
            <span className="font-serif text-[28px] leading-9 font-semibold">Nenhuma marcada</span>
            <span className="type-body text-on-deep-2">Cadastre as avaliações em cada matéria.</span>
          </Card>
        </div>
      </div>
    </>
  );
}
