import { mintDownloadUrl, mintUploadUrl, r2 } from "../storage/r2";
import type { SelectOptionPayload } from "./validators";

interface SelectOptionHandler {
  // Prepare side (backup): mint a fresh upload target before calling the
  // operator. Returns the value to inject as the operation's param AND the
  // payload to store if a matching insert_row directive comes back.
  prepareUpload: (ref: {
    templateId: string;
    userId: string;
  }) => Promise<{ paramValue: string; payload: SelectOptionPayload }>;
  // Resolve side (restore): turn a stored payload back into a usable URL.
  resolve: (payload: SelectOptionPayload) => Promise<string | null>;
}

// New sources add an entry here (and a matching variant to
// selectOptionPayloadValidator in validators.ts) instead of teaching
// deployWorkload/runOperation a new inline extraction/minting shape.
const HANDLERS: Record<string, SelectOptionHandler> = {
  r2_helper: {
    prepareUpload: async ({ templateId, userId }) => {
      const r2Key = `profiles/${templateId}/${userId}/${Date.now()}.tar.gz`;
      return {
        paramValue: await mintUploadUrl(r2Key),
        payload: { handler: "r2_helper", r2Bucket: r2.config.bucket, r2Key },
      };
    },
    resolve: async (payload) => await mintDownloadUrl(payload.r2Key),
  },
};

// payload is undefined for a row that predates the data -> payload
// migration (see schema.ts) or a row whose id didn't resolve at all —
// treated the same as "nothing to restore", not an error. handler comes
// from the catalog's own DataSource (see workloads/actions.ts#
// deployWorkload), not from the row itself, so the dispatch stays correct
// even if a row's stored payload.handler and the catalog's current handler
// name were ever to disagree.
export const resolveSelectOption = async (
  handler: string,
  payload: SelectOptionPayload | undefined
): Promise<string | null> => {
  if (!payload) {
    return null;
  }
  const impl = HANDLERS[handler];
  if (!impl) {
    throw new Error(`Unknown selectOptions handler: ${handler}`);
  }
  return await impl.resolve(payload);
};

export const prepareSelectOptionUpload = async (
  handler: string,
  ref: { templateId: string; userId: string }
): Promise<{ paramValue: string; payload: SelectOptionPayload }> => {
  const impl = HANDLERS[handler];
  if (!impl) {
    throw new Error(`Unknown selectOptions handler: ${handler}`);
  }
  return await impl.prepareUpload(ref);
};
