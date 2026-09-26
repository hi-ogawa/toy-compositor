import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The editor API is added by src/lib/server/dev-cli.ts, because it needs the project file.
export default defineConfig({
  plugins: [react(), tailwindcss()],
});
