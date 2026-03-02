import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import cloudflare from "@astrojs/cloudflare";
import pagefind from "astro-pagefind";

import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
export default defineConfig({
  site: "https://aravindballa.com",
  output: "server",
  adapter: cloudflare({
    imageService: "passthrough",
  }),
  integrations: [mdx(), pagefind({
    indexConfig: {
      excludeSelectors: ["pre", "code"],
    },
  })],

  vite: {
    plugins: [tailwindcss()],
  },
});
