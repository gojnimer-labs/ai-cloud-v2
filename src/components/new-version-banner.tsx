import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { useNewVersionAvailable } from "@/lib/use-new-version-available";

export function NewVersionBanner() {
  const isNewVersionAvailable = useNewVersionAvailable();

  if (!isNewVersionAvailable) {
    return null;
  }

  return (
    <Banner
      container="section"
      description="Reload the page to get the latest updates."
      endContent={
        <Button
          label="Reload"
          onClick={() => window.location.reload()}
          size="sm"
          variant="secondary"
        />
      }
      status="warning"
      title="New version available"
    />
  );
}
