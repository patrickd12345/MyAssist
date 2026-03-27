export type StoredUser = {
  id: string;
  email: string;
  passwordHash: string;
  todoistApiToken?: string;
  passwordResetTokenHash?: string;
  passwordResetExpiresAt?: string;
};

export type SafeUser = Omit<StoredUser, "passwordHash">;
