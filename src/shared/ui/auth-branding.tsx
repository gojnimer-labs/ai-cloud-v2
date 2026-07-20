import { VStack } from "@astryxdesign/core/Layout";
import { useTheme } from "@astryxdesign/core/theme";

import { m } from "@/paraglide/messages";

export const AuthBranding = () => {
  const { mode } = useTheme();

  return (
    <VStack gap={2} hAlign="center">
      <img
        alt={m.product_name()}
        src={
          mode === "dark" ? "/tabai-logo-full-dark.png" : "/tabai-logo-full.png"
        }
        style={{
          height: "calc(var(--spacing-12) + var(--spacing-4))",
          width: "auto",
        }}
      />
    </VStack>
  );
};
