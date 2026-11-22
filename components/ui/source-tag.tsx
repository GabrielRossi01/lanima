import Link from "next/link";
import { FileText } from "lucide-react";
import { cn } from "@/lib/cn";

interface SourceTagProps {
  /** File or document name, e.g. "Slides Aula 07". */
  name: string;
  page?: number;
  /** Opens the file at the source page. Without it the tag is static text. */
  href?: string;
  /** Show the "Fonte:" prefix. */
  prefixed?: boolean;
  className?: string;
}

export function sourceLabel(name: string, page?: number) {
  return page !== undefined ? `${name} · p. ${page}` : name;
}

export function SourceTag({ name, page, href, prefixed = false, className }: SourceTagProps) {
  const text = sourceLabel(name, page);
  const classes = cn(
    "inline-flex min-h-6 max-w-full items-center gap-1 rounded-sm bg-surface-alt px-2 text-xs font-medium text-accent no-underline",
    href && "relative hover:bg-active before:absolute before:-inset-y-2.5 before:inset-x-0 before:content-['']",
    className,
  );
  const content = (
    <>
      <FileText aria-hidden size={13} strokeWidth={1.75} className="shrink-0" />
      <span className="truncate">
        {prefixed && "Fonte: "}
        {text}
      </span>
    </>
  );
  if (!href) return <span className={classes}>{content}</span>;
  return (
    <Link href={href} className={classes} aria-label={`Abrir fonte: ${text}`}>
      {content}
    </Link>
  );
}
