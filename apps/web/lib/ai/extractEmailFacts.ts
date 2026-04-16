import { z } from "zod";

export const EmailObligationSchema = z.object({
  id: z.string().describe("A unique identifier for this obligation within the current extraction payload"),
  title: z.string().describe("The concise title of the obligation/task"),
  dueDate: z.string().optional().describe("ISO 8601 date string if a deadline is mentioned, otherwise omit"),
  status: z.enum(["open", "done"]).optional().describe("Whether the text indicates this is a pending task or already completed"),
  confidence: z.number().min(0).max(1).describe("Confidence score between 0.0 and 1.0"),
  evidence: z.string().describe("Exact snippet of text proving this obligation exists"),
});

export const EmailExtractionPayloadSchema = z.object({
  obligations: z.array(EmailObligationSchema),
});

export type ExtractedObligation = z.infer<typeof EmailObligationSchema>;

export async function extractEmailFacts(
  subject: string,
  body: string,
  gatewayCall: (prompt: string, schema: unknown) => Promise<unknown>
): Promise<ExtractedObligation[]> {
  const prompt = `
Extract action items, obligations, and deadlines from the following email.
Focus on concrete tasks. Do not invent tasks. Provide exact snippets as evidence.

Subject: ${subject}
Body:
${body}
`;

  try {
    const response = await gatewayCall(prompt, EmailExtractionPayloadSchema);
    const parsed = EmailExtractionPayloadSchema.parse(response);

    // Filter out low confidence obligations and those without evidence
    return parsed.obligations.filter(
      (ob) => ob.confidence >= 0.6 && ob.evidence.trim().length > 0
    );
  } catch (error) {
    console.error("Failed to extract email facts:", error);
    return [];
  }
}
