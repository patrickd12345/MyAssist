import { vi } from "vitest";

vi.mock("server-only", () => ({}));

import "@testing-library/jest-dom/vitest";

process.env.MYASSIST_AUTH_DISABLED = "true";
process.env.MYASSIST_DEV_USER_ID = "test-user";
process.env.AUTH_SECRET = "vitest-auth-secret-at-least-32-characters-long";
