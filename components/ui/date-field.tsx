"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";
import {
  addDays,
  addMonths,
  formatDate,
  maskDate,
  monthGrid,
  monthTitle,
  parseDate,
  spokenDate,
  weekdayOf,
  WEEKDAY_LONG,
  WEEKDAY_SHORT,
  type IsoDate,
} from "@/lib/dates/calendar";
import { IconButton } from "./icon-button";
import { Input, Label } from "./input";

interface DateFieldProps {
  label: string;
  /** "YYYY-MM-DD", or "" while there is no valid day. */
  value: IsoDate | "";
  onValueChange: (value: IsoDate | "") => void;
  today: IsoDate;
  error?: string;
}

/**
 * Day in dd/mm/aaaa, typed or picked in a calendar in Portuguese. Not `<input type="date">`: that
 * one follows the language of the browser or system (mm/dd/yyyy in English) and can't be changed.
 */
export function DateField({ label, value, onValueChange, today, error }: DateFieldProps) {
  const id = useId();
  const [text, setText] = useState(value ? formatDate(value) : "");
  const [lastValue, setLastValue] = useState(value);
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

  // Changed from outside (not by typing here): rewrite the text.
  if (value !== lastValue) {
    setLastValue(value);
    if ((parseDate(text) ?? "") !== value) setText(value ? formatDate(value) : "");
  }

  // The form reports the error on saving (not on blur: a message popping up moves the buttons
  // right under the finger), and it goes away as soon as the day is valid.
  const message =
    error && !parseDate(text) ? (text ? "Essa data não existe. Use dia/mês/ano, como 05/12/2026." : error) : undefined;

  function type(raw: string) {
    const next = maskDate(raw);
    setText(next);
    onValueChange(parseDate(next) ?? "");
  }

  function close() {
    setOpen(false);
    toggleRef.current?.focus();
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          placeholder="dd/mm/aaaa"
          value={text}
          onChange={(e) => type(e.target.value)}
          onFocus={(e) => e.target.select()}
          onBlur={() => {
            const day = parseDate(text);
            if (day) setText(formatDate(day)); // "5/12/2026" → "05/12/2026"
          }}
          aria-invalid={message ? true : undefined}
          aria-describedby={message ? `${id}-error` : undefined}
          className="pr-12 tabular-nums"
        />
        <button
          ref={toggleRef}
          type="button"
          aria-label={open ? "Fechar calendário" : "Abrir calendário"}
          aria-expanded={open}
          aria-controls={open ? `${id}-calendar` : undefined}
          onClick={() => setOpen((o) => !o)}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-md text-accent"
        >
          <CalendarDays aria-hidden size={18} strokeWidth={1.75} />
        </button>
      </div>
      {open && (
        <Calendar
          id={`${id}-calendar`}
          value={value}
          today={today}
          onPick={(day) => {
            setText(formatDate(day));
            onValueChange(day);
            close();
          }}
          onClose={close}
        />
      )}
      {message && (
        <p id={`${id}-error`} className="type-caption m-0 text-danger-text">
          {message}
        </p>
      )}
    </div>
  );
}

interface CalendarProps {
  id: string;
  value: IsoDate | "";
  today: IsoDate;
  onPick: (day: IsoDate) => void;
  onClose: () => void;
}

const MOVES: Record<string, (day: IsoDate) => IsoDate> = {
  ArrowLeft: (d) => addDays(d, -1),
  ArrowRight: (d) => addDays(d, 1),
  ArrowUp: (d) => addDays(d, -7),
  ArrowDown: (d) => addDays(d, 7),
  Home: (d) => addDays(d, 1 - weekdayOf(d)),
  End: (d) => addDays(d, 7 - weekdayOf(d)),
  PageUp: (d) => addMonths(d, -1),
  PageDown: (d) => addMonths(d, 1),
};

/** Month grid, Monday to Sunday. Opens in the flow of the form: nothing to clip or reposition. */
function Calendar({ id, value, today, onPick, onClose }: CalendarProps) {
  const [cursor, setCursor] = useState<IsoDate>(value || today);
  const gridRef = useRef<HTMLTableElement>(null);
  const moveFocus = useRef(true);

  // On opening and on arrow keys, focus follows the day; month buttons keep the focus they have.
  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    const day = gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${cursor}"]`);
    day?.focus({ preventScroll: true });
    gridRef.current?.closest("[data-calendar]")?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      // Only the calendar closes: without this, Esc would also close the sheet around it.
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
  }

  function onGridKeyDown(event: KeyboardEvent) {
    const move = MOVES[event.key];
    if (!move) return;
    event.preventDefault();
    moveFocus.current = true;
    setCursor(move(cursor));
  }

  return (
    <div
      id={id}
      data-calendar
      role="group"
      aria-label="Calendário"
      onKeyDown={onKeyDown}
      className="scroll-mb-4 rounded-lg border border-line bg-surface-alt p-2"
    >
      <div className="flex items-center justify-between gap-2">
        <IconButton
          icon={ChevronLeft}
          label="Mês anterior"
          variant="ghost"
          onClick={() => setCursor(addMonths(cursor, -1))}
        />
        <span aria-live="polite" className="text-sm font-semibold first-letter:uppercase">
          {monthTitle(cursor)}
        </span>
        <IconButton
          icon={ChevronRight}
          label="Próximo mês"
          variant="ghost"
          onClick={() => setCursor(addMonths(cursor, 1))}
        />
      </div>
      <table
        ref={gridRef}
        role="grid"
        aria-label={monthTitle(cursor)}
        onKeyDown={onGridKeyDown}
        className="w-full table-fixed"
      >
        <thead>
          <tr>
            {WEEKDAY_SHORT.map((day, i) => (
              <th key={day} scope="col" abbr={WEEKDAY_LONG[i]} className="h-8 p-0 text-xs font-semibold text-fg-2">
                {day}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {monthGrid(cursor).map((week) => (
            <tr key={week[0]}>
              {week.map((day) => {
                const selected = day === value;
                const outside = day.slice(0, 7) !== cursor.slice(0, 7);
                return (
                  <td key={day} aria-selected={selected} className="p-0 text-center">
                    <button
                      type="button"
                      data-day={day}
                      tabIndex={day === cursor ? 0 : -1}
                      aria-label={`${spokenDate(day)}${day === today ? " (hoje)" : ""}`}
                      onClick={() => onPick(day)}
                      className={cn(
                        "group flex h-11 w-full items-center justify-center rounded-md text-sm tabular-nums",
                        outside ? "text-fg-2" : "text-fg",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-10 items-center justify-center rounded-full",
                          selected
                            ? "bg-btn font-semibold text-white"
                            : cn(
                                "group-hover:bg-active",
                                day === today && "font-semibold ring-[1.5px] ring-brand ring-inset",
                              ),
                        )}
                      >
                        {Number(day.slice(8))}
                      </span>
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
