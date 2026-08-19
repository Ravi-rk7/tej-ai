export const PASSWORD_RULES = Object.freeze([
    { label: 'At least 12 characters', test: (value) => value.length >= 12 },
    { label: 'One uppercase letter', test: (value) => /[A-Z]/.test(value) },
    { label: 'One lowercase letter', test: (value) => /[a-z]/.test(value) },
    { label: 'One number', test: (value) => /\d/.test(value) },
    { label: 'One symbol', test: (value) => /[^A-Za-z0-9]/.test(value) },
]);

export const getPasswordRuleResults = (password) => PASSWORD_RULES.map((rule) => ({
    label: rule.label,
    passed: rule.test(password),
}));

export const validatePassword = (password) => {
    const failedRule = PASSWORD_RULES.find((rule) => !rule.test(password));
    return failedRule ? `Password must include: ${failedRule.label.toLowerCase()}.` : '';
};

const AUTH_ERROR_MESSAGES = Object.freeze({
    invalid_credentials: 'Email or password is incorrect.',
    email_not_confirmed: 'Confirm your email before signing in.',
    user_already_exists: 'An account with this email already exists.',
    signup_disabled: 'Account registration is temporarily unavailable.',
    over_email_send_rate_limit: 'Too many email requests. Please wait and try again.',
    over_request_rate_limit: 'Too many attempts. Please wait and try again.',
    weak_password: 'Choose a stronger password that meets every requirement.',
    same_password: 'Choose a password you have not used for this account.',
});

export const getSafeAuthError = (
    error,
    fallback = 'We could not complete that request. Please try again.'
) => AUTH_ERROR_MESSAGES[error?.code] || fallback;
