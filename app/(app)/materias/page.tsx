import type { Metadata } from "next";
import { SubjectsView } from "@/features/subjects/subjects-view";

export const metadata: Metadata = { title: "Matérias" };

export default function Page() {
  return <SubjectsView />;
}
