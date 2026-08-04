import { useSignIn, useSignUp } from "@clerk/clerk-expo";
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
type Step = "email" | "code" | "password" | "signup-password";

export default function SignInScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { signIn, setActive: setSignInActive, isLoaded: signInLoaded } = useSignIn();
  const { signUp, setActive: setSignUpActive, isLoaded: signUpLoaded } = useSignUp();

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<Step>("email");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleContinue = async () => {
    if (!signInLoaded || !signUpLoaded || !email.trim()) return;
    Keyboard.dismiss();
    setLoading(true);
    setError("");

    try {
      const si = await signIn!.create({ identifier: email.trim() });
      const factors = si.supportedFirstFactors ?? [];
      const emailFactor = factors.find((f: any) => f.strategy === "email_code") as any;
      const passwordFactor = factors.find((f: any) => f.strategy === "password") as any;

      if (emailFactor) {
        await signIn!.prepareFirstFactor({
          strategy: "email_code",
          emailAddressId: emailFactor.emailAddressId,
        });
        setIsSignUp(false);
        setStep("code");
      } else if (passwordFactor) {
        setIsSignUp(false);
        setStep("password");
      } else {
        setError("This account can't sign in yet. Please contact support.");
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

  const handlePasswordSignIn = async () => {
    if (!signInLoaded || !password) return;
    Keyboard.dismiss();
    setLoading(true);
    setError("");

    try {
      const result = await signIn!.attemptFirstFactor({ strategy: "password", password });
      if (result.status === "complete") {
        await setSignInActive!({ session: result.createdSessionId });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        setError("Sign in incomplete. Please try again.");
      }
    } catch (e: any) {
      const errMsg = e?.errors?.[0]?.longMessage ?? e?.errors?.[0]?.message ?? "Incorrect password. Please try again.";
      setError(errMsg);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  const handleSignUpPassword = async () => {
    if (!signUpLoaded || !password) return;
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
    if (!signInLoaded || !signUpLoaded || !code.trim()) return;
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
        if (result.status === "complete") {
          await setSignInActive!({ session: result.createdSessionId });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
          setError("Sign in incomplete. Please try again.");
        }
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
      if (isSignUp) {
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

          {step === "code" && (
            <>
              <TouchableOpacity style={s.backButton} onPress={goBackToEmail}>
                <Feather name="arrow-left" size={16} color={colors.mutedForeground} />
                <Text style={s.backText}>Back</Text>
              </TouchableOpacity>

              <Text style={s.formTitle}>Check your email</Text>
              <Text style={s.formSubtitle}>Enter the 6-digit code sent to {email}</Text>

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
                onSubmitEditing={handleVerify}
                returnKeyType="done"
                autoFocus
              />

              <TouchableOpacity
                style={[s.button, (!code.trim() || loading) && { opacity: 0.5 }]}
                onPress={handleVerify}
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
            </>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
