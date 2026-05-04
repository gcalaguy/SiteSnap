import { useClerk } from "@clerk/react";
import { useGetMe } from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { LogOut, ShieldAlert, ChevronRight, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface WorkerLayoutProps {
  children: React.ReactNode;
  breadcrumbs?: BreadcrumbItem[];
}

export function WorkerLayout({ children, breadcrumbs }: WorkerLayoutProps) {
  const { signOut } = useClerk();
  const { data: user } = useGetMe();

  const initials = user
    ? `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`.toUpperCase()
    : "?";

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top Nav */}
      <header className="bg-[#172034] text-white sticky top-0 z-20 shadow-md">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <Link href="/worker-portal">
            <div className="flex items-center gap-2 cursor-pointer">
              <div className="w-7 h-7 bg-primary rounded flex items-center justify-center flex-shrink-0">
                <ShieldAlert className="h-4 w-4 text-white" />
              </div>
              <span className="font-bold text-base tracking-tight leading-none">
                Site Snap
                <span className="block text-[10px] text-white/60 font-normal tracking-normal">
                  Safety Portal
                </span>
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            {user && (
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                  {initials}
                </div>
                <span className="text-sm font-medium hidden sm:block">
                  {user.firstName}
                </span>
              </div>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="text-white/70 hover:text-white hover:bg-white/10"
              onClick={() => signOut({ redirectUrl: `${basePath}/sign-in` })}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Breadcrumbs */}
        {breadcrumbs && breadcrumbs.length > 0 && (
          <div className="border-t border-white/10 bg-[#172034]/80">
            <div className="max-w-2xl mx-auto px-4 py-1.5 flex items-center gap-1 text-xs text-white/60">
              <Link href="/worker-portal">
                <span className="hover:text-white transition-colors flex items-center gap-1 cursor-pointer">
                  <Home className="h-3 w-3" />
                  Home
                </span>
              </Link>
              {breadcrumbs.map((b, i) => (
                <span key={i} className="flex items-center gap-1">
                  <ChevronRight className="h-3 w-3" />
                  {b.href ? (
                    <Link href={b.href}>
                      <span className="hover:text-white transition-colors cursor-pointer">{b.label}</span>
                    </Link>
                  ) : (
                    <span className="text-white/90">{b.label}</span>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}
      </header>

      {/* Content */}
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-5">
        {children}
      </main>

      {/* Bottom note */}
      <footer className="text-center text-xs text-gray-400 py-4 max-w-2xl mx-auto">
        Site Snap — Powered by AI for Canadian construction
      </footer>
    </div>
  );
}
