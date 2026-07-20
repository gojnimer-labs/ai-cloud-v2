import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useState } from "react";

import { m } from "@/paraglide/messages";
import { CopyIconButton } from "@/shared/ui/copy-icon-button";

import type { AdditionalInfoItem } from "../model/types";

const SECRET_MASK = "••••••••";

// Some operations report a stable, namespaced key in additionalInfo instead
// of literal display text (documented on the operation itself, e.g.
// ai-cloud-operator's backup_state) — there's no machine-readable signal
// distinguishing a key from literal text, so recognized keys are listed
// here explicitly and looked up as i18n messages instead of shown raw.
const RESULT_MESSAGE_KEYS: Record<string, () => string> = {
  "backup_state.success": m.backup_state_success,
};

const formatValue = (value: unknown): string => {
  if (typeof value === "string" && value in RESULT_MESSAGE_KEYS) {
    return RESULT_MESSAGE_KEYS[value]();
  }
  return typeof value === "string" ? value : JSON.stringify(value);
};

// additionalInfo[].type: "secret" entries mask by default with an explicit
// reveal/copy action; "plain" entries just display. Copy is always
// available without requiring reveal first.
export const OperationResultList = ({
  items,
}: {
  items: AdditionalInfoItem[];
}) => {
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  const toggle = (name: string) => {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  return (
    <VStack gap={2}>
      {items.map((item) => {
        const text = formatValue(item.value);
        const isMasked = item.type === "secret" && !revealed.has(item.name);
        return (
          <HStack gap={2} key={item.name}>
            <Text weight="medium">{item.name}</Text>
            <Text>{isMasked ? SECRET_MASK : text}</Text>
            {item.type === "secret" ? (
              <Button
                label={revealed.has(item.name) ? "Hide" : "Reveal"}
                onClick={() => toggle(item.name)}
                size="sm"
                variant="secondary"
              />
            ) : null}
            <CopyIconButton size="sm" value={text} />
          </HStack>
        );
      })}
    </VStack>
  );
};
