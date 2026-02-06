import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  build: {
    outDir: "dist",
    rollupOptions: {
      input: "flappy-bird.html",
    },
  },
  plugins: [viteSingleFile()],
});
