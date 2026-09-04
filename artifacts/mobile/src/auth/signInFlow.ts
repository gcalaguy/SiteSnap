export type SignInStep = "new-password" | "second-code";
export type SecondFactorStrategy = "email_code" | "totp" | "backup_code";

type Factor = {
  strategy?: string;
  emailAddressId?: string;
};

type SignInResult = {
  status?: string | null;
  createdSessionId?: string | null;
  supportedSecondFactors?: Factor[] | null;
};

type SignInAttempt = {
  create(args: Record<string, unknown>): Promise<SignInResult>;
  attemptFirstFactor(args: Record<string, unknown>): Promise<SignInResult>;
  prepareFirstFactor(args: Record<string, unknown>): Promise<unknown>;
  prepareSecondFactor(args: Record<string, unknown>): Promise<unknown>;
  supportedFirstFactors?: Factor[] | null;
  supportedSecondFactors?: Factor[] | null;
};

export type SignInContinuation =
  | { kind: "complete" }
  | { kind: "step"; step: SignInStep; secondFactorStrategy?: SecondFactorStrategy }
  | { kind: "error"; message: string };

export function clerkErrorMessage(error: unknown, fallback: string) {
  const first = (error as any)?.errors?.[0];
  return first?.longMessage ?? first?.message ?? fallback;
}

export function chooseFirstFactor(factors: Factor[] | null | undefined) {
  const available = factors ?? [];
  const email = available.find((factor) => factor.strategy === "email_code");
  const password = available.find((factor) => factor.strategy === "password");
  const oauth = available.find(
    (factor) => typeof factor.strategy === "string" && factor.strategy.startsWith("oauth_"),
  );
  const reset = available.find(
    (factor) => factor.strategy === "reset_password_email_code",
  );

  if (email) return { kind: "email" as const, factor: email };
  if (password) return { kind: "password" as const, direct: false };
  if (oauth) return { kind: "oauth" as const, factor: oauth };
  if (reset) return { kind: "reset" as const };
  return { kind: "password" as const, direct: true };
}

export async function attemptPasswordSignIn({
  signIn,
  direct,
  email,
  password,
}: {
  signIn: SignInAttempt;
  direct: boolean;
  email: string;
  password: string;
}) {
  if (direct) {
    return signIn.create({
      identifier: email.trim(),
      strategy: "password",
      password,
    });
  }
  return signIn.attemptFirstFactor({ strategy: "password", password });
}

export async function startResetPassword(signIn: SignInAttempt, email: string) {
  return signIn.create({
    strategy: "reset_password_email_code",
    identifier: email.trim(),
  });
}

export async function resendResetPasswordCode(signIn: SignInAttempt) {
  const reset = signIn.supportedFirstFactors?.find(
    (factor) => factor.strategy === "reset_password_email_code",
  );
  return signIn.prepareFirstFactor({
    strategy: "reset_password_email_code",
    emailAddressId: reset?.emailAddressId,
  });
}

export async function attemptResetPassword({
  signIn,
  code,
  password,
}: {
  signIn: SignInAttempt;
  code: string;
  password: string;
}) {
  return signIn.attemptFirstFactor({
    strategy: "reset_password_email_code",
    code: code.trim(),
    password,
  });
}

export async function continueSignInResult({
  result,
  signIn,
  setActive,
}: {
  result: SignInResult;
  signIn: SignInAttempt;
  setActive(args: { session: string }): Promise<unknown>;
}): Promise<SignInContinuation> {
  if (result.status === "complete" && result.createdSessionId) {
    await setActive({ session: result.createdSessionId });
    return { kind: "complete" };
  }

  if (result.status === "needs_new_password") {
    return { kind: "step", step: "new-password" };
  }

  if (result.status === "needs_second_factor") {
    const factors = result.supportedSecondFactors ?? [];
    const email = factors.find((factor) => factor.strategy === "email_code");
    if (email) {
      await signIn.prepareSecondFactor({
        strategy: "email_code",
        emailAddressId: email.emailAddressId,
      });
      return {
        kind: "step",
        step: "second-code",
        secondFactorStrategy: "email_code",
      };
    }
    if (factors.some((factor) => factor.strategy === "totp")) {
      return { kind: "step", step: "second-code", secondFactorStrategy: "totp" };
    }
    if (factors.some((factor) => factor.strategy === "backup_code")) {
      return { kind: "step", step: "second-code", secondFactorStrategy: "backup_code" };
    }
    return {
      kind: "error",
      message:
        "This account requires an additional verification method that the app does not support yet.",
    };
  }

  const status = result.status
    ? ` (${String(result.status).replaceAll("_", " ")})`
    : "";
  return {
    kind: "error",
    message: `Sign in could not continue${status}. Please go back and try again.`,
  };
}

export async function resendEmailSecondFactor(signIn: SignInAttempt) {
  const email = signIn.supportedSecondFactors?.find(
    (factor) => factor.strategy === "email_code",
  );
  await signIn.prepareSecondFactor({
    strategy: "email_code",
    emailAddressId: email?.emailAddressId,
  });
}