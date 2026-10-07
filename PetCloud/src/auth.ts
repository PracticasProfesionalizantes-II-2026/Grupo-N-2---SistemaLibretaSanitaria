import "server-only";

import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { authConfig } from "@/auth.config";
import { getUserById, verifyCredentials } from "@/lib/auth/admin";

/**
 * Authentication: Auth.js v5, email + password against `auth.users`
 * (bcrypt hashes, compatible with the ones previously stored), JWT session.
 *
 * The session carries the user id and the database role
 * (`raw_app_meta_data.role`: owner | vet | municipality | admin), the same
 * value the former hosted-auth JWT carried in `app_metadata.role`.
 *
 * TODO(azure): add the Microsoft Entra ID provider here
 * (`next-auth/providers/microsoft-entra-id`) when the deploy moves to Azure.
 */

declare module "next-auth" {
  interface User {
    role?: string | null;
  }
  interface Session {
    user: { id: string; role: string | null } & DefaultSession["user"];
  }
}

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "");
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;

        const user = await verifyCredentials(email, password);
        if (!user) return null;

        return {
          id: user.id,
          email: user.email,
          role: (user.app_metadata.role as string | undefined) ?? null,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt(params) {
      const token = await authConfig.callbacks.jwt(params);
      // `unstable_update()` after a role change (e.g. accepting a team
      // invite) re-reads the role, like the old auth client refreshSession() did.
      if (params.trigger === "update" && token.sub) {
        const user = await getUserById(token.sub);
        token.role = (user?.app_metadata.role as string | undefined) ?? null;
      }
      return token;
    },
  },
});
