import { useEffect, useLayoutEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useAuth } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { Switch, Route, Link, useLocation, Router as WouterRouter, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { setAuthTokenGetter } from "@workspace/api-client-react";

import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Projects from "@/pages/projects";
import ProjectDetail from "@/pages/project-detail";
import NewReport from "@/pages/new-report";
import NewCost from "@/pages/new-cost";
import NewRFI from "@/pages/new-rfi";
import Team from "@/pages/team";
import Settings from "@/pages/settings";
import AIChat from "@/pages/ai-chat";
import OnboardingPage from "@/pages/onboarding";
import Quotes from "@/pages/quotes";
import NewQuote from "@/pages/new-quote";
import QuoteDetail from "@/pages/quote-detail";
import Invoices from "@/pages/invoices";
import NewInvoice from "@/pages/new-invoice";
import InvoiceDetail from "@/pages/invoice-detail";
import AdminPage from "@/pages/admin";
import SuperAdminPage from "@/pages/super-admin";
import Schedule from "@/pages/schedule";
import ClientPortal from "@/pages/client-portal";
import Hours from "@/pages/hours";
import Estimates from "@/pages/estimates";
import TradehubFeedPage from "@/pages/tradehub-feed";
import TradehubPostPage from "@/pages/tradehub-post";
import TradehubJobsPage from "@/pages/tradehub-jobs";
import TradehubProfilePage from "@/pages/tradehub-profile";
import TradehubNotificationsPage from "@/pages/tradehub-notifications";
import TradehubMessagesPage from "@/pages/tradehub-messages";
import CalculatorsPage from "@/pages/calculators";
import RFIsPage from "@/pages/rfis";
import ReportsPage from "@/pages/reports";
import SafetyPage from "@/pages/safety";
import SafetySubmitPage from "@/pages/safety-submit";
import SafetyDetailPage from "@/pages/safety-detail";
import WorkerPortalPage from "@/pages/worker-portal";
import WorkerPortalSubmitPage from "@/pages/worker-portal-submit";
import WorkerPortalDetailPage from "@/pages/worker-portal-detail";
import Contacts from "@/pages/contacts";
import Leads from "@/pages/leads";
import ProposalsPage from "@/pages/proposals";
import { AuthGuard } from "@/components/auth-guard";
import { AppLayout } from "@/components/layout";

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY in .env file");
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "hsl(24, 100%, 50%)",
    colorForeground: "hsl(220, 10%, 15%)",
    colorMutedForeground: "hsl(220, 10%, 40%)",
    colorDanger: "hsl(0, 84%, 60%)",
    colorBackground: "hsl(0, 0%, 100%)",
    colorInput: "hsl(220, 10%, 88%)",
    colorInputForeground: "hsl(220, 10%, 15%)",
    colorNeutral: "hsl(220, 10%, 88%)",
    fontFamily: "Inter, sans-serif",
    borderRadius: "0.3rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-white rounded-2xl w-[440px] max-w-full overflow-hidden shadow-md",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-2xl font-bold text-foreground",
    headerSubtitle: "text-muted-foreground",
    socialButtonsBlockButtonText: "font-medium",
    formFieldLabel: "font-medium text-foreground",
    footerActionLink: "text-primary hover:text-primary/90 font-medium",
    footerActionText: "text-muted-foreground",
    dividerText: "text-muted-foreground",
    identityPreviewEditButton: "text-primary hover:text-primary/90",
    formFieldSuccessText: "text-green-600",
    alertText: "text-sm",
    logoBox: "flex justify-center mb-4",
    logoImage: "h-12 w-auto",
    socialButtonsBlockButton: "border-border hover:bg-muted/50",
    formButtonPrimary: "bg-primary text-primary-foreground hover:bg-primary/90",
    formFieldInput: "border-border bg-background text-foreground",
    footerAction: "flex justify-center gap-1",
    dividerLine: "bg-border",
    alert: "bg-destructive/10 border-destructive/20 text-destructive",
    otpCodeFieldInput: "border-border bg-background",
    formFieldRow: "flex flex-col gap-2",
    main: "flex flex-col gap-4",
  },
};

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-muted/30 px-4">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-muted/30 px-4">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

function ClerkAuthTokenSetter() {
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);

  // Keep the ref pointing to the latest getToken without re-registering the getter
  getTokenRef.current = getToken;

  useLayoutEffect(() => {
    // Register once on mount; use the ref so we always call the latest getToken
    setAuthTokenGetter(async () => {
      try {
        return await getTokenRef.current();
      } catch {
        return null;
      }
    });
    // Only clear on unmount (sign-out), not on every getToken reference change
    return () => setAuthTokenGetter(null);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        queryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);

  return null;
}

