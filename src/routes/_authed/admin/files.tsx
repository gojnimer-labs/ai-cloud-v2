import { createFileRoute } from "@tanstack/react-router";

import { FilesPage } from "@/pages/admin-files";

export const Route = createFileRoute("/_authed/admin/files")({
  component: FilesPage,
});
