import { assert } from "chai";
import { localCropReviewIntegration } from "../../astro.config.mjs";

describe("local crop-review route::", () => {
    it("registers the reviewer for local development", () => {
        const routes = [];
        const integration = localCropReviewIntegration();

        integration.hooks["astro:config:setup"]({
            command: "dev",
            injectRoute: (route) => routes.push(route)
        });

        assert.lengthOf(routes, 1);
        assert.equal(routes[0].pattern, "/crop-review");
        assert.equal(routes[0].entrypoint.pathname.endsWith("/src/tools/crop-review.astro"), true);
    });

    it("does not register the reviewer for production builds", () => {
        const routes = [];
        const integration = localCropReviewIntegration();

        integration.hooks["astro:config:setup"]({
            command: "build",
            injectRoute: (route) => routes.push(route)
        });

        assert.deepEqual(routes, []);
    });
});
