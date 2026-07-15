import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useState } from "react";

import type { AdditionalInfoItem } from "../model/types";

const SECRET_MASK = "••••••••";

const formatValue = (value: unknown): string =>
  typeof value === "string" ? value : JSON.stringify(value);

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
            <Button
              label="Copy"
              onClick={() => navigator.clipboard.writeText(text)}
              size="sm"
              variant="secondary"
            />
          </HStack>
        );
      })}
    </VStack>
  );
};
