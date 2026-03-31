declare module "@bookiji-inc/ai-runtime" {
  export const chatSession: any;
  export const executeChat: any;
  export const executeEmbedding: any;
  // Fallback
  export const invokeOllamaModel: any;
  export const resolveOllamaModel: any;
  export const performOllamaHealthCheck: any;
}

declare module "@bookiji-inc/error-contract" {
  export const buildError: any;
  export const getOrCreateRequestId: any;
  export const toHttpError: any;
  export interface CanonicalError {}
  export type RequestIdSource = any;
  export interface ToHttpErrorOptions {}
}

declare module "@bookiji-inc/observability" {
  export const logError: any;
  export const logInfo: any;
  export const logWarn: any;
  export const logDebug: any;
  export const traceAsync: any;
  export const emitAiLog: any;
  export const emitStructuredLog: any;
  export const getRequestId: any;
  export interface AiLogMetadata {}
}
