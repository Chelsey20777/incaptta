import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    plugins: {
      "custom-rules": {
        rules: {
          "require-locale-in-to-locale-string": {
            create(context) {
              return {
                CallExpression(node) {
                  if (
                    node.callee.type === "MemberExpression" &&
                    node.callee.property.type === "Identifier" &&
                    node.callee.property.name === "toLocaleString"
                  ) {
                    const hasNoArgs = node.arguments.length === 0;
                    const isFirstArgUndefined =
                      node.arguments[0] &&
                      node.arguments[0].type === "Identifier" &&
                      node.arguments[0].name === "undefined";

                    if (hasNoArgs || isFirstArgUndefined) {
                      context.report({
                        node,
                        message: "toLocaleString() must be called with an explicit locale (e.g. 'en-US')."
                      });
                    }
                  }
                }
              };
            }
          }
        }
      }
    },
    rules: {
      "custom-rules/require-locale-in-to-locale-string": "error"
    }
  }
]);

export default eslintConfig;
