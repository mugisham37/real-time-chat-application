import type { Server as SocketIOServer, Socket } from "socket.io"
import { logger } from "../../utils/logger"
import { validateSocketEvent } from "../utils/validateSocketEvent"
import { callOfferSchema } from "../validators/callOfferSchema"
import { callAnswerSchema } from "../validators/callAnswerSchema"
import { callIceCandidateSchema } from "../validators/callIceCandidateSchema"
import { ChatMetrics } from "../../utils/metrics"
import { getRedisManager } from "../../config/redis"

export const setupCallHandlers = (io: SocketIOServer, socket: Socket & { data: { user?: any } }) => {
  const userId = socket.data.user?._id

  // Handle call offer
  socket.on("call:offer", async (data, callback) => {
    try {
      // Validate event data
      const validationResult = validateSocketEvent(callOfferSchema, data)
      if (!validationResult.success) {
        return callback({
          success: false,
          message: "Validation error",
          errors: validationResult.errors,
        })
      }

      const { recipientId, sdp, callType } = data

      // Check if recipient is online
      const recipientSockets = await io.in(`user:${recipientId}`).fetchSockets()
      if (recipientSockets.length === 0) {
        return callback({
          success: false,
          message: "Recipient is offline",
        })
      }

      // Generate a unique call ID
      const callId = `${userId}_${recipientId}_${Date.now()}`

      // Store call metadata in Redis (expires after 1 hour)
      const redisManager = getRedisManager()
      await redisManager.setJSON(
        `call:${callId}`,
        {
          callId,
          caller: userId,
          recipient: recipientId,
          callType,
          startTime: Date.now(),
          status: "ringing",
        },
        3600
      )

      // Send offer to recipient
      io.to(`user:${recipientId}`).emit("call:incoming", {
        callId,
        callerId: userId,
        callerName: socket.data.user.username,
        callerAvatar: socket.data.user.avatar,
        sdp,
        callType,
      })

      // Track call metrics
      ChatMetrics.incrementCallsInitiated(callType)

      callback({
        success: true,
        data: {
          callId,
        },
      })
    } catch (error) {
      logger.error("Error in call:offer handler:", error)
      callback({
        success: false,
        message: "Failed to initiate call",
      })
    }
  })

  // Handle call answer
  socket.on("call:answer", async (data, callback) => {
    try {
      // Validate event data
      const validationResult = validateSocketEvent(callAnswerSchema, data)
      if (!validationResult.success) {
        return callback({
          success: false,
          message: "Validation error",
          errors: validationResult.errors,
        })
      }

      const { callId, sdp, accepted } = data

      // Get call data from Redis
      const redisManager = getRedisManager()
      const callData = await redisManager.getJSON(`call:${callId}`)
      if (!callData) {
        return callback({
          success: false,
          message: "Call not found or expired",
        })
      }

      // Verify the recipient is the current user
      if (callData.recipient !== userId.toString()) {
        return callback({
          success: false,
          message: "Unauthorized to answer this call",
        })
      }

      // Update call status in Redis
      await redisManager.setJSON(
        `call:${callId}`,
        {
          ...callData,
          status: accepted ? "connected" : "rejected",
          answerTime: Date.now(),
        },
        3600
      )

      // Send answer to caller
      io.to(`user:${callData.caller}`).emit("call:answered", {
        callId,
        accepted,
        sdp: accepted ? sdp : undefined,
      })

      // Track call metrics
      if (accepted) {
        ChatMetrics.incrementCallsConnected(callData.callType)
      } else {
        ChatMetrics.incrementCallsRejected(callData.callType)
      }

      callback({
        success: true,
      })
    } catch (error) {
      logger.error("Error in call:answer handler:", error)
      callback({
        success: false,
        message: "Failed to answer call",
      })
    }
  })

  // Handle ICE candidate
  socket.on("call:ice_candidate", async (data, callback) => {
    try {
      // Validate event data
      const validationResult = validateSocketEvent(callIceCandidateSchema, data)
      if (!validationResult.success) {
        return callback({
          success: false,
          message: "Validation error",
          errors: validationResult.errors,
        })
      }

      const { callId, candidate } = data

      // Get call data from Redis
      const redisManager = getRedisManager()
      const callData = await redisManager.getJSON(`call:${callId}`)
      if (!callData) {
        return callback({
          success: false,
          message: "Call not found or expired",
        })
      }

      // Determine the recipient of the ICE candidate
      const recipientId = callData.caller === userId.toString() ? callData.recipient : callData.caller

      // Send ICE candidate to the other peer
      io.to(`user:${recipientId}`).emit("call:ice_candidate", {
        callId,
        candidate,
      })

      callback({
        success: true,
      })
    } catch (error) {
      logger.error("Error in call:ice_candidate handler:", error)
      callback({
        success: false,
        message: "Failed to send ICE candidate",
      })
    }
  })

  // Handle call end
  socket.on("call:end", async (data, callback) => {
    try {
      const { callId } = data

      if (!callId) {
        return callback({
          success: false,
          message: "Call ID is required",
        })
      }

      // Get call data from Redis
      const redisManager = getRedisManager()
      const callData = await redisManager.getJSON(`call:${callId}`)
      if (!callData) {
        return callback({
          success: false,
          message: "Call not found or expired",
        })
      }

      // Verify the user is part of the call
      if (callData.caller !== userId.toString() && callData.recipient !== userId.toString()) {
        return callback({
          success: false,
          message: "Unauthorized to end this call",
        })
      }

      // Update call status in Redis
      await redisManager.setJSON(
        `call:${callId}`,
        {
          ...callData,
          status: "ended",
          endTime: Date.now(),
          duration: callData.status === "connected" ? Date.now() - callData.answerTime : 0,
        },
        3600
      )

      // Determine the recipient of the end call event
      const recipientId = callData.caller === userId.toString() ? callData.recipient : callData.caller

      // Send end call event to the other peer
      io.to(`user:${recipientId}`).emit("call:ended", {
        callId,
      })

      // Track call metrics
      ChatMetrics.incrementCallsEnded(callData.callType)
      if (callData.status === "connected") {
        ChatMetrics.recordCallDuration(callData.callType, Date.now() - callData.answerTime)
      }

      callback({
        success: true,
      })
    } catch (error) {
      logger.error("Error in call:end handler:", error)
      callback({
        success: false,
        message: "Failed to end call",
      })
    }
  })
}
