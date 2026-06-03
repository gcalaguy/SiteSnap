import { useSignedOrDirectUrl } from "@/hooks/useSignedUrl";
import { Loader2 } from "lucide-react";

interface SignedImageProps {
  src: string | null | undefined;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  onError?: React.ReactEventHandler<HTMLImageElement>;
  loadingClassName?: string;
  fallback?: React.ReactNode;
}

export function SignedImage({ src, alt, className, style, onError, loadingClassName, fallback }: SignedImageProps) {
  const { url, isLoading } = useSignedOrDirectUrl(src);

  if (isLoading) {
    return (
      <div className={`${className} ${loadingClassName || "flex items-center justify-center bg-muted"}`} style={style}>
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!url) {
    if (fallback) return <>{fallback}</>;
    return null;
  }

  return <img src={url} alt={alt} className={className} style={style} onError={onError} />;
}
