/** Same rules as the server's parseNewPassword (api/src/handlers/accountRoutes.js) */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_HINT = 'حداقل ۸ کاراکتر، شامل حرف و عدد';

/** @returns {string} an error message, or '' when the password is acceptable */
export function checkNewPassword(password, confirm) {
  if (password.length < PASSWORD_MIN_LENGTH) return 'رمز عبور باید حداقل ۸ کاراکتر باشد.';
  if (password.length > 128) return 'رمز عبور بیش از حد طولانی است.';
  if (!/[A-Za-z؀-ۿ]/.test(password) || !/[0-9۰-۹]/.test(password)) {
    return 'رمز عبور باید هم حرف و هم عدد داشته باشد.';
  }
  if (confirm !== undefined && confirm !== password) return 'تکرار رمز عبور یکسان نیست.';
  return '';
}
