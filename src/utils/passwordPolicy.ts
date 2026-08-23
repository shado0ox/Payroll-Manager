export const PASSWORD_MIN_LENGTH = 8;

export const passwordPolicyMessage =
  'كلمة المرور يجب أن تكون 8 خانات على الأقل وتحتوي على حرف كبير وحرف صغير ورقم ورمز';

export function isStrongPassword(password: string): boolean {
  return password.length >= PASSWORD_MIN_LENGTH
    && password.length <= 128
    && /[A-Z]/.test(password)
    && /[a-z]/.test(password)
    && /\d/.test(password)
    && /[^A-Za-z0-9]/.test(password);
}
