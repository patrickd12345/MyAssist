import type { TestEmail, TestInboxAdapter } from "./types";

export class MailpitAdapter implements TestInboxAdapter {
  private baseUrl: string;

  constructor() {
    this.baseUrl = process.env.MAILPIT_BASE_URL || 'http://localhost:8025';
  }

  generateEmailAddress(): string {
    const rand = Math.random().toString(36).substring(7);
    return `test-${rand}@example.com`;
  }

  async waitForEmail(to: string, subjectIncludes: string, timeoutMs = 30000): Promise<TestEmail> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      try {
        const response = await fetch(`${this.baseUrl}/api/v1/messages`);
        if (response.ok) {
          const data = await response.json();
          for (const msg of data.messages || []) {
            const isToMatch = msg.To && msg.To.some((t: any) => t.Address === to);
            const isSubjectMatch = msg.Subject && msg.Subject.includes(subjectIncludes);
            if (isToMatch && isSubjectMatch) {
              const fullMsgRes = await fetch(`${this.baseUrl}/api/v1/message/${msg.ID}`);
              if (fullMsgRes.ok) {
                const fullMsg = await fullMsgRes.json();
                return {
                  id: fullMsg.ID,
                  subject: fullMsg.Subject,
                  from: fullMsg.From.Address,
                  to: fullMsg.To[0].Address,
                  html: fullMsg.HTML || '',
                  text: fullMsg.Text || '',
                };
              }
            }
          }
        }
      } catch (e) {}
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error(`Timeout waiting for email to ${to} with subject containing "${subjectIncludes}"`);
  }

  async deleteAllEmails(to: string): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/api/v1/messages`, { method: 'DELETE' });
    } catch (e) {}
  }
}
