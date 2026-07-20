import { Selector } from "@astryxdesign/core/Selector";
import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";

// Resolves a raw auth user id to a searchable dropdown of known users
// (label = email) — the value stored/submitted is always the raw id, never
// the label, so callers keep a plain userId string exactly like a TextInput
// would, just with a friendlier picker on top. "Known" means referenced by
// at least one workload/file/gateway token (see
// convex/invites/queries.ts#listUserOptions) — a user with no activity yet
// won't show up, so an id typed/pasted directly still round-trips even if
// it can't be looked up here.
export const UserSelect = ({
  description,
  label,
  onChange,
  placeholder,
  value,
}: {
  description?: string;
  label: string;
  onChange: (userId: string) => void;
  placeholder?: string;
  value: string;
}) => {
  const options = useQuery(api.invites.queries.listUserOptions);

  return (
    <Selector
      description={description}
      hasSearch
      isLoading={options === undefined}
      label={label}
      onChange={onChange}
      options={(options ?? []).map((user) => ({
        label: user.label,
        value: user.id,
      }))}
      placeholder={placeholder}
      value={value}
    />
  );
};
