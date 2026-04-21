export interface TestEmail {
  id: string;
  subject: string;
  from: string;
  to: string;
  html: string;
  text: string;
}

export interface TestInboxAdapter {
  generateEmailAddress(): string;
  waitForEmail(to: string, subjectIncludes: string, timeoutMs?: number): Promise<TestEmail>;
  deleteAllEmails(to: string): Promise<void>;
}
