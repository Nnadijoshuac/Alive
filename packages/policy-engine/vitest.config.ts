import { fileURLToPath } from "node:url";

export default {
  resolve: {
    alias: {
      "@alive/shared": fileURLToPath(
        new URL("../shared/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
  },
};
