import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { ScopeProvider } from "@/contexts/ScopeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { getSession } from "@/lib/auth";
import { t } from "@/lib/i18n";

function NotFoundComponent() {
  const { locale } = useLanguage();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">{t("route_not_found", locale)}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("route_not_found_desc", locale)}
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t("common_go_home", locale)}
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  const { locale } = useLanguage();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {t("route_load_failed", locale)}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("route_load_failed_desc", locale)}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t("common_try_again", locale)}
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            {t("common_go_home", locale)}
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const scopeKey = pathname === "/login" ? "anonymous" : getSession()?.badge ?? "anonymous";

  return (
    <ThemeProvider>
      <LanguageProvider>
        <ScopeProvider key={scopeKey}>
          <QueryClientProvider client={queryClient}>
            <Outlet />
          </QueryClientProvider>
        </ScopeProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
