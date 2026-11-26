import type { Metadata } from "next";
import { SummaryView } from "@/features/study/summary-view";

// Data comes from Supabase in the browser (RLS), so the title can't name the summary here.
export const metadata: Metadata = { title: "Resumo" };

export default async function Page(props: PageProps<"/estudo/resumo/[id]">) {
  const { id } = await props.params;
  return <SummaryView id={id} />;
}
