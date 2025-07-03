import { validateNotificationData, validateNotificationType, sanitizeNotificationContent } from './typeGuards';

/**
 * Notification Builder - Provides a clean interface for creating different types of notifications
 * with proper validation and type safety
 */
export class NotificationBuilder {
  /**
   * Create a missed call notification
   */
  static createMissedCallNotification(
    callerId: string,
    recipientId: string,
    callType: "audio" | "video",
    callerName: string,
    callId: string
  ) {
    const content = `You missed a ${callType} call from ${callerName}`;
    
    return validateNotificationData({
      recipient: recipientId,
      sender: callerId,
      type: "missed_call",
      content: sanitizeNotificationContent(content),
      relatedId: callId,
      relatedType: "Call",
      metadata: {
        callType,
        callerName
      }
    });
  }

  /**
   * Create an incoming call notification
   */
  static createIncomingCallNotification(
    callerId: string,
    recipientId: string,
    callType: "audio" | "video",
    callerName: string,
    callId: string
  ) {
    const content = `Incoming ${callType} call from ${callerName}`;
    
    return validateNotificationData({
      recipient: recipientId,
      sender: callerId,
      type: "incoming_call",
      content: sanitizeNotificationContent(content),
      relatedId: callId,
      relatedType: "Call",
      metadata: {
        callType,
        callerName
      }
    });
  }

  /**
   * Create a call ended notification
   */
  static createCallEndedNotification(
    callerId: string,
    recipientId: string,
    callType: "audio" | "video",
    callerName: string,
    callId: string,
    duration?: number
  ) {
    const durationText = duration ? ` (${Math.floor(duration / 1000)}s)` : '';
    const content = `${callType} call with ${callerName} ended${durationText}`;
    
    return validateNotificationData({
      recipient: recipientId,
      sender: callerId,
      type: "call_ended",
      content: sanitizeNotificationContent(content),
      relatedId: callId,
      relatedType: "Call",
      metadata: {
        callType,
        callerName,
        duration
      }
    });
  }

  /**
   * Create a new message notification
   */
  static createMessageNotification(
    senderId: string,
    recipientId: string,
    senderName: string,
    messageContent: string,
    conversationId: string,
    conversationType: string,
    messageId?: string
  ) {
    // Truncate message content for notification
    const truncatedContent = messageContent.length > 50 
      ? `${messageContent.substring(0, 50)}...` 
      : messageContent;
    
    const content = `${senderName}: ${truncatedContent}`;
    
    return validateNotificationData({
      recipient: recipientId,
      sender: senderId,
      type: "new_message",
      content: sanitizeNotificationContent(content),
      relatedId: conversationId,
      relatedType: conversationType === "GROUP" ? "Group" : "Conversation",
      metadata: {
        messageId,
        conversationType,
        senderName,
        originalMessageContent: messageContent
      }
    });
  }

  /**
   * Create a mention notification
   */
  static createMentionNotification(
    senderId: string,
    mentionedUserId: string,
    senderName: string,
    messageId: string,
    conversationId: string,
    conversationType: string
  ) {
    const content = `${senderName} mentioned you in a message`;
    
    return validateNotificationData({
      recipient: mentionedUserId,
      sender: senderId,
      type: "mention",
      content: sanitizeNotificationContent(content),
      relatedId: messageId,
      relatedType: "Message",
      metadata: {
        conversationId,
        conversationType,
        senderName
      }
    });
  }

  /**
   * Create a message reaction notification
   */
  static createReactionNotification(
    reactorId: string,
    messageOwnerId: string,
    reactorName: string,
    reactionType: string,
    messageId: string
  ) {
    const content = `${reactorName} reacted with ${reactionType} to your message`;
    
    return validateNotificationData({
      recipient: messageOwnerId,
      sender: reactorId,
      type: "message_reaction",
      content: sanitizeNotificationContent(content),
      relatedId: messageId,
      relatedType: "Message",
      metadata: {
        reactionType,
        reactorName
      }
    });
  }

  /**
   * Create a group invitation notification
   */
  static createGroupInviteNotification(
    inviterId: string,
    inviteeId: string,
    inviterName: string,
    groupId: string,
    groupName: string
  ) {
    const content = `${inviterName} invited you to join the group "${groupName}"`;
    
    return validateNotificationData({
      recipient: inviteeId,
      sender: inviterId,
      type: "group_invite",
      content: sanitizeNotificationContent(content),
      relatedId: groupId,
      relatedType: "Group",
      metadata: {
        groupName,
        inviterName
      }
    });
  }

  /**
   * Create a system notification
   */
  static createSystemNotification(
    recipientId: string,
    content: string,
    relatedId?: string,
    relatedType?: string,
    metadata?: Record<string, any>
  ) {
    return validateNotificationData({
      recipient: recipientId,
      type: "system",
      content: sanitizeNotificationContent(content),
      relatedId,
      relatedType,
      metadata
    });
  }

  /**
   * Create a custom notification with full validation
   */
  static createCustomNotification(data: {
    recipient: string;
    sender?: string;
    type: string;
    content: string;
    relatedId?: string;
    relatedType?: string;
    metadata?: Record<string, any>;
  }) {
    // Validate the notification type
    const validatedType = validateNotificationType(data.type);
    
    return validateNotificationData({
      recipient: data.recipient,
      sender: data.sender,
      type: validatedType,
      content: sanitizeNotificationContent(data.content),
      relatedId: data.relatedId,
      relatedType: data.relatedType,
      metadata: data.metadata
    });
  }
}
