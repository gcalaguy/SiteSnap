import { describe, expect, it, vi } from "vitest";
import {
  attemptPasswordSignIn,
  attemptResetPassword,
  clerkErrorMessage,
  chooseFirstFactor,
  continueSignInResult,
  resendEmailSecondFactor,
  resendResetPasswordCode,
  startResetPassword,
} from "./signInFlow";

function mockSignIn() {
  return {
    create: vi.fn(),
    attemptFirstFactor: vi.fn(),
    prepareFirstFactor: vi.fn(),
    prepareSecondFactor: vi.fn(),
    supportedFirstFactors: undefined as
      | Array<{ strategy?: string; emailAddressId?: string }>
      | undefined,
    supportedSecondFactors: undefined as
      | Array<{ strategy?: string; emailAddressId?: string }>
      | undefined,
  };
}

describe("mobile password sign-in flow", () => {
  it("uses one-step password sign-in when Clerk returns no first factors", async () => {
    const signIn = mockSignIn();
    signIn.create.mockResolvedValue({ status: "complete", createdSessionId: "sess_1" });
    const choice = chooseFirstFactor([]);

    expect(choice).toEqual({ kind: "password", direct: true });
    await attemptPasswordSignIn({
      signIn,
      direct: choice.kind === "password" && choice.direct,
      email: " worker@example.com ",
      password: "secret-password",
    });

    expect(signIn.create).toHaveBeenCalledWith({
      identifier: "worker@example.com",
      strategy: "password",
      password: "secret-password",
    });
    expect(signIn.attemptFirstFactor).not.toHaveBeenCalled();
  });

  it("activates the created session for a complete result", async () => {
    const signIn = mockSignIn();
    const setActive = vi.fn();
    const outcome = await continueSignInResult({
      result: { status: "complete", createdSessionId: "sess_1" },
      signIn,
      setActive,
    });
    expect(outcome).toEqual({ kind: "complete" });
    expect(setActive).toHaveBeenCalledWith({ session: "sess_1" });
  });

  it("moves to new password for needs_new_password", async () => {
    const outcome = await continueSignInResult({
      result: { status: "needs_new_password" },
      signIn: mockSignIn(),
      setActive: vi.fn(),
    });
    expect(outcome).toEqual({ kind: "step", step: "new-password" });
  });

  it("prepares an email-code second factor", async () => {
    const signIn = mockSignIn();
    const outcome = await continueSignInResult({
      result: {
        status: "needs_second_factor",
        supportedSecondFactors: [
          { strategy: "email_code", emailAddressId: "idn_1" },
        ],
      },
      signIn,
      setActive: vi.fn(),
    });
    expect(signIn.prepareSecondFactor).toHaveBeenCalledWith({
      strategy: "email_code",
      emailAddressId: "idn_1",
    });
    expect(outcome).toEqual({
      kind: "step",
      step: "second-code",
      secondFactorStrategy: "email_code",
    });
  });

  it.each([
    ["totp", "totp"],
    ["backup_code", "backup_code"],
  ] as const)("selects the %s second factor", async (strategy, expected) => {
    const outcome = await continueSignInResult({
      result: { status: "needs_second_factor", supportedSecondFactors: [{ strategy }] },
      signIn: mockSignIn(),
      setActive: vi.fn(),
    });
    expect(outcome).toEqual({
      kind: "step",
      step: "second-code",
      secondFactorStrategy: expected,
    });
  });

  it.each([
    [null, "Sign in could not continue. Please go back and try again."],
    ["mystery_status", "Sign in could not continue (mystery status). Please go back and try again."],
  ])("rejects a %s status explicitly", async (status, message) => {
    const outcome = await continueSignInResult({
      result: { status },
      signIn: mockSignIn(),
      setActive: vi.fn(),
    });
    expect(outcome).toEqual({ kind: "error", message });
  });

  it("reports unsupported second factors", async () => {
    const outcome = await continueSignInResult({
      result: {
        status: "needs_second_factor",
        supportedSecondFactors: [{ strategy: "phone_code" }],
      },
      signIn: mockSignIn(),
      setActive: vi.fn(),
    });
    expect(outcome.kind).toBe("error");
  });

  it("resends email-code second-factor preparation", async () => {
    const signIn = mockSignIn();
    signIn.supportedSecondFactors = [
      { strategy: "email_code", emailAddressId: "idn_2" },
    ];
    await resendEmailSecondFactor(signIn);
    expect(signIn.prepareSecondFactor).toHaveBeenCalledWith({
      strategy: "email_code",
      emailAddressId: "idn_2",
    });
  });

  it("starts reset-password email-code verification", async () => {
    const signIn = mockSignIn();
    signIn.create.mockResolvedValue({ status: "needs_first_factor" });

    await startResetPassword(signIn, " worker@example.com ");

    expect(signIn.create).toHaveBeenCalledWith({
      strategy: "reset_password_email_code",
      identifier: "worker@example.com",
    });
  });

  it("resends the reset code with the reset factor email address id", async () => {
    const signIn = mockSignIn();
    signIn.supportedFirstFactors = [
      { strategy: "email_code", emailAddressId: "idn_wrong" },
      { strategy: "reset_password_email_code", emailAddressId: "idn_reset" },
    ];

    await resendResetPasswordCode(signIn);

    expect(signIn.prepareFirstFactor).toHaveBeenCalledWith({
      strategy: "reset_password_email_code",
      emailAddressId: "idn_reset",
    });
  });

  it("submits the reset code and continues a successful sign-in", async () => {
    const signIn = mockSignIn();
    const setActive = vi.fn();
    signIn.attemptFirstFactor.mockResolvedValue({
      status: "complete",
      createdSessionId: "sess_reset",
    });

    const result = await attemptResetPassword({
      signIn,
      code: " 123456 ",
      password: "new-secret-password",
    });
    const outcome = await continueSignInResult({ result, signIn, setActive });

    expect(signIn.attemptFirstFactor).toHaveBeenCalledWith({
      strategy: "reset_password_email_code",
      code: "123456",
      password: "new-secret-password",
    });
    expect(setActive).toHaveBeenCalledWith({ session: "sess_reset" });
    expect(outcome).toEqual({ kind: "complete" });
  });

  it("preserves Clerk reset errors for the screen to display", async () => {
    const signIn = mockSignIn();
    const clerkError = {
      errors: [{ longMessage: "That verification code has expired." }],
    };
    signIn.attemptFirstFactor.mockRejectedValue(clerkError);

    await expect(
      attemptResetPassword({
        signIn,
        code: "123456",
        password: "new-secret-password",
      }),
    ).rejects.toBe(clerkError);
    expect(
      clerkErrorMessage(clerkError, "Could not reset your password. Please try again."),
    ).toBe("That verification code has expired.");
  });

  it("uses Clerk's short message or the reset fallback when needed", () => {
    expect(
      clerkErrorMessage(
        { errors: [{ message: "The code is incorrect." }] },
        "Could not reset your password. Please try again.",
      ),
    ).toBe("The code is incorrect.");
    expect(
      clerkErrorMessage({}, "Could not reset your password. Please try again."),
    ).toBe("Could not reset your password. Please try again.");
  });
});