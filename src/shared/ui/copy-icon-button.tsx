import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import type { IconButtonProps } from "@astryxdesign/core/IconButton";
import { useState } from "react";

import { m } from "@/paraglide/messages";

const COPIED_FEEDBACK_MS = 2000;

export const CopyIconButton = ({
  size,
  value,
}: {
  size?: IconButtonProps["size"];
  value: string;
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    } catch {
      // Clipboard failures leave the copied state unchanged.
    }
  };

  const accessibleLabel = copied ? m.copied() : m.copy_to_clipboard();

  return (
    <IconButton
      icon={<Icon color="inherit" icon={copied ? "check" : "copy"} />}
      label={accessibleLabel}
      onClick={handleCopy}
      size={size}
      tooltip={accessibleLabel}
      variant="primary"
    />
  );
};
