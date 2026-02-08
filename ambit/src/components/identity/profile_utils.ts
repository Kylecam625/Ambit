/** Shared constants and utilities for profile management components. */

export const ENROLLMENT_CAPTURES_REQUIRED = 3;

export const CAPTURE_INSTRUCTIONS: string[] = [
  "Look straight at the camera",
  "Turn your head slightly LEFT",
  "Turn your head slightly RIGHT",
];

export const normalize_phone_number = (raw: string): string => {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const has_plus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";
  if (has_plus) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return `+${digits}`;
  return trimmed;
};

export const is_e164_phone_number = (value: string): boolean =>
  /^\+\d{10,15}$/.test(value);

/**
 * Validate phone + SMS consent pairing.
 * Returns an error string or null if valid.
 */
export const validate_phone_consent = (
  phone_number: string,
  sms_consent: boolean
): string | null => {
  const normalized = normalize_phone_number(phone_number);
  if (normalized && !sms_consent) {
    return "To save a phone number, please check the SMS consent box.";
  }
  if (sms_consent && !normalized) {
    return "Phone number is required to opt in to SMS messages.";
  }
  if (sms_consent && normalized && !is_e164_phone_number(normalized)) {
    return "Please enter a valid phone number in E.164 format (e.g. +15551234567).";
  }
  return null;
};
