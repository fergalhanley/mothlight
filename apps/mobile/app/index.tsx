import { APP_NAME } from "@mothlight/core";
import { Caption, Heading, Screen } from "@/components/ui";

/**
 * Dashboard.
 *
 * Shell only — the project list, search, and swipe-to-delete land with the persistence
 * layer. See §2.2 of agent/v0-requirements.md.
 */
export default function DashboardScreen() {
  return (
    <Screen>
      <Heading>{APP_NAME}</Heading>
      <Caption>No projects yet.</Caption>
    </Screen>
  );
}
