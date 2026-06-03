import { useSignedOrDirectUrl } from "@/hooks/useSignedUrl";
import { Loader2 } from "lucide-react";

interface SignedAvatarProps {
  url: string | null | undefined;
  sizeClass?: string;
  initials?: string;
  style?: React.CSSProperties;
  className?: string;
  fallback?: React.ReactNode;
}

export function SignedAvatar({ url, sizeClass = "w-10 h-10", initials, style, className, fallback }: SignedAvatarProps) {
  const { url: resolved, isLoading } = useSignedOrDirectUrl(url);

  if (isLoading) {
    return (
      <div className={`${sizeClass} rounded-full flex items-center justify-center bg-muted ${className || ""}`} style={style}>
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (resolved) {
    return (
      <img src={resolved} className={`${sizeClass} rounded-full object-cover flex-shrink-0 ${className || ""}`} alt="" style={style} />
    );
  }

  if (fallback) return <>{fallback}</>;
  if (initials) {
    return (
      <div className={`${sizeClass} rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${className || ""}`} style={style}>
        {initials}
      </div>
    );
  }
  return null;
}
