"use client";

import { create } from "zustand";

/** Last screen with the menu in this visit: where minimizing the focus mode goes back to. */
export const useLastPath = create<{ path: string }>()(() => ({ path: "/inicio" }));
