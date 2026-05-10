import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Eraser, PenLine } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SignaturePadProps {
  /** Called whenever the user finishes a stroke. Returns a PNG dataURL or "" if empty. */
  onChange?: (dataUrl: string) => void;
  /** Pen color */
  color?: string;
  /** Pen width in CSS px */
  penWidth?: number;
  /** Drawable height in CSS px (default 180) */
  height?: number;
  className?: string;
  disabled?: boolean;
}

/**
 * A lightweight canvas-based signature pad. No external dependencies.
 * Captures the signature as a base64 PNG dataURL via `onChange` and `getDataUrl()`.
 */
export function SignaturePad({
  onChange,
  color = "#0a0a0a",
  penWidth = 2.2,
  height = 180,
  className,
  disabled = false,
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(false);

  // Track DPR for sharp rendering
  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = container.clientWidth;
    const cssHeight = height;
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    canvas.width = Math.floor(cssWidth * dpr);
    canvas.height = Math.floor(cssHeight * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = color;
    ctx.lineWidth = penWidth;
    // White background so PDFs render correctly (canvas default is transparent)
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cssWidth, cssHeight);
  }, [height, color, penWidth]);

  useEffect(() => {
    setupCanvas();
    const onResize = () => setupCanvas();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [setupCanvas]);

  const getPos = (e: PointerEvent | React.PointerEvent): { x: number; y: number } => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent) => {
    if (disabled) return;
    const canvas = canvasRef.current!;
    canvas.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    lastPointRef.current = getPos(e);
    e.preventDefault();
  };

  const move = (e: React.PointerEvent) => {
    if (!drawingRef.current || disabled) return;
    const ctx = canvasRef.current!.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    const last = lastPointRef.current!;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPointRef.current = pos;
    e.preventDefault();
  };

  const end = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    setHasInk(true);
    const url = canvasRef.current!.toDataURL("image/png");
    onChange?.(url);
  };

  const clear = () => {
    setupCanvas();
    setHasInk(false);
    onChange?.("");
  };

  return (
    <div ref={containerRef} className={cn("w-full", className)}>
      <div
        className={cn(
          "relative rounded-lg border-2 border-dashed bg-white overflow-hidden",
          disabled ? "opacity-60" : "border-muted-foreground/30 hover:border-muted-foreground/50",
        )}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          onPointerLeave={end}
          className="block touch-none cursor-crosshair"
          style={{ height }}
        />
        {!hasInk && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-muted-foreground/60 text-sm">
            <PenLine className="h-4 w-4 mr-2" /> Sign here
          </div>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          By signing, you agree this electronic signature is legally binding.
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={clear}
          disabled={disabled || !hasInk}
          className="h-7 text-xs gap-1"
        >
          <Eraser className="h-3.5 w-3.5" /> Clear
        </Button>
      </div>
    </div>
  );
}

export default SignaturePad;
