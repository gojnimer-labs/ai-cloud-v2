import { Badge } from "@astryxdesign/core/Badge";
import { Text } from "@astryxdesign/core/Text";

// Per this design system's Badge guidance: don't badge every row the same
// — only the states that need attention. Running/Deploying are shown as
// plain text; Failed/unknown/unreachable get a Badge.
export const PhaseCell = ({ phase }: { phase: string }) => {
  if (phase === "Running" || phase === "Deploying" || phase === "Pending") {
    return <Text color="secondary">{phase}</Text>;
  }
  return <Badge label={phase} variant="error" />;
};
