import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  server: {
    proxy: {
      "/mail-api": {
        target: "http://127.0.0.1:4190",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/mail-api/, ""),
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/recharts|d3-/.test(id)) return 'charts';
          if (/jspdf|html2canvas/.test(id)) return 'pdf-tools';
          if (/read-excel-file|xlsx|jszip/.test(id)) return 'spreadsheet-tools';
          if (/@radix-ui|lucide-react/.test(id)) return 'ui-vendor';
          return 'vendor';
        },
      },
    },
  },
});
