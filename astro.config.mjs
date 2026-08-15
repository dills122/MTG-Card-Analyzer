import { defineConfig } from "astro/config";

const site = process.env.SITE_URL;
const configuredBase = process.env.SITE_BASE ?? "/";
const base = configuredBase.endsWith("/") ? configuredBase : `${configuredBase}/`;

function localCropReviewIntegration() {
    return {
        name: "local-crop-review",
        hooks: {
            "astro:config:setup": ({ command, injectRoute }) => {
                if (command !== "dev") return;
                injectRoute({
                    pattern: "/crop-review",
                    entrypoint: new URL("./src/tools/crop-review.astro", import.meta.url)
                });
            }
        }
    };
}

export default defineConfig({
    output: "static",
    site,
    base,
    integrations: [localCropReviewIntegration()]
});

export { localCropReviewIntegration };
