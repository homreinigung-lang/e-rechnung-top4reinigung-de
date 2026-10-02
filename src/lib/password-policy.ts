export const PASSWORD_MIN_LENGTH = 12;

export type PasswordPolicyResult = {
  valid: boolean;
  minLength: boolean;
  lowercase: boolean;
  uppercase: boolean;
  digit: boolean;
};

export function checkPasswordPolicy(password: string): PasswordPolicyResult {
  const minLength = password.length >= PASSWORD_MIN_LENGTH;
  const lowercase = /[a-zäöüß]/.test(password);
  const uppercase = /[A-ZÄÖÜ]/.test(password);
  const digit = /\d/.test(password);

  return {
    valid: minLength && lowercase && uppercase && digit,
    minLength,
    lowercase,
    uppercase,
    digit,
  };
}

export const PASSWORD_POLICY_LABEL =
  "Mindestens 12 Zeichen mit Groß- und Kleinbuchstaben sowie einer Zahl.";
