import { Link } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Button, Caption, ErrorText, Field, Heading, Screen } from "@/components/ui";
import { signUpWithEmail } from "@/lib/auth";

export default function SignUpScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const session = await signUpWithEmail(email, password);
      if (!session) {
        // Project has email confirmation enabled; there is no session yet.
        setNotice("Check your email to confirm your account, then sign in.");
      }
      // On success with confirmation disabled the session guard swaps the stack.
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Heading>Create account</Heading>

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
        autoComplete="new-password"
        onChangeText={setPassword}
        placeholder="Password (min 8 characters)"
        secureTextEntry
        value={password}
      />

      {error ? <ErrorText>{error}</ErrorText> : null}
      {notice ? <Caption>{notice}</Caption> : null}

      <Button busy={busy} label="Sign up" onPress={onSubmit} />

      <View style={{ height: 8 }} />
      <Link href="/sign-in">
        <Caption>Already have an account? Sign in</Caption>
      </Link>
    </Screen>
  );
}
