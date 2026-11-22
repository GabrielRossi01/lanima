import type { LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "./page-header";

interface ComingSoonProps {
  title: string;
  icon: LucideIcon;
  /** What this screen will do, in one sentence. */
  description: string;
  phase: number;
}

/** Placeholder for screens built in later phases. */
export function ComingSoon({ title, icon, description, phase }: ComingSoonProps) {
  return (
    <>
      <PageHeader title={title} />
      <EmptyState icon={icon} title="Em construção" description={`${description} Chega na fase ${phase}.`} />
    </>
  );
}
