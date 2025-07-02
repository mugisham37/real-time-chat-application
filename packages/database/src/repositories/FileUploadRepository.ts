import { Prisma } from '@prisma/client';
import { prisma } from '../client';

export class FileUploadRepository {
  /**
   * Create a new file upload record
   */
  async create(fileData: {
    filename: string;
    originalName: string;
    mimeType: string;
    size: number;
    path: string;
    url?: string;
    uploadedById: string;
  }) {
    try {
      return await prisma.fileUpload.create({
        data: fileData,
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
          attachments: {
            include: {
              message: {
                select: {
                  id: true,
                  content: true,
                  createdAt: true,
                },
              },
            },
          },
        },
      });
    } catch (error) {
      throw new Error(`Error creating file upload: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Find file upload by ID
   */
  async findById(id: string) {
    try {
      return await prisma.fileUpload.findUnique({
        where: { id },
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
          attachments: {
            include: {
              message: {
                select: {
                  id: true,
                  content: true,
                  createdAt: true,
                },
              },
            },
          },
        },
      });
    } catch (error) {
      throw new Error(`Error finding file upload by ID: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Find file upload by filename
   */
  async findByFilename(filename: string) {
    try {
      return await prisma.fileUpload.findUnique({
        where: { filename },
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
          attachments: {
            include: {
              message: {
                select: {
                  id: true,
                  content: true,
                  createdAt: true,
                },
              },
            },
          },
        },
      });
    } catch (error) {
      throw new Error(`Error finding file upload by filename: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get files uploaded by a user
   */
  async getFilesByUser(
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      mimeType?: string;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ) {
    try {
      const { limit = 20, offset = 0, mimeType, startDate, endDate } = options;

      const whereClause: any = { uploadedById: userId };

      if (mimeType) {
        whereClause.mimeType = { contains: mimeType };
      }

      if (startDate || endDate) {
        whereClause.createdAt = {};
        if (startDate) {
          whereClause.createdAt.gte = startDate;
        }
        if (endDate) {
          whereClause.createdAt.lte = endDate;
        }
      }

      return await prisma.fileUpload.findMany({
        where: whereClause,
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
          attachments: {
            include: {
              message: {
                select: {
                  id: true,
                  content: true,
                  createdAt: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      });
    } catch (error) {
      throw new Error(`Error getting files by user: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get files by message ID
   */
  async getFilesByMessage(messageId: string) {
    try {
      return await prisma.fileUpload.findMany({
        where: {
          attachments: {
            some: {
              messageId,
            },
          },
        },
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
          attachments: {
            where: {
              messageId,
            },
            include: {
              message: {
                select: {
                  id: true,
                  content: true,
                  createdAt: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      });
    } catch (error) {
      throw new Error(`Error getting files by message: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get files by type (images, videos, documents, etc.)
   */
  async getFilesByType(
    type: 'image' | 'video' | 'audio' | 'document' | 'other',
    options: {
      limit?: number;
      offset?: number;
      userId?: string;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ) {
    try {
      const { limit = 20, offset = 0, userId, startDate, endDate } = options;

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
          whereClause.OR = patterns.map(pattern => ({
            mimeType: { contains: pattern }
          }));
        } else if (patterns) {
          whereClause.mimeType = { contains: patterns };
        }
      } else {
        // For 'other', exclude known types
        whereClause.AND = [
          { mimeType: { not: { contains: 'image/' } } },
          { mimeType: { not: { contains: 'video/' } } },
          { mimeType: { not: { contains: 'audio/' } } },
          { mimeType: { not: { contains: 'application/pdf' } } },
          { mimeType: { not: { contains: 'application/msword' } } },
          { mimeType: { not: { contains: 'application/vnd.openxmlformats-officedocument' } } },
        ];
      }

      if (userId) {
        whereClause.uploadedById = userId;
      }

      if (startDate || endDate) {
        whereClause.createdAt = {};
        if (startDate) {
          whereClause.createdAt.gte = startDate;
        }
        if (endDate) {
          whereClause.createdAt.lte = endDate;
        }
      }

      return await prisma.fileUpload.findMany({
        where: whereClause,
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
          attachments: {
            include: {
              message: {
                select: {
                  id: true,
                  content: true,
                  createdAt: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      });
    } catch (error) {
      throw new Error(`Error getting files by type: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update file upload metadata
   */
  async update(id: string, updateData: {
    originalName?: string;
    mimeType?: string;
    size?: number;
    url?: string;
  }) {
    try {
      return await prisma.fileUpload.update({
        where: { id },
        data: updateData,
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
          attachments: {
            include: {
              message: {
                select: {
                  id: true,
                  content: true,
                  createdAt: true,
                },
              },
            },
          },
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2025') {
        throw new Error('File upload not found');
      }
      throw new Error(`Error updating file upload: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete file upload record
   */
  async delete(id: string): Promise<boolean> {
    try {
      await prisma.fileUpload.delete({
        where: { id },
      });

      return true;
    } catch (error: any) {
      if (error?.code === 'P2025') {
        throw new Error('File upload not found');
      }
      throw new Error(`Error deleting file upload: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get file upload statistics
   */
  async getUploadStats(options: {
    userId?: string;
    startDate?: Date;
    endDate?: Date;
  } = {}): Promise<{
    totalFiles: number;
    totalSize: number;
    filesByType: Record<string, number>;
    averageFileSize: number;
  }> {
    try {
      const { userId, startDate, endDate } = options;

      const whereClause: any = {};

      if (userId) {
        whereClause.uploadedById = userId;
      }

      if (startDate || endDate) {
        whereClause.createdAt = {};
        if (startDate) {
          whereClause.createdAt.gte = startDate;
        }
        if (endDate) {
          whereClause.createdAt.lte = endDate;
        }
      }

      const [totalFiles, totalSizeResult, filesByType] = await Promise.all([
        prisma.fileUpload.count({ where: whereClause }),
        prisma.fileUpload.aggregate({
          where: whereClause,
          _sum: { size: true },
          _avg: { size: true },
        }),
        prisma.fileUpload.groupBy({
          by: ['mimeType'],
          where: whereClause,
          _count: true,
        }),
      ]);

      const typeStats = filesByType.reduce((acc: Record<string, number>, item: any) => {
        const type = item.mimeType.split('/')[0] || 'other';
        acc[type] = (acc[type] || 0) + item._count;
        return acc;
      }, {});

      return {
        totalFiles,
        totalSize: totalSizeResult._sum.size || 0,
        filesByType: typeStats,
        averageFileSize: totalSizeResult._avg.size || 0,
      };
    } catch (error) {
      throw new Error(`Error getting upload stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Clean up orphaned files (files not associated with any message)
   */
  async cleanupOrphanedFiles(): Promise<{ count: number }> {
    try {
      const result = await prisma.fileUpload.deleteMany({
        where: {
          attachments: {
            none: {},
          },
          createdAt: {
            lt: new Date(Date.now() - 24 * 60 * 60 * 1000), // Older than 24 hours
          },
        },
      });

      return { count: result.count };
    } catch (error) {
      throw new Error(`Error cleaning up orphaned files: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Clean up old files (older than specified days)
   */
  async cleanupOldFiles(daysOld = 365): Promise<{ count: number }> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const result = await prisma.fileUpload.deleteMany({
        where: {
          createdAt: {
            lt: cutoffDate,
          },
        },
      });

      return { count: result.count };
    } catch (error) {
      throw new Error(`Error cleaning up old files: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Search files by name or content
   */
  async searchFiles(
    query: string,
    options: {
      limit?: number;
      offset?: number;
      userId?: string;
      mimeType?: string;
    } = {}
  ) {
    try {
      const { limit = 20, offset = 0, userId, mimeType } = options;

      const whereClause: any = {
        OR: [
          { originalName: { contains: query, mode: Prisma.QueryMode.insensitive } },
          { filename: { contains: query, mode: Prisma.QueryMode.insensitive } },
        ],
      };

      if (userId) {
        whereClause.uploadedById = userId;
      }

      if (mimeType) {
        whereClause.mimeType = { contains: mimeType };
      }

      return await prisma.fileUpload.findMany({
        where: whereClause,
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
          attachments: {
            include: {
              message: {
                select: {
                  id: true,
                  content: true,
                  createdAt: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      });
    } catch (error) {
      throw new Error(`Error searching files: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Export singleton instance
export const fileUploadRepository = new FileUploadRepository();
