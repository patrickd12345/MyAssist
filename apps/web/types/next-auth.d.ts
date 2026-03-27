import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    id: string;
  }

  interface Session {
    user: DefaultSession["user"] & {
      id: string;
    };
  }
}
