import { ShieldCheck } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface SignatureMeta {
  signerName?: string | null;
  signerIp?: string | null;
  signerUserAgent?: string | null;
  signedAt?: string | Date | null;
}

function fmtUTC(d: string | Date) {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toUTCString();
}

/**
 * "Signature Verified" badge. Hover/tap to see signer name, IP, UTC timestamp, UA.
 */
export function SignatureBadge({
  meta,
  className,
  compact = false,
}: {
  meta: SignatureMeta | null | undefined;
  className?: string;
  compact?: boolean;
}) {
  if (!meta || !meta.signedAt) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 text-green-700 font-semibold cursor-help",
            compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs",
            className,
          )}
        >
          <ShieldCheck className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
          Signature Verified
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-sm">
        <div className="space-y-1 text-xs">
          {meta.signerName ? (
            <div>
              <span className="text-muted-foreground">Signed by: </span>
              <span className="font-semibold">{meta.signerName}</span>
            </div>
          ) : null}
          <div>
            <span className="text-muted-foreground">When (UTC): </span>
            <span className="font-mono">{fmtUTC(meta.signedAt)}</span>
          </div>
          {meta.signerIp ? (
            <div>
              <span className="text-muted-foreground">IP: </span>
              <span className="font-mono">{meta.signerIp}</span>
            </div>
          ) : null}
          {meta.signerUserAgent ? (
            <div className="break-all">
              <span className="text-muted-foreground">UA: </span>
              <span className="font-mono text-[10px]">{meta.signerUserAgent}</span>
            </div>
          ) : null}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

