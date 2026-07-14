import { useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";

/**
 * Tracks the deploymentId in place when the app first loaded and flips to
 * true once a live-reload subscription reports a different one, meaning a
 * new deploy has replaced the assets this client is running.
 */
export function useNewVersionAvailable(): boolean {
  const deployment = useQuery(api.staticHosting.getCurrentDeployment);
  const initialDeploymentId = useRef<string | null>(null);
  const [isNewVersionAvailable, setIsNewVersionAvailable] = useState(false);

  useEffect(() => {
    if (!deployment) {
      return;
    }
    if (initialDeploymentId.current === null) {
      initialDeploymentId.current = deployment.currentDeploymentId;
      return;
    }
    if (deployment.currentDeploymentId !== initialDeploymentId.current) {
      setIsNewVersionAvailable(true);
    }
  }, [deployment]);

  return isNewVersionAvailable;
}
