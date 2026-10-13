'use client';

/**
 * Which conversation the agent has open right now (null when none). The global
 * new-message notifier reads it so it doesn't ping for the chat on screen.
 */
let activeConversationId: string | null = null;

export function setActiveConversation(id: string | null) {
    activeConversationId = id;
}

export function getActiveConversation(): string | null {
    return activeConversationId;
}

/** True when the agent is actually looking at this chat (open and the tab visible). */
export function isViewingConversation(id: string): boolean {
    return activeConversationId === id && typeof document !== 'undefined' && document.visibilityState === 'visible';
}

/** Event the notifier dispatches to open a chat without a full navigation. */
export const OPEN_CONVERSATION_EVENT = 'aikon:open-conversation';
export type OpenConversationDetail = { conversationId?: string; contactId?: string };
