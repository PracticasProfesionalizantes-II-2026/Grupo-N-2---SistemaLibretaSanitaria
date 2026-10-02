import type { NextAuthConfig } from "next-auth";

/**
 * Auth.js settings shared by `src/auth.ts` and `src/proxy.ts`.
 *
 * No providers and no database here: the proxy only needs to decode the JWT
 * cookie. The Credentials provider (which talks to Postgres) lives in auth.ts.
 */
export const authConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  trustHost: true,
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      session.user.role = (token.role as string | null | undefined) ?? null;
      return session;
    },
  },
} satisfies NextAuthConfig;
