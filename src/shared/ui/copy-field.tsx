import { Code } from "@astryxdesign/core/Code";
import { HStack, StackItem } from "@astryxdesign/core/Stack";

import { CopyIconButton } from "@/shared/ui/copy-icon-button";

export const CopyField = ({ value }: { value: string }) => (
  <HStack gap={2} vAlign="center">
    <StackItem size="fill">
      <Code style={{ display: "block", width: "100%" }}>{value}</Code>
    </StackItem>
    <CopyIconButton value={value} />
  </HStack>
);
