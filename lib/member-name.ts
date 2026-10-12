/**
 * The same name rule the lounge's membership forms apply. People have typed
 * their ID number or email into the name box, and a 13-digit ID passes a plain
 * length check. Real names vary a lot (one word, hyphens, apostrophes, accents,
 * initials), so only values that plainly are not a name are refused.
 */
const LETTER = /\p{L}/u
const LONG_DIGIT_RUN = /\d{6,}/

/** Why `name` is not acceptable as a full name, or null when it is. */
export function memberNameProblem(name: string | null | undefined): string | null {
  const value = (name ?? "").trim()
  if (value.length < 2) return "Enter your full name, as it appears on your ID."
  if (!LETTER.test(value)) return "Your full name must be a name, not a number. Check the ID and phone boxes."
  if (value.includes("@")) return "That looks like an email address. Enter it in the email box."
  if (LONG_DIGIT_RUN.test(value)) return "Your full name cannot contain an ID or phone number."
  return null
}
