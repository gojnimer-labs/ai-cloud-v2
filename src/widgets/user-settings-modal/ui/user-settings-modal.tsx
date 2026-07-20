import { Avatar } from "@astryxdesign/core/Avatar";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Divider } from "@astryxdesign/core/Divider";
import { useMediaQuery } from "@astryxdesign/core/hooks";
import { Icon } from "@astryxdesign/core/Icon";
import {
  Layout,
  LayoutContent,
  LayoutFooter,
  LayoutPanel,
} from "@astryxdesign/core/Layout";
import { List, ListItem } from "@astryxdesign/core/List";
import { Selector } from "@astryxdesign/core/Selector";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { Heading, Text } from "@astryxdesign/core/Text";
import type { ThemeMode } from "@astryxdesign/core/theme";
import { useToast } from "@astryxdesign/core/Toast";
import { Cog6ToothIcon, LockClosedIcon } from "@heroicons/react/24/outline";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { useThemeMode } from "@/app/theme-mode-provider";
import { useCurrentUser } from "@/entities/session";
import { m } from "@/paraglide/messages";
import { authClient } from "@/shared/api/auth-client";
import { useAppForm } from "@/shared/lib/form/form";
import { requiredText } from "@/shared/lib/form/schemas";
import { LocaleSwitcher } from "@/shared/ui/locale-switcher";

// Below this, the sidebar has nowhere to fit next to the content pane —
// nav switches to a horizontally scrollable tab strip above the content.
const MOBILE_QUERY = "(max-width: 640px)";

type SettingsSection = "preferences" | "security";

const NAV_ITEMS: {
  section: SettingsSection;
  icon: typeof Cog6ToothIcon;
  label: () => string;
}[] = [
  {
    icon: Cog6ToothIcon,
    label: m.settings_nav_preferences,
    section: "preferences",
  },
  {
    icon: LockClosedIcon,
    label: m.settings_nav_security,
    section: "security",
  },
];

const PreferencesPanel = () => {
  const { mode, setMode } = useThemeMode();

  const themeOptions = [
    { label: m.settings_theme_light(), value: "light" },
    { label: m.settings_theme_dark(), value: "dark" },
    { label: m.settings_theme_auto(), value: "system" },
  ];

  return (
    <VStack gap={6}>
      <Heading level={2}>{m.settings_nav_preferences()}</Heading>
      <VStack gap={4}>
        <Selector
          label={m.settings_theme_label()}
          onChange={(value) => setMode(value as ThemeMode)}
          options={themeOptions}
          value={mode}
        />
        <LocaleSwitcher />
      </VStack>
    </VStack>
  );
};

const ChangePasswordForm = () => {
  const toast = useToast();
  const form = useAppForm({
    defaultValues: {
      confirmNewPassword: "",
      currentPassword: "",
      newPassword: "",
    },
    validators: {
      // Treated as a validator (not a plain onSubmit) so a wrong-current-password
      // response from the server can attach an error to that specific field —
      // same convention as sign-in/sign-up.
      onSubmitAsync: async ({ value }) => {
        const { error } = await authClient.changePassword({
          currentPassword: value.currentPassword,
          newPassword: value.newPassword,
        });
        if (error) {
          return {
            fields: {
              currentPassword: error.message ?? m.sign_up_error_generic(),
            },
          };
        }
        form.reset();
        toast({ body: m.change_password_success() });
        return null;
      },
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
    >
      <form.AppForm>
        <VStack gap={3}>
          <form.AppField
            name="currentPassword"
            validators={{ onChange: requiredText }}
          >
            {(field) => (
              <field.TextField
                label={m.label_current_password()}
                placeholder={m.placeholder_current_password()}
                type="password"
              />
            )}
          </form.AppField>
          <form.AppField
            name="newPassword"
            validators={{ onChange: requiredText }}
          >
            {(field) => (
              <field.TextField
                label={m.label_new_password()}
                placeholder={m.placeholder_new_password()}
                type="password"
              />
            )}
          </form.AppField>
          <form.AppField
            name="confirmNewPassword"
            validators={{
              onChange: ({ fieldApi, value }) =>
                value === fieldApi.form.getFieldValue("newPassword")
                  ? undefined
                  : m.confirm_password_mismatch(),
              onChangeListenTo: ["newPassword"],
            }}
          >
            {(field) => (
              <field.TextField
                label={m.label_confirm_password()}
                placeholder={m.placeholder_confirm_password()}
                type="password"
              />
            )}
          </form.AppField>
          <HStack hAlign="end">
            <form.SubmitButton
              label={m.change_password_submit()}
              variant="primary"
            />
          </HStack>
        </VStack>
      </form.AppForm>
    </form>
  );
};

const SecurityPanel = ({
  user,
}: {
  user: ReturnType<typeof useCurrentUser>;
}) => (
  <VStack gap={6}>
    <Heading level={2}>{m.settings_nav_security()}</Heading>
    <HStack gap={3} vAlign="center">
      <Avatar name={user?.email} size="medium" />
      <VStack gap={0}>
        <Text type="body" weight="semibold">
          {user?.name}
        </Text>
        <Text color="secondary" type="supporting">
          {user?.email}
        </Text>
      </VStack>
    </HStack>
    <Divider />
    <VStack gap={3}>
      <Text type="body" weight="semibold">
        {m.settings_change_password_heading()}
      </Text>
      <ChangePasswordForm />
    </VStack>
  </VStack>
);

export const UserSettingsModal = ({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) => {
  const [section, setSection] = useState<SettingsSection>("preferences");
  const router = useRouter();
  const navigate = useNavigate();
  const user = useCurrentUser();
  const isMobile = useMediaQuery(MOBILE_QUERY);

  const handleSignOut = async () => {
    await authClient.signOut();
    onClose();
    await router.invalidate();
    await navigate({ to: "/sign-in" });
  };

  const sectionContent =
    section === "preferences" ? (
      <PreferencesPanel />
    ) : (
      <SecurityPanel user={user} />
    );

  return (
    <Dialog
      isOpen={isOpen}
      maxHeight="85vh"
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      purpose="form"
      style={{ height: 640 }}
      width={880}
    >
      <Layout
        content={
          <LayoutContent padding={6}>
            {isMobile ? (
              <VStack gap={6}>
                <HStack isScrollable gap={0}>
                  <TabList
                    hasDivider
                    onChange={(value) => setSection(value as SettingsSection)}
                    value={section}
                  >
                    {NAV_ITEMS.map((item) => (
                      <Tab
                        icon={<Icon icon={item.icon} size="sm" />}
                        key={item.section}
                        label={item.label()}
                        value={item.section}
                      />
                    ))}
                  </TabList>
                </HStack>
                {sectionContent}
              </VStack>
            ) : (
              sectionContent
            )}
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            <HStack>
              <Button
                label={m.sign_out()}
                onClick={handleSignOut}
                variant="secondary"
              />
            </HStack>
          </LayoutFooter>
        }
        header={
          <DialogHeader
            onOpenChange={onClose}
            title={m.settings_dialog_title()}
          />
        }
        height="fill"
        start={
          isMobile ? undefined : (
            <LayoutPanel hasDivider padding={2} width={220}>
              <List density="spacious">
                {NAV_ITEMS.map((item) => (
                  <ListItem
                    isSelected={section === item.section}
                    key={item.section}
                    label={item.label()}
                    onClick={() => setSection(item.section)}
                    startContent={<Icon icon={item.icon} size="sm" />}
                  />
                ))}
              </List>
            </LayoutPanel>
          )
        }
      />
    </Dialog>
  );
};
