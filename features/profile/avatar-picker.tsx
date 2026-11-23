"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { toast } from "@/components/ui/toast";
import { prepareForCrop, renderAvatar } from "@/lib/images/avatar";
import { friendlyError } from "@/lib/supabase/errors";
import { useUploadAvatar } from "./queries";

interface AvatarPickerProps {
  /** Renders the trigger; call `open()` to pick a photo. */
  children: (args: { open: () => void; busy: boolean }) => ReactNode;
  onUploaded?: () => void;
}

/**
 * Photo from the camera or the gallery (the system picker offers both), square crop with
 * drag and pinch on the device, then 512 px WebP/JPEG upload to the private bucket.
 */
export function AvatarPicker({ children, onUploaded }: AvatarPickerProps) {
  // The file input is kept in state (not a ref) because the render prop below hands out `open`.
  const [input, setInput] = useState<HTMLInputElement | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [preparing, setPreparing] = useState(false);
  const upload = useUploadAvatar();
  const openPicker = useCallback(() => input?.click(), [input]);

  useEffect(() => {
    return () => {
      if (src) URL.revokeObjectURL(src);
    };
  }, [src]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setPreparing(true);
    try {
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setSrc(await prepareForCrop(file));
    } catch (error) {
      toast({
        title: "Não foi possível abrir a foto",
        description: error instanceof Error ? error.message : undefined,
        tone: "danger",
      });
    } finally {
      setPreparing(false);
      if (input) input.value = "";
    }
  }

  async function confirm() {
    if (!src || !area) return;
    try {
      const blob = await renderAvatar(src, area);
      await upload.mutateAsync(blob);
      setSrc(null);
      toast({ title: "Foto atualizada", tone: "success" });
      onUploaded?.();
    } catch (error) {
      toast({
        title: "Não foi possível salvar a foto",
        description: friendlyError(error),
        tone: "danger",
      });
    }
  }

  const busy = preparing || upload.isPending;

  return (
    <>
      <input
        ref={setInput}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
      {children({ open: openPicker, busy })}
      <Sheet
        open={src !== null}
        onClose={() => !upload.isPending && setSrc(null)}
        title="Ajustar foto"
        description="Arraste para posicionar e use a pinça ou o controle para aproximar."
        size="s"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSrc(null)} disabled={upload.isPending}>
              Cancelar
            </Button>
            <Button onClick={confirm} disabled={!area || upload.isPending}>
              {upload.isPending ? "Salvando…" : "Usar foto"}
            </Button>
          </>
        }
      >
        {src && (
          <div className="flex flex-col gap-4">
            <div className="relative aspect-square w-full touch-none overflow-hidden rounded-lg bg-night-900">
              <Cropper
                image={src}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_, pixels) => setArea(pixels)}
              />
            </div>
            <Slider
              label="Zoom"
              valueText={`${Math.round(zoom * 100)}%`}
              value={zoom}
              min={1}
              max={3}
              step={0.05}
              onChange={setZoom}
            />
          </div>
        )}
      </Sheet>
    </>
  );
}
