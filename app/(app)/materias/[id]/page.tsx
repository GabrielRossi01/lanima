import type { Metadata } from "next";
import { SubjectDetailView } from "@/features/subjects/subject-detail-view";

// Data comes from Supabase in the browser (RLS), so the title can't name the subject here.
export const metadata: Metadata = { title: "Matéria" };

export default async function Page(props: PageProps<"/materias/[id]">) {
  const { id } = await props.params;
  return <SubjectDetailView id={id} />;
}
