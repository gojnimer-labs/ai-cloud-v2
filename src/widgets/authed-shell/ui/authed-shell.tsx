import { AppShell } from "@astryxdesign/core/AppShell";
import { Center } from "@astryxdesign/core/Center";
import { LinkProvider } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { Link } from "@tanstack/react-router";
import { Authenticated, AuthLoading } from "convex/react";
import type { ReactNode } from "react";

import { m } from "@/paraglide/messages";

import { AuthedSideNav } from "./authed-side-nav";
import { AuthedTopNav } from "./authed-top-nav";

export const AuthedShell = ({ children }: { children: ReactNode }) => (
  <>
    <AuthLoading>
      <Center axis="both" style={{ minHeight: "100dvh" }}>
        <Text type="supporting">{m.loading()}</Text>
      </Center>
    </AuthLoading>
    <Authenticated>
      <LinkProvider component={Link}>
        <AppShell
          contentPadding={0}
          height="fill"
          sideNav={<AuthedSideNav />}
          topNav={<AuthedTopNav />}
        >
          {children}
        </AppShell>
      </LinkProvider>
    </Authenticated>
  </>
);
