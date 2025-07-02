import { Prisma } from '@prisma/client';
import { prisma } from '../client';

export class MessageAttachmentRepository {
  /**
   * Create a new message attachment
   */
  async create(attachmentData: {
    messageId: string;
    fileUploadId: string;
  }) {
    try {
      return await prisma.messageAttachment.create({
        data: attachmentData,
        include: {
          message: {
            select: {
              id: true,
              content: true,
              senderId: true,
              conversationId: true,
            },
          },
          fileUpload: {
            include: {
              uploadedBy: {
                select: {
                  id: true,
                  username: true,
                  firstName: true,
                  lastName: true,
                  avatar: true,
                },
              },
            },
          },
        },
      });
    } catch (error) {
      throw new Error(`Error creating message attachment: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Find attachment by ID
   */
  async findById(id: string) {
    try {
      return await prisma.messageAttachment.findUnique({
        where: { id },
        include: {
          message: {
            select: {
              id: true,
              content: true,
              senderId: true,
              conversationId: true,
            },
          },
          fileUpload: {
            include: {
              uploadedBy: {
                select: {
                  id: true,
                  username: true,
                  firstName: true,
                  lastName: true,
                  avatar: true,
                },
              },
            },
          },
        },
      });
    } catch (error) {
      throw new Error(`Error finding attachment by ID: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get all attachments for a message
   */
  async getMessageAttachments(messageId: string) {
    try {
      return await prisma.messageAttachment.findMany({
        where: { messageId },
        include: {
          fileUpload: {
            include: {
              uploadedBy: {
                select: {
                  id: true,
                  username: true,
                  firstName: true,
                  lastName: true,
                  avatar: true,
                },
              },
            },
          },
        },
        orderBy: { fileUpload: { createdAt: 'asc' } },
      });
    } catch (error) {
      throw new Error(`Error getting message attachments: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get attachments by file upload ID
   */
  async getAttachmentsByFileUpload(fileUploadId: string) {
    try {
      return await prisma.messageAttachment.findMany({
        where: { fileUploadId },
        include: {
          message: {
            select: {
              id: true,
              content: true,
              senderId: true,
              conversationId: true,
              createdAt: true,
            },
          },
        },
        orderBy: { message: { createdAt: 'desc' } },
      });
    } catch (error) {
      throw new Error(`Error getting attachments by file upload: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get attachments for a conversation
   */
  async getConversationAttachments(
    conversationId: string,
    options: {
      limit?: number;
      offset?: number;
      mimeType?: string;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ) {
    try {
      const { limit = 50, offset = 0, mimeType, startDate, endDate } = options;

      const whereClause: any = {
        message: {
          conversationId,
        },
      };

      if (mimeType) {
        whereClause.fileUpload = {
          mimeType: { contains: mimeType },
        };
      }

      if (startDate || endDate) {
        whereClause.message.createdAt = {};
        if (startDate) {
          whereClause.message.createdAt.gte = startDate;
        }
        if (endDate) {
          whereClause.message.createdAt.lte = endDate;
        }
      }

      return await prisma.messageAttachment.findMany({
        where: whereClause,
        include: {
          message: {
            select: {
              id: true,
              content: true,
              senderId: true,
              conversationId: true,
              createdAt: true,
            },
          },
          fileUpload: {
            include: {
              uploadedBy: {
                select: {
                  id: true,
                  username: true,
                  firstName: true,
                  lastName: true,
                  avatar: true,
                },
              },
            },
          },
        },
        orderBy: { message: { createdAt: 'desc' } },
        take: limit,
        skip: offset,
      });
    } catch (error) {
      throw new Error(`Error getting conversation attachments: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get attachments by user
   */
  async getUserAttachments(
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      mimeType?: string;
      conversationId?: string;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ) {
    try {
      const { limit = 50, offset = 0, mimeType, conversationId, startDate, endDate } = options;

      const whereClause: any = {
        fileUpload: {
          uploadedById: userId,
        },
      };

      if (mimeType) {
        whereClause.fileUpload.mimeType = { contains: mimeType };
      }

      if (conversationId) {
        whereClause.message = {
          conversationId,
        };
      }

      if (startDate || endDate) {
        if (!whereClause.message) {
          whereClause.message = {};
        }
        whereClause.message.createdAt = {};
        if (startDate) {
          whereClause.message.createdAt.gte = startDate;
        }
        if (endDate) {
          whereClause.message.createdAt.lte = endDate;
        }
      }

      return await prisma.messageAttachment.findMany({
        where: whereClause,
        include: {
          message: {
            select: {
              id: true,
              content: true,
              senderId: true,
              conversationId: true,
              createdAt: true,
            },
          },
          fileUpload: true,
        },
        orderBy: { message: { createdAt: 'desc' } },
        take: limit,
        skip: offset,
      });
    } catch (error) {
      throw new Error(`Error getting user attachments: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get attachments by type
   */
  async getAttachmentsByType(
    type: 'image' | 'video' | 'audio' | 'document' | 'other',
    options: {
      limit?: number;
      offset?: number;
      conversationId?: string;
      userId?: string;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ) {
    try {
      const { limit = 50, offset = 0, conversationId, userId, startDate, endDate } = options;

      const mimeTypePatterns = {
        image: 'image/',
        video: 'video/',
        audio: 'audio/',
        document: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument'],
        other: null,
      };

      const whereClause: any = {};

      if (type !== 'other') {
        const patterns = mimeTypePatterns[type];
        if (Array.isArray(patterns)) {
          whereClause.fileUpload = {
            OR: patterns.map(pattern => ({
              mimeType: { contains: pattern }
            }))
          };
        } else if (patterns) {
          whereClause.fileUpload = {
            mimeType: { contains: patterns }
          };
        }
      } else {
        // For 'other', exclude known types
        whereClause.fileUpload = {
          AND: [
            { mimeType: { not: { contains: 'image/' } } },
            { mimeType: { not: { contains: 'video/' } } },
            { mimeType: { not: { contains: 'audio/' } } },
            { mimeType: { not: { contains: 'application/pdf' } } },
            { mimeType: { not: { contains: 'application/msword' } } },
            { mimeType: { not: { contains: 'application/vnd.openxmlformats-officedocument' } } },
          ],
        };
      }

      if (conversationId) {
        whereClause.message = {
          conversationId,
        };
      }

      if (userId) {
        if (!whereClause.fileUpload) {
          whereClause.fileUpload = {};
        }
        whereClause.fileUpload.uploadedById = userId;
      }

      if (startDate || endDate) {
        if (!whereClause.message) {
          whereClause.message = {};
        }
        whereClause.message.createdAt = {};
        if (startDate) {
          whereClause.message.createdAt.gte = startDate;
        }
        if (endDate) {
          whereClause.message.createdAt.lte = endDate;
        }
      }

      return await prisma.messageAttachment.findMany({
        where: whereClause,
        include: {
          message: {
            select: {
              id: true,
              content: true,
              senderId: true,
              conversationId: true,
              createdAt: true,
            },
          },
          fileUpload: {
            include: {
              uploadedBy: {
                select: {
                  id: true,
                  username: true,
                  firstName: true,
                  lastName: true,
                  avatar: true,
                },
              },
            },
          },
        },
        orderBy: { message: { createdAt: 'desc' } },
        take: limit,
        skip: offset,
      });
    } catch (error) {
      throw new Error(`Error getting attachments by type: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete attachment
   */
  async delete(id: string): Promise<boolean> {
    try {
      await prisma.messageAttachment.delete({
        where: { id },
      });
      return true;
    } catch (error: any) {
      if (error?.code === 'P2025') {
        throw new Error('Attachment not found');
      }
      throw new Error(`Error deleting attachment: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete all attachments for a message
   */
  async deleteMessageAttachments(messageId: string): Promise<{ count: number }> {
    try {
      const result = await prisma.messageAttachment.deleteMany({
        where: { messageId },
      });
      return { count: result.count };
    } catch (error) {
      throw new Error(`Error deleting message attachments: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get attachment statistics
   */
  async getAttachmentStats(options: {
    conversationId?: string;
    userId?: string;
    startDate?: Date;
    endDate?: Date;
  } = {}): Promise<{
    totalAttachments: number;
    attachmentsByType: Record<string, number>;
    totalSize: number;
    averageSize: number;
  }> {
    try {
      const { conversationId, userId, startDate, endDate } = options;

      const whereClause: any = {};

      if (conversationId) {
        whereClause.message = {
          conversationId,
        };
      }

      if (userId) {
        whereClause.fileUpload = {
          uploadedById: userId,
        };
      }

      if (startDate || endDate) {
        if (!whereClause.message) {
          whereClause.message = {};
        }
        whereClause.message.createdAt = {};
        if (startDate) {
          whereClause.message.createdAt.gte = startDate;
        }
        if (endDate) {
          whereClause.message.createdAt.lte = endDate;
        }
      }

      // Get attachments with file upload data for manual calculation
      const attachmentsWithFiles = await prisma.messageAttachment.findMany({
        where: whereClause,
        include: {
          fileUpload: {
            select: {
              size: true,
              mimeType: true,
            },
          },
        },
      });

      // Calculate statistics manually
      const totalAttachments = attachmentsWithFiles.length;
      const totalSize = attachmentsWithFiles.reduce((sum, attachment) => 
        sum + (attachment.fileUpload?.size || 0), 0);
      const averageSize = totalAttachments > 0 ? totalSize / totalAttachments : 0;

      // Group by mime type
      const attachmentsByType = attachmentsWithFiles.reduce((acc: Record<string, number>, attachment) => {
        const type = attachment.fileUpload?.mimeType?.split('/')[0] || 'other';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {});

      return {
        totalAttachments,
        attachmentsByType,
        totalSize,
        averageSize,
      };
    } catch (error) {
      throw new Error(`Error getting attachment stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Bulk create attachments
   */
  async bulkCreate(attachments: Array<{
    messageId: string;
    fileUploadId: string;
  }>): Promise<{ count: number }> {
    try {
      const result = await prisma.messageAttachment.createMany({
        data: attachments,
        skipDuplicates: true,
      });
      return { count: result.count };
    } catch (error) {
      throw new Error(`Error bulk creating attachments: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if file is attached to any message
   */
  async isFileAttached(fileUploadId: string): Promise<boolean> {
    try {
      const attachment = await prisma.messageAttachment.findFirst({
        where: { fileUploadId },
      });
      return !!attachment;
    } catch (error) {
      return false;
    }
  }
}

// Export singleton instance
export const messageAttachmentRepository = new MessageAttachmentRepository();
