import { useSSO, useSignIn, useSignUp } from "@clerk/clerk-expo";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useMemo, useState } from "react";
import { Image } from "expo-image";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { Feather } from "@expo/vector-icons";

// This Clerk instance requires a password on every account (instance-level
// `password: "required"`), so brand-new sign-ups must collect one — the old
// code called signUp.create({ emailAddress }) with no password, which this
// instance rejects. Existing accounts, however, also support the "email_code"
// passwordless first factor, so returning users keep the one-tap-code flow;
// password is only ever asked for as a fallback when email_code genuinely
// isn't offered for that account (instead of dead-ending on a contact-support
// message), and up front for brand-new accounts since Clerk demands it.
// Accounts created through a social provider on the web dashboard have neither
// factor — their only first factor is the provider — so those hand off to
// Clerk's SSO flow rather than dead-ending too.
// Finally, "reset_password_email_code" is offered by this instance for any
// account that has a password. It is both the escape hatch for a forgotten
// password (the password step had no way out before) and the last resort when
// no other first factor is usable, so it is wired up rather than left to a
// "contact support" dead end.
type Step =
  | "email"
  | "code"
  | "password"
  | "signup-password"
  | "reset"
  | "second-code"
  | "new-password";
type SecondFactorStrategy = "email_code" | "totp" | "backup_code";

// @clerk/types is not a direct dependency of this app, so derive the OAuth
// strategy union from the hook itself rather than importing it. Extracting the
// branch without `identifier` picks the OAuth arm of startSSOFlow's parameter
// union, leaving out the enterprise-SSO arm.
type OAuthStrategy = Extract<
  Parameters<ReturnType<typeof useSSO>["startSSOFlow"]>[0],
  { identifier?: undefined }
>["strategy"];

