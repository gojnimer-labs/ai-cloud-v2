import { Center } from "@astryxdesign/core/Center";
import { VStack } from "@astryxdesign/core/Layout";
import type { CSSProperties, ReactNode } from "react";

// Standalone auth pages paint their own body background (no host shell).
const pageStyle: CSSProperties = {
  backgroundColor: "var(--color-background-body)",
  minHeight: "100%",
  padding: "var(--spacing-6)",
};
// Cap the column at 400px but let it shrink to fit narrow screens (Stack
// has no maxWidth prop, so it's set here).
const contentStyle: CSSProperties = {
  maxWidth: 400,
  width: "100%",
};

export const AuthPageShell = ({ children }: { children: ReactNode }) => (
  <Center axis="both" style={pageStyle}>
    <VStack gap={4} hAlign="center" style={contentStyle}>
      {children}
    </VStack>
  </Center>
);
