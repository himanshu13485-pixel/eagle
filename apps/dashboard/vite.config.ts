import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @eagle/shared is resolved via its package.json "exports" (import -> src),
// so no alias is needed here (a duplicate alias caused Rollup to load the
// shared entry twice and drop its re-exports).
export default defineConfig({
  plugins: [react()],
});
