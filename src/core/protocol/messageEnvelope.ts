export type ChatPayload =
  | {kind: 'text'; text: string}
  | {
      kind: 'attachment';
      attachmentType: 'image' | 'video' | 'document';
      name: string;
      uri?: string;
      dataBase64?: string;
      sizeBytes?: number;
      mimeType?: string;
    }
  | {kind: 'reaction'; messageId: string; emoji: string}
  | {kind: 'poll'; pollId: string; question: string; options: Array<{id: string; text: string}>}
  | {kind: 'poll_vote'; pollId: string; optionId: string}
  /** Gossip-only: announces display name + DiceBear style to the mesh. */
  | {kind: 'peer_profile'; displayName: string; avatarStyle: string};

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
      const p = parsed.payload as ChatPayload;
      if (p.kind === 'peer_profile') {
        const displayName =
          typeof (p as {displayName?: unknown}).displayName === 'string'
            ? (p as {displayName: string}).displayName
            : '';
        const avatarStyle =
          typeof (p as {avatarStyle?: unknown}).avatarStyle === 'string'
            ? (p as {avatarStyle: string}).avatarStyle
            : 'bottts';
        return {kind: 'peer_profile', displayName, avatarStyle};
      }
      return p;
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
    case 'peer_profile':
      return payload.displayName;
  }
}
