// TODO: dynamic
const USER_ID_KEY = 'boutique-user-id';

export function getUserId(): string {
  let userId = localStorage.getItem(USER_ID_KEY);
  if (!userId) {
    userId = 'ab4342f3-919c-40df-91d8-d042d64b4d9a';
    localStorage.setItem(USER_ID_KEY, userId);
  }

  return userId;
}
