export type ChatPayload =
  | {kind: 'text'; text: string}
  | {
      kind: 'attachment';
      attachmentType: 'image' | 'video' | 'document';
      name: string;
      uri?: string;
      sizeBytes?: number;
      mimeType?: string;
    }
  | {kind: 'reaction'; messageId: string; emoji: string}
  | {kind: 'poll'; pollId: string; question: string; options: Array<{id: string; text: string}>}
  | {kind: 'poll_vote'; pollId: string; optionId: string};

export interface MessageEnvelope {
  version: 1;
  payload: ChatPayload;
}

export function encodeMessagePayload(payload: ChatPayload): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({version: 1, payload} satisfies MessageEnvelope));
}

export function decodeMessagePayload(bytes: Uint8Array): ChatPayload {
  const text = new TextDecoder().decode(bytes);
  try {
    const parsed = JSON.parse(text) as Partial<MessageEnvelope>;
    if (parsed.version === 1 && parsed.payload?.kind) {
      return parsed.payload;
    }
  } catch {
    // Backward compatibility for old plaintext messages.
  }
  return {kind: 'text', text};
}

export function payloadPreview(payload: ChatPayload): string {
  switch (payload.kind) {
    case 'text':
      return payload.text;
    case 'attachment':
      return `[${payload.attachmentType}] ${payload.name}`;
    case 'reaction':
      return `${payload.emoji} reacted to ${payload.messageId.slice(0, 8)}`;
    case 'poll':
      return `[poll] ${payload.question}`;
    case 'poll_vote':
      return `[vote] ${payload.optionId}`;
  }
}
