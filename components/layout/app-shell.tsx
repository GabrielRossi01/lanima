"use client";

import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { IconButton } from "@/components/ui/icon-button";
import { Logo } from "@/components/ui/logo";
import { NavItem, TabBarItem } from "@/components/ui/nav-item";
import { Sheet } from "@/components/ui/sheet";
import { FocusIndicator } from "@/features/focus/focus-indicator";
import { useLastPath } from "@/features/focus/last-path";
import { cn } from "@/lib/cn";
import { InstallEntry } from "./install-entry";
import { OfflineBanner } from "./offline-banner";
import { isActivePath, MORE_ICON, MORE_NAV, PRIMARY_NAV, TAB_BAR_NAV } from "./nav-config";
import { ProfileCard } from "./profile-card";

function SidebarContent({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <>
      {/* Short screens (tablet landscape): room for the focus indicator above the profile. */}
      <div className="px-2 pb-5 [@media(height<700px)]:pb-2">
        <Logo />
      </div>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {PRIMARY_NAV.map((item) => (
          <li key={item.href}>
            <NavItem {...item} active={isActivePath(pathname, item.href)} onNavigate={onNavigate} />
          </li>
        ))}
      </ul>
      <div className="flex-1" />
      <InstallEntry className="mb-2" />
      <FocusIndicator variant="card" onNavigate={onNavigate} className="mb-2 shrink-0" />
      <ProfileCard onNavigate={onNavigate} active={isActivePath(pathname, "/perfil")} />
    </>
  );
}

/**
 * Responsive app frame (section 4.4):
 * - ≥ 1024 px: 248 px sidebar.
 * - 768–1023 px (tablet portrait): 72 px icon rail; the menu button opens the full sidebar over the content.
 * - < 768 px: bottom tab bar; "Mais" opens a sheet with the rest.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  // Where minimizing the focus mode comes back to.
  useEffect(() => useLastPath.setState({ path: pathname }), [pathname]);
  const moreActive = MORE_NAV.some((n) => isActivePath(pathname, n.href)) || isActivePath(pathname, "/perfil");

  return (
    <div className="flex min-h-dvh bg-bg">
      <a
        href="#conteudo"
        className="sr-only z-50 rounded-full bg-btn px-5 py-3 font-semibold text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Pular para o conteúdo
      </a>

      {/* Desktop and tablet landscape. */}
      <nav
        aria-label="Principal"
        className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col gap-1 overflow-y-auto border-r border-line bg-surface py-6 [@media(height<700px)]:py-3 pr-4 pl-[max(16px,env(safe-area-inset-left))] lg:flex"
      >
        <SidebarContent pathname={pathname} />
      </nav>

      {/* Tablet portrait rail. */}
      <nav
        aria-label="Principal"
        className="sticky top-0 hidden h-dvh w-[72px] shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-line bg-surface py-5 md:flex lg:hidden"
      >
        <IconButton
          icon={Menu}
          label="Abrir menu"
          variant="ghost"
          onClick={() => setDrawerOpen(true)}
          aria-expanded={drawerOpen}
          aria-haspopup="dialog"
          className="mb-3"
        />
        <ul className="m-0 flex list-none flex-col items-center gap-1 p-0">
          {PRIMARY_NAV.map((item) => (
            <li key={item.href}>
              <NavItem {...item} compact active={isActivePath(pathname, item.href)} />
            </li>
          ))}
        </ul>
        <div className="flex-1" />
        <InstallEntry compact className="mb-2" />
        <FocusIndicator variant="rail" className="mb-2 shrink-0" />
        <ProfileCard compact active={isActivePath(pathname, "/perfil")} />
      </nav>
      <Sheet
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        side="left"
        title="Menu"
        hideTitle
        className="lg:hidden"
      >
        <div className="flex min-h-[calc(100dvh-88px)] flex-col gap-1">
          <SidebarContent pathname={pathname} onNavigate={() => setDrawerOpen(false)} />
        </div>
      </Sheet>

      <main
        id="conteudo"
        tabIndex={-1}
        className={cn(
          "min-w-0 flex-1 outline-none",
          "px-[max(16px,env(safe-area-inset-left))] pt-[max(20px,env(safe-area-inset-top))]",
          "pb-[calc(96px+var(--focus-bar,0px)+env(safe-area-inset-bottom))] md:px-7 md:pt-7 md:pb-8 lg:px-8",
        )}
      >
        <OfflineBanner />
        {children}
      </main>

      {/* Phone: above the tab bar (61 px tall, plus its bottom padding). */}
      <FocusIndicator
        variant="bar"
        className="inset-x-[max(8px,env(safe-area-inset-left))] bottom-[calc(69px+max(8px,env(safe-area-inset-bottom)))] z-40 shadow-float md:hidden"
      />

      {/* Phone tab bar. */}
      <nav
        aria-label="Principal"
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-surface px-2 pt-2 pb-[max(8px,env(safe-area-inset-bottom))] md:hidden"
      >
        {TAB_BAR_NAV.map((item) => (
          <TabBarItem key={item.href} {...item} active={isActivePath(pathname, item.href)} />
        ))}
        <TabBarItem
          label="Mais"
          icon={MORE_ICON}
          active={moreActive}
          onClick={() => setMoreOpen(true)}
          expanded={moreOpen}
        />
      </nav>
      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} side="bottom" title="Mais" className="md:hidden">
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {MORE_NAV.map((item) => (
            <li key={item.href}>
              <NavItem {...item} active={isActivePath(pathname, item.href)} onNavigate={() => setMoreOpen(false)} />
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
          <InstallEntry />
          <ProfileCard onNavigate={() => setMoreOpen(false)} active={isActivePath(pathname, "/perfil")} />
        </div>
      </Sheet>
    </div>
  );
}
