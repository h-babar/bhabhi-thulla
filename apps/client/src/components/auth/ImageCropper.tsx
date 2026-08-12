import { Check, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

const PREVIEW_SIZE = 320;
const OUTPUT_SIZE = 512;

export function ImageCropper({ sourceUrl, onCancel, onComplete }: {
  sourceUrl: string;
  onCancel: () => void;
  onComplete: (blob: Blob) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | undefined>(undefined);
  const dragRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | undefined>(undefined);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);

  const clampedOffset = useCallback((next: { x: number; y: number }, nextZoom = zoom) => {
    const image = imageRef.current;
    if (!image) return next;
    const baseScale = Math.max(PREVIEW_SIZE / image.naturalWidth, PREVIEW_SIZE / image.naturalHeight);
    const width = image.naturalWidth * baseScale * nextZoom;
    const height = image.naturalHeight * baseScale * nextZoom;
    const limitX = Math.max(0, (width - PREVIEW_SIZE) / 2);
    const limitY = Math.max(0, (height - PREVIEW_SIZE) / 2);
    return {
      x: Math.max(-limitX, Math.min(limitX, next.x)),
      y: Math.max(-limitY, Math.min(limitY, next.y))
    };
  }, [zoom]);

  const draw = useCallback((target: HTMLCanvasElement, size: number, currentZoom: number, currentOffset: { x: number; y: number }) => {
    const image = imageRef.current;
    const context = target.getContext("2d");
    if (!image || !context) return;
    target.width = size;
    target.height = size;
    const previewScale = Math.max(PREVIEW_SIZE / image.naturalWidth, PREVIEW_SIZE / image.naturalHeight) * currentZoom;
    const outputRatio = size / PREVIEW_SIZE;
    const width = image.naturalWidth * previewScale * outputRatio;
    const height = image.naturalHeight * previewScale * outputRatio;
    context.clearRect(0, 0, size, size);
    context.drawImage(
      image,
      (size - width) / 2 + currentOffset.x * outputRatio,
      (size - height) / 2 + currentOffset.y * outputRatio,
      width,
      height
    );
  }, []);

  useEffect(() => {
    const image = new Image();
    image.onload = () => {
      imageRef.current = image;
      setReady(true);
    };
    image.src = sourceUrl;
    return () => { image.onload = null; };
  }, [sourceUrl]);

  useEffect(() => {
    if (ready && canvasRef.current) draw(canvasRef.current, PREVIEW_SIZE, zoom, offset);
  }, [draw, offset, ready, zoom]);

  const setNextZoom = (value: number) => {
    const nextZoom = Math.max(1, Math.min(3, value));
    setZoom(nextZoom);
    setOffset((current) => clampedOffset(current, nextZoom));
  };

  const finish = async () => {
    setSaving(true);
    const canvas = document.createElement("canvas");
    draw(canvas, OUTPUT_SIZE, zoom, offset);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.88));
    setSaving(false);
    if (blob) onComplete(blob);
  };

  return (
    <section className="image-cropper">
      <div
        className="image-cropper-stage"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          dragRef.current = { x: event.clientX, y: event.clientY, offsetX: offset.x, offsetY: offset.y };
        }}
        onPointerMove={(event) => {
          if (!dragRef.current) return;
          setOffset(clampedOffset({
            x: dragRef.current.offsetX + event.clientX - dragRef.current.x,
            y: dragRef.current.offsetY + event.clientY - dragRef.current.y
          }));
        }}
        onPointerUp={() => { dragRef.current = undefined; }}
        onPointerCancel={() => { dragRef.current = undefined; }}
      >
        <canvas ref={canvasRef} aria-label="Circular crop preview. Drag to reposition the image." />
        <span aria-hidden="true" />
      </div>
      <div className="image-cropper-zoom">
        <ZoomOut size={17} aria-hidden="true" />
        <input aria-label="Crop zoom" type="range" min="1" max="3" step="0.01" value={zoom} onChange={(event) => setNextZoom(Number(event.target.value))} />
        <ZoomIn size={17} aria-hidden="true" />
      </div>
      <div className="image-cropper-actions">
        <button type="button" onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }}><RotateCcw size={16} /> Reset</button>
        <button type="button" onClick={onCancel}>Cancel</button>
        <button type="button" className="is-primary" disabled={!ready || saving} onClick={() => void finish()}><Check size={17} /> {saving ? "Preparing..." : "Use Photo"}</button>
      </div>
    </section>
  );
}
