import { OAUTH_PROVIDERS } from "@mothlight/core";
import { Link } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Button, Caption, ErrorText, Field, Heading, Screen } from "@/components/ui";
import { signInWithEmail, signInWithProvider } from "@/lib/auth";

const PROVIDER_LABELS: Record<(typeof OAUTH_PROVIDERS)[number], string> = {
  google: "Continue with Google",
  facebook: "Continue with Facebook",
  apple: "Continue with Apple",
};

export default function SignInScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // No navigation on success: the session guard in app/_layout.tsx swaps the stack.
  async function run(action: () => Promise<unknown>) {
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Heading>Sign in</Heading>

      <Field
        autoCapitalize="none"
        autoComplete="email"
        inputMode="email"
        keyboardType="email-address"
        onChangeText={setEmail}
        placeholder="Email"
        value={email}
      />
      <Field
        autoCapitalize="none"
        autoComplete="current-password"
        onChangeText={setPassword}
        placeholder="Password"
        secureTextEntry
        value={password}
      />

      {error ? <ErrorText>{error}</ErrorText> : null}

      <Button
        busy={busy}
        label="Sign in"
        onPress={() => run(() => signInWithEmail(email, password))}
      />

      <View style={{ height: 8 }} />
      <Caption>or</Caption>

      {OAUTH_PROVIDERS.map((provider) => (
        <Button
          busy={busy}
          key={provider}
          label={PROVIDER_LABELS[provider]}
          onPress={() => run(() => signInWithProvider(provider))}
          variant="secondary"
        />
      ))}

      <View style={{ height: 8 }} />
      <Link href="/sign-up">
        <Caption>No account? Sign up</Caption>
      </Link>
    </Screen>
  );
}
