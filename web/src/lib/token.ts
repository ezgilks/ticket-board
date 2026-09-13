const TOKEN_KEY = "ticketboard.token";

// Trade-off: localStorage is readable by any script on the page, so an XSS bug
// could steal the token. An httpOnly cookie avoids that, but needs cross-site
// cookie + CSRF handling because the frontend and API are on different domains
// in production. React escapes rendered text by default, which keeps XSS risk low.
export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};
