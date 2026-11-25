"use client";

import { create } from "zustand";

interface AudioState {
  /** Whether the ambient sound is really coming out, for the parts of the screen that say so. */
  playing: boolean;
  /** For this visit only: the saved volume stays as it is. */
  muted: boolean;
}

export const useAudioState = create<AudioState>()(() => ({ playing: false, muted: false }));
