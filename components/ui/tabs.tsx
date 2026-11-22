"use client";

import { createContext, useContext, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";

interface TabsContextValue {
  baseId: string;
  value: string;
  onChange: (value: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabs() {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error("Tabs components must be used inside <Tabs>");
  return ctx;
}

interface TabsProps {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  className?: string;
}

export function Tabs({ value, onChange, children, className }: TabsProps) {
  const baseId = useId();
  return (
    <TabsContext.Provider value={{ baseId, value, onChange }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

interface TabListProps {
  label: string;
  tabs: readonly { value: string; label: string; count?: number }[];
  className?: string;
}

/** Underlined tab strip (subject page). Scrolls horizontally on narrow screens. */
export function TabList({ label, tabs, className }: TabListProps) {
  const { baseId, value, onChange } = useTabs();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: KeyboardEvent, index: number) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    onChange(tabs[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn("flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none]", className)}
    >
      {tabs.map((tab, index) => {
        const selected = tab.value === value;
        return (
          <button
            key={tab.value}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="tab"
            id={`${baseId}-tab-${tab.value}`}
            aria-selected={selected}
            aria-controls={`${baseId}-panel-${tab.value}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.value)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={cn(
              "-mb-px inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 text-sm transition-colors duration-150",
              selected
                ? "border-brand font-semibold text-accent"
                : "border-transparent font-medium text-fg-2 hover:text-fg",
            )}
          >
            {tab.label}
            {tab.count !== undefined && <span className="text-xs opacity-70">{tab.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

interface TabPanelProps {
  value: string;
  children: ReactNode;
  className?: string;
}

export function TabPanel({ value, children, className }: TabPanelProps) {
  const { baseId, value: current } = useTabs();
  if (value !== current) return null;
  return (
    <div
      role="tabpanel"
      id={`${baseId}-panel-${value}`}
      aria-labelledby={`${baseId}-tab-${value}`}
      tabIndex={0}
      className={className}
    >
      {children}
    </div>
  );
}
