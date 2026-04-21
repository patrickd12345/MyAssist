export type StoredUser = {
  id: string;
  email: string;
  passwordHash: string;
  todoistApiToken?: string;
};

export type SafeUser = Omit<StoredUser, "passwordHash">;