function HomeRedirect() {
  const { isSignedIn, isLoaded } = useAuth();

  if (!isLoaded) return null;

  if (isSignedIn) return <Redirect to="/dashboard" />;

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-muted/10 p-4">
      <img src={`${basePath}/sitesnap-logo.png`} alt="Site Snap" className="h-24 w-auto mb-6 rounded-xl" />
      <h1 className="text-4xl font-bold text-foreground mb-4">Site Snap</h1>
      <p className="text-lg text-muted-foreground mb-8 text-center max-w-md">
        Construction Efficiency, Simplified — the AI platform Canadian contractors rely on.
      </p>
      <div className="flex gap-4">
        <Link to="/sign-in" className="bg-white border border-border text-foreground px-6 py-2 rounded-md font-medium hover:bg-muted transition-colors">Log In</Link>
        <Link to="/sign-up" className="bg-primary text-primary-foreground px-6 py-2 rounded-md font-medium hover:bg-primary/90 transition-colors">Get Started</Link>
      </div>
    </div>
  );
}

function DashboardPlaceholder() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-sidebar text-sidebar-foreground p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src={`${basePath}/sitesnap-logo.png`} alt="Site Snap" className="h-8 w-8 rounded object-contain bg-black" />
          <span className="font-bold text-lg tracking-tight">Site Snap</span>
        </div>
      </header>
      <main className="flex-1 p-6 bg-muted/10">
        <h1 className="text-2xl font-bold mb-4">Dashboard</h1>
        <p className="text-muted-foreground">Welcome to Site Snap. Your data goes here.</p>
      </main>
    </div>
  )
}

function WorkerPortalApp() {
  return (
    <AuthGuard>
      <Switch>
        <Route path="/worker-portal/submit" component={WorkerPortalSubmitPage} />
        <Route path="/worker-portal/submissions/:id" component={WorkerPortalDetailPage} />
        <Route path="/worker-portal" component={WorkerPortalPage} />
      </Switch>
    </AuthGuard>
  );
}

function AuthApp() {
  return (
    <AuthGuard>
      <AppLayout>
        <Switch>
          <Route path="/dashboard" component={Dashboard} />
          <Route path="/projects" component={Projects} />
          <Route path="/contacts" component={Contacts} />
          <Route path="/leads" component={Leads} />
          <Route path="/proposals" component={ProposalsPage} />
          <Route path="/projects/:id" component={ProjectDetail} />
          <Route path="/projects/:id/reports/new" component={NewReport} />
          <Route path="/projects/:id/cost/new" component={NewCost} />
          <Route path="/projects/:id/rfis/new" component={NewRFI} />
          <Route path="/quotes/new" component={NewQuote} />
          <Route path="/quotes/:id" component={QuoteDetail} />
          <Route path="/quotes" component={Quotes} />
          <Route path="/invoices/new" component={NewInvoice} />
          <Route path="/invoices/:id" component={InvoiceDetail} />
          <Route path="/invoices" component={Invoices} />
          <Route path="/admin" component={AdminPage} />
          <Route path="/super-admin" component={SuperAdminPage} />
          <Route path="/ai-chat" component={AIChat} />
          <Route path="/team" component={Team} />
          <Route path="/settings" component={Settings} />
          <Route path="/schedule" component={Schedule} />
          <Route path="/hours" component={Hours} />
          <Route path="/estimates" component={Estimates} />
          <Route path="/calculators" component={CalculatorsPage} />
          <Route path="/rfis" component={RFIsPage} />
          <Route path="/reports" component={ReportsPage} />
          <Route path="/tradehub/messages/:conversationId" component={TradehubMessagesPage} />
          <Route path="/tradehub/messages" component={TradehubMessagesPage} />
          <Route path="/tradehub/notifications" component={TradehubNotificationsPage} />
          <Route path="/tradehub/jobs" component={TradehubJobsPage} />
          <Route path="/tradehub/posts/:id" component={TradehubPostPage} />
          <Route path="/tradehub/profile/:userId" component={TradehubProfilePage} />
          <Route path="/tradehub" component={TradehubFeedPage} />
          <Route path="/safety/submit" component={SafetySubmitPage} />
          <Route path="/safety/submissions/:id" component={SafetyDetailPage} />
          <Route path="/safety" component={SafetyPage} />
          <Route component={NotFound} />
        </Switch>
      </AppLayout>
    </AuthGuard>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkAuthTokenSetter />
        <ClerkQueryClientCacheInvalidator />
        <Switch>
          <Route path="/" component={HomeRedirect} />
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />
          <Route path="/onboarding" component={OnboardingPage} />
          <Route path="/portal/:token" component={ClientPortal} />
          <Route path="/worker-portal/*?">
            <WorkerPortalApp />
          </Route>
          <Route path="/*">
            <AuthApp />
          </Route>
        </Switch>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <TooltipProvider>
      <WouterRouter base={basePath}>
        <ClerkProviderWithRoutes />
      </WouterRouter>
      <Toaster />
    </TooltipProvider>
  );
}

export default App;
