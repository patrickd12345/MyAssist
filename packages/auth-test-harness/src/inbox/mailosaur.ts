import MailosaurClient from 'mailosaur';
import type { TestEmail, TestInboxAdapter } from "./types";

export class MailosaurAdapter implements TestInboxAdapter {
  private client: MailosaurClient;
  private serverId: string;

  constructor() {
    const apiKey = process.env.MAILOSAUR_API_KEY;
    this.serverId = process.env.MAILOSAUR_SERVER_ID || '';

    if (!apiKey || !this.serverId) {
      throw new Error('MailosaurAdapter requires MAILOSAUR_API_KEY and MAILOSAUR_SERVER_ID env vars.');
    }

    this.client = new MailosaurClient(apiKey);
  }

  generateEmailAddress(): string {
    const rand = Math.random().toString(36).substring(7);
    return `test-${rand}@${this.serverId}.mailosaur.net`;
  }

  async waitForEmail(to: string, subjectIncludes: string, timeoutMs = 30000): Promise<TestEmail> {
    const criteria = { sentTo: to };
    const email = await this.client.messages.get(this.serverId, criteria, { timeout: timeoutMs });

    if (!email.subject?.includes(subjectIncludes)) {
        throw new Error(`Email subject did not match. Expected "${subjectIncludes}", got "${email.subject}"`);
    }

    return {
      id: email.id!,
      subject: email.subject!,
      from: email.from?.[0]?.email || '',
      to: email.to?.[0]?.email || '',
      html: email.html?.body || '',
      text: email.text?.body || '',
    };
  }

  async deleteAllEmails(to: string): Promise<void> {
    await this.client.messages.deleteAll(this.serverId);
  }
}
