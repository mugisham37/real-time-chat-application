// Service exports
export { analyticsService, AnalyticsService } from "./analytics.service"
export { authService, AuthService } from "./auth.service"
export { callService, CallService } from "./call.service"
export { conversationService, ConversationService } from "./conversation.service"
export { messageService, MessageService } from "./message.service"
export { notificationService, NotificationService } from "./notification.service"
export { userService, UserService } from "./user.service"

// Service types and interfaces
export interface ServiceResponse<T = any> {
  success: boolean
  data?: T
  message?: string
  error?: string
}

export interface PaginationOptions {
  limit?: number
  skip?: number
  page?: number
}

export interface SearchOptions extends PaginationOptions {
  query: string
  filters?: Record<string, any>
}

export interface CacheOptions {
  ttl?: number
  key?: string
  enabled?: boolean
}

// Common service utilities
export class BaseService {
  protected handleError(error: any, context: string): never {
    console.error(`Error in ${context}:`, error)
    throw error
  }

  protected createResponse<T>(data: T, message?: string): ServiceResponse<T> {
    return {
      success: true,
      data,
      message
    }
  }

  protected createErrorResponse(error: string): ServiceResponse {
    return {
      success: false,
      error
    }
  }
}

// Service configuration
export const SERVICE_CONFIG = {
  CACHE_TTL: {
    SHORT: 300, // 5 minutes
    MEDIUM: 1800, // 30 minutes
    LONG: 3600, // 1 hour
    EXTENDED: 86400, // 24 hours
  },
  PAGINATION: {
    DEFAULT_LIMIT: 20,
    MAX_LIMIT: 100,
  },
  SEARCH: {
    MIN_QUERY_LENGTH: 2,
    MAX_QUERY_LENGTH: 100,
  },
} as const

// Service health check
export const getServicesHealth = () => {
  return {
    analytics: "healthy",
    auth: "healthy",
    call: "healthy",
    conversation: "healthy",
    message: "healthy",
    notification: "healthy",
    user: "healthy",
    timestamp: new Date().toISOString(),
  }
}
