import { defineConfig } from "astro/config";

const site = process.env.SITE_URL;
const configuredBase = process.env.SITE_BASE ?? "/";
const base = configuredBase.endsWith("/") ? configuredBase : `${configuredBase}/`;

export default defineConfig({
    output: "static",
    site,
    base
});
