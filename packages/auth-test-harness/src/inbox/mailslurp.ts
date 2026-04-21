import type { TestEmail, TestInboxAdapter } from "./types";
export class MailSlurpAdapter implements TestInboxAdapter {
  constructor() {
    const apiKey = process.env.MAILSLURP_API_KEY;
    if (!apiKey) {
      throw new Error('MailSlurpAdapter requires MAILSLURP_API_KEY env var.');
    }
  }
  generateEmailAddress(): string { throw new Error('MailSlurpAdapter not fully implemented yet.'); }
  async waitForEmail(to: string, subjectIncludes: string, timeoutMs = 30000): Promise<TestEmail> { throw new Error('MailSlurpAdapter not fully implemented yet.'); }
  async deleteAllEmails(to: string): Promise<void> { throw new Error('MailSlurpAdapter not fully implemented yet.'); }
}
