import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @eagle/shared is resolved via its package.json "exports" (import -> src).
export default defineConfig({
  plugins: [react()],
});