export default function SignInScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { signIn, setActive: setSignInActive, isLoaded: signInLoaded } = useSignIn();
  const { signUp, setActive: setSignUpActive, isLoaded: signUpLoaded } = useSignUp();
  const { startSSOFlow } = useSSO();

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<Step>("email");
  const [isSignUp, setIsSignUp] = useState(false);
  const [secondFactorStrategy, setSecondFactorStrategy] =
    useState<SecondFactorStrategy | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const runSSO = async (strategy: OAuthStrategy) => {
    // Linking.createURL, not AuthSession.makeRedirectUri: importing
    // expo-auth-session drags expo-crypto (via its PKCE module) into the
    // bundle, and this app ships JS updates against an already-built binary —
    // a native module that isn't in that binary crashes on open. expo-linking
    // is already part of the deep-link path and needs nothing new. Resolves to
    // sitesnap://sso-callback from the scheme in app.json.
    const { createdSessionId, setActive } = await startSSOFlow({
      strategy,
      redirectUrl: Linking.createURL("sso-callback"),
    });

    if (createdSessionId && setActive) {
      await setActive({ session: createdSessionId });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      // The user dismissed the provider sheet, or the provider needs extra
      // steps Clerk could not complete headlessly.
      setError("Sign in was not completed. Please try again.");
    }
  };

  const continueSignIn = async (result: any): Promise<boolean> => {
    if (result.status === "complete" && result.createdSessionId) {
      await setSignInActive!({ session: result.createdSessionId });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return true;
    }

    if (result.status === "needs_new_password") {
      setPassword("");
      setStep("new-password");
      return true;
    }

    if (result.status === "needs_second_factor") {
      const factors = result.supportedSecondFactors ?? [];
      const emailCodeFactor = factors.find(
        (factor: any) => factor.strategy === "email_code",
      ) as any;
      const totpFactor = factors.find((factor: any) => factor.strategy === "totp");
      const backupCodeFactor = factors.find(
        (factor: any) => factor.strategy === "backup_code",
      );

      setCode("");
      if (emailCodeFactor) {
        await signIn!.prepareSecondFactor({
          strategy: "email_code",
          emailAddressId: emailCodeFactor.emailAddressId,
        });
        setSecondFactorStrategy("email_code");
        setStep("second-code");
        return true;
      }
      if (totpFactor) {
        setSecondFactorStrategy("totp");
        setStep("second-code");
        return true;
      }
      if (backupCodeFactor) {
        setSecondFactorStrategy("backup_code");
        setStep("second-code");
        return true;
      }

      setError("This account requires an additional verification method that the app does not support yet.");
      return false;
    }

    setError(
      `Sign in could not continue${
        result.status ? ` (${String(result.status).replaceAll("_", " ")})` : ""
      }. Please go back and try again.`,
    );
    return false;
  };

  const handleContinue = async () => {
    if (!signInLoaded || !signUpLoaded || !email.trim() || loading) return;
    Keyboard.dismiss();
    setLoading(true);
    setError("");

    try {
      const si = await signIn!.create({ identifier: email.trim() });
      const factors = si.supportedFirstFactors ?? [];
      const emailFactor = factors.find((f: any) => f.strategy === "email_code") as any;
      const passwordFactor = factors.find((f: any) => f.strategy === "password") as any;
      const oauthFactor = factors.find((f: any) =>
        typeof f?.strategy === "string" && f.strategy.startsWith("oauth_"),
      ) as any;
      const resetFactor = factors.find(
        (f: any) => f.strategy === "reset_password_email_code",
      ) as any;

      if (si.status === "complete" && si.createdSessionId) {
        await continueSignIn(si);
      } else if (emailFactor) {
        await signIn!.prepareFirstFactor({
          strategy: "email_code",
          emailAddressId: emailFactor.emailAddressId,
        });
        setIsSignUp(false);
        setStep("code");
      } else if (passwordFactor) {
        setIsSignUp(false);
        setStep("password");
      } else if (oauthFactor) {
        // Accounts created through a social provider on the web dashboard have
        // no password and no email_code factor — their only first factor is the
        // provider itself. Hand off to that provider instead of dead-ending.
        setIsSignUp(false);
        await runSSO(oauthFactor.strategy as OAuthStrategy);
      } else if (resetFactor) {
        // The account has a password but Clerk isn't offering it as a usable
        // first factor (e.g. the password was never set by the user, or the
        // email is unverified). Emailing a reset code is a real way in, so
        // take it instead of dead-ending.
        setIsSignUp(false);
        await startReset();
      } else {
        // Clerk can return an empty supportedFirstFactors list for an existing,
        // verified password account during identifier-first sign-in. Do not
        // strand that user: the active attempt can still accept a password,
        // and the password screen also provides the reset-code escape hatch.
        setIsSignUp(false);
        setStep("password");
      }
    } catch (e: any) {
      const code0 = e?.errors?.[0]?.code;
      if (code0 === "form_identifier_not_found") {
        // Brand-new email — this Clerk instance requires a password on every
        // account, so collect one before creating it.
        setIsSignUp(true);
        setStep("signup-password");
      } else {
        setError(e?.errors?.[0]?.message ?? "Could not sign in.");
      }
    } finally {
      setLoading(false);
    }
  };

  // Sends a reset code and moves to the "reset" step. Passing `strategy` to
  // signIn.create both creates the sign-in attempt and prepares the factor, so
  // no separate prepareFirstFactor call is needed. Callers that already set
  // `loading` (handleContinue) are fine — setLoading is idempotent and the
  // finally block there clears it.
  const startReset = async () => {
    if (!signInLoaded || !email.trim()) return;
    setError("");
    setCode("");
    setPassword("");

    try {
      await signIn!.create({
        strategy: "reset_password_email_code",
        identifier: email.trim(),
      });
      setStep("reset");
    } catch (e: any) {
      setError(
        e?.errors?.[0]?.longMessage ??
          e?.errors?.[0]?.message ??
          "Could not send a reset code. Please try again.",
      );
    }
  };

  const handleForgotPassword = async () => {
    if (loading) return;
    Keyboard.dismiss();
    setLoading(true);
    try {
      await startReset();
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (!signInLoaded || !code.trim() || !password || loading) return;
    Keyboard.dismiss();
    setLoading(true);
    setError("");

    try {
      const result = await signIn!.attemptFirstFactor({
        strategy: "reset_password_email_code",
        code: code.trim(),
        password,
      });
      await continueSignIn(result);
    } catch (e: any) {
      const errMsg =
        e?.errors?.[0]?.longMessage ??
        e?.errors?.[0]?.message ??
        "Could not reset your password. Please try again.";
      setError(errMsg);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSignIn = async () => {
    if (!signInLoaded || !password || loading) return;
    Keyboard.dismiss();
    setLoading(true);
    setError("");

    try {
      const result = await signIn!.attemptFirstFactor({ strategy: "password", password });
      await continueSignIn(result);
    } catch (e: any) {
      const errMsg = e?.errors?.[0]?.longMessage ?? e?.errors?.[0]?.message ?? "Incorrect password. Please try again.";
      setError(errMsg);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  const handleNewPassword = async () => {
    if (!signInLoaded || !password || loading) return;
    Keyboard.dismiss();
    setLoading(true);
    setError("");

    try {
      const result = await signIn!.resetPassword({
        password,
        signOutOfOtherSessions: false,
      });
      await continueSignIn(result);
    } catch (e: any) {
      setError(
        e?.errors?.[0]?.longMessage ??
          e?.errors?.[0]?.message ??
          "Could not set your new password. Please try again.",
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  const handleSecondFactor = async () => {
    if (!signInLoaded || !secondFactorStrategy || !code.trim() || loading) return;
    Keyboard.dismiss();
    setLoading(true);
    setError("");

    try {
      const result = await signIn!.attemptSecondFactor({
        strategy: secondFactorStrategy,
        code: code.trim(),
      });
      await continueSignIn(result);
    } catch (e: any) {
      setError(
        e?.errors?.[0]?.longMessage ??
          e?.errors?.[0]?.message ??
          "Invalid verification code. Please try again.",
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  const handleSignUpPassword = async () => {
    if (!signUpLoaded || !password || loading) return;
    Keyboard.dismiss();
    setLoading(true);
    setError("");

    try {
      await signUp!.create({ emailAddress: email.trim(), password });
      await signUp!.prepareEmailAddressVerification({ strategy: "email_code" });
      setStep("code");
    } catch (e: any) {
      setError(e?.errors?.[0]?.message ?? "Could not create your account.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!signInLoaded || !signUpLoaded || !code.trim() || loading) return;
    Keyboard.dismiss();
    setLoading(true);
    setError("");

    try {
      if (isSignUp) {
        const result = await signUp!.attemptEmailAddressVerification({ code: code.trim() });
        if (result.status === "complete") {
          await setSignUpActive!({ session: result.createdSessionId });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
          setError("Verification incomplete. Please try again.");
        }
      } else {
        const result = await signIn!.attemptFirstFactor({
          strategy: "email_code",
          code: code.trim(),
        });
        await continueSignIn(result);
      }
    } catch (e: any) {
      const errMsg = e?.errors?.[0]?.longMessage ?? e?.errors?.[0]?.message ?? "Invalid code. Please try again.";
      setError(errMsg);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!signInLoaded || !signUpLoaded || loading) return;
    setLoading(true);
    setError("");
    setCode("");

    try {
      if (step === "second-code" && secondFactorStrategy === "email_code") {
        const emailFactor = signIn!.supportedSecondFactors?.find(
          (factor: any) => factor.strategy === "email_code",
        ) as any;
        await signIn!.prepareSecondFactor({
          strategy: "email_code",
          emailAddressId: emailFactor?.emailAddressId,
        });
      } else if (step === "reset") {
        // Clerk needs the email address id even on a re-prepare; it is on the
        // factor entry that signIn.create populated.
        const resetFactor = signIn!.supportedFirstFactors?.find(
          (f: any) => f.strategy === "reset_password_email_code",
        ) as any;
        await signIn!.prepareFirstFactor({
          strategy: "reset_password_email_code",
          emailAddressId: resetFactor?.emailAddressId,
        });
      } else if (isSignUp) {
        await signUp!.prepareEmailAddressVerification({ strategy: "email_code" });
      } else {
        const emailFactor = signIn!.supportedFirstFactors?.find(
          (f: any) => f.strategy === "email_code"
        ) as any;
        if (emailFactor) {
          await signIn!.prepareFirstFactor({
            strategy: "email_code",
            emailAddressId: emailFactor.emailAddressId,
          });
        }
      }
    } catch (e: any) {
      setError(e?.errors?.[0]?.message ?? "Could not resend code. Please go back and try again.");
    } finally {
      setLoading(false);
    }
  };

  const goBackToEmail = () => {
    setStep("email");
    setCode("");
    setPassword("");
    setSecondFactorStrategy(null);
    setError("");
  };

  // M-P5 fix: useMemo so StyleSheet.create only re-runs when colors change
  const s = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.sidebar,
      paddingTop: Platform.OS === "web" ? 67 : insets.top,
      paddingBottom: Platform.OS === "web" ? 34 : insets.bottom,
    },
    logoArea: {
      flex: 1,
      justifyContent: "flex-end",
      paddingHorizontal: 32,
      paddingBottom: 48,
    },
    logo: {
      width: 56,
      height: 56,
      borderRadius: 16,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 24,
    },
    appName: {
      fontSize: 32,
      fontWeight: "700",
      color: "#FFFFFF",
      fontFamily: "NunitoSans_700Bold",
      marginBottom: 8,
    },
    tagline: {
      fontSize: 16,
      color: "rgba(255,255,255,0.55)",
      fontFamily: "NunitoSans_400Regular",
    },
    form: {
      backgroundColor: colors.background,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 32,
      paddingBottom: 0,
    },
    formTitle: {
      fontSize: 22,
      fontWeight: "700",
      color: colors.foreground,
      fontFamily: "NunitoSans_700Bold",
      marginBottom: 6,
    },
    formSubtitle: {
      fontSize: 14,
      color: colors.mutedForeground,
      fontFamily: "NunitoSans_400Regular",
      marginBottom: 28,
    },
    label: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.mutedForeground,
      fontFamily: "NunitoSans_600SemiBold",
      marginBottom: 8,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    input: {
      backgroundColor: colors.muted,
      borderRadius: colors.radius,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 16,
      color: colors.foreground,
      fontFamily: "NunitoSans_400Regular",
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    button: {
      backgroundColor: colors.primary,
      borderRadius: colors.radius,
      paddingVertical: 16,
      alignItems: "center",
      marginBottom: 16,
    },
    buttonText: {
      color: "#FFFFFF",
      fontSize: 16,
      fontWeight: "700",
      fontFamily: "NunitoSans_700Bold",
    },
    backButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginBottom: 24,
    },
    backText: {
      fontSize: 14,
      color: colors.mutedForeground,
      fontFamily: "NunitoSans_400Regular",
    },
    error: {
      backgroundColor: "#FEE2E2",
      borderRadius: colors.radius,
      padding: 12,
      marginBottom: 16,
    },
    errorText: {
      color: colors.destructive,
      fontSize: 14,
      fontFamily: "NunitoSans_400Regular",
    },
    hint: {
      fontSize: 13,
      color: colors.mutedForeground,
      fontFamily: "NunitoSans_400Regular",
      textAlign: "center",
      marginTop: 8,
    },
  }), [colors, insets]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={s.container}>
        <View style={s.logoArea}>
          <Image
            source={require("../assets/images/sitesnap-logo.png")}
            style={{ width: 80, height: 80, borderRadius: 20, marginBottom: 24 }}
            resizeMode="contain"
          />
          <Text style={s.appName}>Site Snap</Text>
          <Text style={s.tagline}>Construction Efficiency, Simplified</Text>
        </View>

        <View style={s.form}>
          {step === "email" && (
            <>
              <Text style={s.formTitle}>Sign in</Text>
              <Text style={s.formSubtitle}>Enter your work email to continue</Text>

              {!!error && (
                <View style={s.error}>
                  <Text style={s.errorText}>{error}</Text>
                </View>
              )}

              <Text style={s.label}>Email</Text>
              <TextInput
                style={s.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@yourcompany.ca"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                onSubmitEditing={handleContinue}
                returnKeyType="done"
              />

              <TouchableOpacity
                style={[s.button, (!email.trim() || loading) && { opacity: 0.5 }]}
                onPress={handleContinue}
                disabled={!email.trim() || loading}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Continue"
                accessibilityHint="Sends a verification code to your email address"
                accessibilityState={{ disabled: !email.trim() || loading }}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={s.buttonText}>Continue</Text>
                )}
              </TouchableOpacity>
              <Text style={s.hint}>A verification code will be sent to your email</Text>
            </>
          )}

          {step === "password" && (
            <>
              <TouchableOpacity style={s.backButton} onPress={goBackToEmail}>
                <Feather name="arrow-left" size={16} color={colors.mutedForeground} />
                <Text style={s.backText}>Back</Text>
              </TouchableOpacity>

              <Text style={s.formTitle}>Enter your password</Text>
              <Text style={s.formSubtitle}>Sign in as {email}</Text>

              {!!error && (
                <View style={s.error}>
                  <Text style={s.errorText}>{error}</Text>
                </View>
              )}

              <Text style={s.label}>Password</Text>
              <TextInput
                style={s.input}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={colors.mutedForeground}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                onSubmitEditing={handlePasswordSignIn}
                returnKeyType="done"
                autoFocus
              />

              <TouchableOpacity
                style={[s.button, (!password || loading) && { opacity: 0.5 }]}
                onPress={handlePasswordSignIn}
                disabled={!password || loading}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Sign in"
                accessibilityState={{ disabled: !password || loading }}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={s.buttonText}>Sign In</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleForgotPassword}
                disabled={loading}
                activeOpacity={0.7}
                style={{ alignItems: "center", paddingVertical: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Forgot password"
                accessibilityHint="Emails you a code to set a new password"
              >
                <Text style={[s.hint, { color: colors.primary, fontWeight: "600" }]}>
                  Forgot password?
                </Text>
              </TouchableOpacity>
            </>
          )}

          {step === "new-password" && (
            <>
              <TouchableOpacity style={s.backButton} onPress={goBackToEmail}>
                <Feather name="arrow-left" size={16} color={colors.mutedForeground} />
                <Text style={s.backText}>Back</Text>
              </TouchableOpacity>

              <Text style={s.formTitle}>Create a new password</Text>
              <Text style={s.formSubtitle}>
                Your current password was accepted, but this account requires a new password
                before sign-in can finish.
              </Text>

              {!!error && (
                <View style={s.error}>
                  <Text style={s.errorText}>{error}</Text>
                </View>
              )}

              <Text style={s.label}>New password</Text>
              <TextInput
                style={s.input}
                value={password}
                onChangeText={setPassword}
                placeholder="At least 8 characters"
                placeholderTextColor={colors.mutedForeground}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                onSubmitEditing={handleNewPassword}
                returnKeyType="done"
                autoFocus
              />

              <TouchableOpacity
                style={[s.button, (!password || loading) && { opacity: 0.5 }]}
                onPress={handleNewPassword}
                disabled={!password || loading}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Set new password and sign in"
                accessibilityState={{ disabled: !password || loading }}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={s.buttonText}>Set Password & Sign In</Text>
                )}
              </TouchableOpacity>
            </>
          )}

          {step === "reset" && (
            <>
              <TouchableOpacity style={s.backButton} onPress={goBackToEmail}>
                <Feather name="arrow-left" size={16} color={colors.mutedForeground} />
                <Text style={s.backText}>Back</Text>
              </TouchableOpacity>

              <Text style={s.formTitle}>Set a new password</Text>
              <Text style={s.formSubtitle}>
                Enter the 6-digit code sent to {email} and choose a new password
              </Text>

              {!!error && (
                <View style={s.error}>
                  <Text style={s.errorText}>{error}</Text>
                </View>
              )}

              <Text style={s.label}>Verification code</Text>
              <TextInput
                style={s.input}
                value={code}
                onChangeText={setCode}
                placeholder="000000"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="number-pad"
                maxLength={6}
                returnKeyType="next"
                autoFocus
              />

              <Text style={s.label}>New password</Text>
              <TextInput
                style={s.input}
                value={password}
                onChangeText={setPassword}
                placeholder="At least 8 characters"
                placeholderTextColor={colors.mutedForeground}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                onSubmitEditing={handleReset}
                returnKeyType="done"
              />

              <TouchableOpacity
                style={[s.button, (!code.trim() || !password || loading) && { opacity: 0.5 }]}
                onPress={handleReset}
                disabled={!code.trim() || !password || loading}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Set new password and sign in"
                accessibilityState={{ disabled: !code.trim() || !password || loading }}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={s.buttonText}>Set Password & Sign In</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleResend}
                disabled={loading}
                activeOpacity={0.7}
                style={{ alignItems: "center", paddingVertical: 8 }}
              >
                <Text style={s.hint}>
                  Didn&apos;t receive a code?{" "}
                  <Text style={{ color: colors.primary, fontWeight: "600" }}>Resend</Text>
                </Text>
              </TouchableOpacity>
            </>
          )}

          {step === "signup-password" && (
            <>
              <TouchableOpacity style={s.backButton} onPress={goBackToEmail}>
                <Feather name="arrow-left" size={16} color={colors.mutedForeground} />
                <Text style={s.backText}>Back</Text>
              </TouchableOpacity>

              <Text style={s.formTitle}>Create your account</Text>
              <Text style={s.formSubtitle}>Choose a password for {email}</Text>

              {!!error && (
                <View style={s.error}>
                  <Text style={s.errorText}>{error}</Text>
                </View>
              )}

              <Text style={s.label}>Password</Text>
              <TextInput
                style={s.input}
                value={password}
                onChangeText={setPassword}
                placeholder="At least 8 characters"
                placeholderTextColor={colors.mutedForeground}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                onSubmitEditing={handleSignUpPassword}
                returnKeyType="done"
                autoFocus
              />

              <TouchableOpacity
                style={[s.button, (!password || loading) && { opacity: 0.5 }]}
                onPress={handleSignUpPassword}
                disabled={!password || loading}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Create account"
                accessibilityState={{ disabled: !password || loading }}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={s.buttonText}>Continue</Text>
                )}
              </TouchableOpacity>
              <Text style={s.hint}>We'll email you a verification code next</Text>
            </>
          )}

          {(step === "code" || step === "second-code") && (
            <>
              <TouchableOpacity style={s.backButton} onPress={goBackToEmail}>
                <Feather name="arrow-left" size={16} color={colors.mutedForeground} />
                <Text style={s.backText}>Back</Text>
              </TouchableOpacity>

              <Text style={s.formTitle}>
                {step === "second-code" && secondFactorStrategy === "totp"
                  ? "Enter authenticator code"
                  : step === "second-code" && secondFactorStrategy === "backup_code"
                    ? "Enter a backup code"
                    : "Check your email"}
              </Text>
              <Text style={s.formSubtitle}>
                {step === "second-code" && secondFactorStrategy === "totp"
                  ? "Enter the code from your authenticator app"
                  : step === "second-code" && secondFactorStrategy === "backup_code"
                    ? "Enter one of your saved backup codes"
                    : `Enter the 6-digit code sent to ${email}`}
              </Text>

              {!!error && (
                <View style={s.error}>
                  <Text style={s.errorText}>{error}</Text>
                </View>
              )}

              <Text style={s.label}>Verification code</Text>
              <TextInput
                style={s.input}
                value={code}
                onChangeText={setCode}
                placeholder="000000"
                placeholderTextColor={colors.mutedForeground}
                keyboardType={
                  step === "second-code" && secondFactorStrategy === "backup_code"
                    ? "default"
                    : "number-pad"
                }
                maxLength={
                  step === "second-code" && secondFactorStrategy === "backup_code"
                    ? undefined
                    : 6
                }
                onSubmitEditing={step === "second-code" ? handleSecondFactor : handleVerify}
                returnKeyType="done"
                autoFocus
              />

              <TouchableOpacity
                style={[s.button, (!code.trim() || loading) && { opacity: 0.5 }]}
                onPress={step === "second-code" ? handleSecondFactor : handleVerify}
                disabled={!code.trim() || loading}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Verify and sign in"
                accessibilityHint="Submits your 6-digit verification code"
                accessibilityState={{ disabled: !code.trim() || loading }}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={s.buttonText}>Verify & Sign In</Text>
                )}
              </TouchableOpacity>

              {(step === "code" || secondFactorStrategy === "email_code") && (
                <TouchableOpacity
                  onPress={handleResend}
                  disabled={loading}
                  activeOpacity={0.7}
                  style={{ alignItems: "center", paddingVertical: 8 }}
                >
                  <Text style={s.hint}>
                    Didn't receive a code?{" "}
                    <Text style={{ color: colors.primary, fontWeight: "600" }}>Resend</Text>
                  </Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
