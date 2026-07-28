import { APP_NAME } from "@mothlight/core";
import { Button, Caption, Heading, Screen } from "@/components/ui";
import { signOut } from "@/lib/auth";
import { useSession } from "@/lib/session";

/** Authenticated placeholder. Product screens replace this. */
export default function HomeScreen() {
  const { session } = useSession();

  return (
    <Screen>
      <Heading>{APP_NAME}</Heading>
      <Caption>Signed in as {session?.user.email ?? session?.user.id ?? "unknown"}</Caption>
      <Button label="Sign out" onPress={() => void signOut()} variant="secondary" />
    </Screen>
  );
}
