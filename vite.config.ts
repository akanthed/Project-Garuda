import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";

export default defineConfig(({ command, mode }) => {
  // Fail the build rather than silently shipping a production bundle that
  // cannot verify credentials server-side. The local fallback is dev-only.
  if (command === "build" && mode === "production") {
    const env = loadEnv(mode, process.cwd(), "VITE_");
    if (!env.VITE_API_URL) {
      throw new Error(
        "VITE_API_URL is required for a production build (set it in .env.production or the environment) " +
        "— without it, the client would silently fall back to the local demo-credential registry."
      );
    }
  }

  return {
    base: "/app/",
    server: {
      watch: {
        ignored: ["**/backend/*.zip"],
      },
    },
    plugins: [
      TanStackRouterVite({ autoCodeSplitting: true }),
      react(),
      tailwindcss(),
    ],
    resolve: {
      tsconfigPaths: true,
    },
  };
});

