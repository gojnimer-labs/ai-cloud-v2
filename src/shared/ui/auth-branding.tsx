import { VStack } from "@astryxdesign/core/Layout";

import { m } from "@/paraglide/messages";

export const AuthBranding = () => (
  <VStack gap={2} hAlign="center">
    <picture>
      <source
        media="(prefers-color-scheme: dark)"
        srcSet="/tabai-logo-full-dark.png"
      />
      <img
        alt={m.product_name()}
        src="/tabai-logo-full.png"
        style={{
          height: "calc(var(--spacing-12) + var(--spacing-4))",
          width: "auto",
        }}
      />
    </picture>
  </VStack>
);
