const TEMP_EMAIL_DOMAINS = [
  'tempmail.com',
  '10minutemail.com',
  'guerrillamail.com',
  'mailinator.com',
  'yopmail.com',
];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

export const normalizeEmail = (email = '') => email.trim().toLowerCase();

export const isValidEmail = (email = '') => EMAIL_REGEX.test(normalizeEmail(email));

export const isTemporaryEmail = (email = '') => {
  const normalized = normalizeEmail(email);
  return TEMP_EMAIL_DOMAINS.some((domain) => normalized.endsWith(`@${domain}`));
};

export { TEMP_EMAIL_DOMAINS };
