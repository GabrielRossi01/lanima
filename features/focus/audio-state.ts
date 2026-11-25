"use client";

import { create } from "zustand";

/** Whether the ambient sound is really coming out, for the parts of the screen that say so. */
export const useAudioState = create<{ playing: boolean }>()(() => ({ playing: false }));
