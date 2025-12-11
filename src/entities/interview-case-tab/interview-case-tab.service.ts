import { PrismaClient } from '@prisma/client'
import { CreateInterviewCaseTabInput, UpdateInterviewCaseTabInput, InterviewCaseTabType } from './interview-case-tab.schema'

export class InterviewCaseTabService {
  constructor(private prisma: PrismaClient) {}

  async create(data: CreateInterviewCaseTabInput) {
    // Verify the interview case exists
    const interviewCase = await this.prisma.interviewCase.findUnique({
      where: { id: data.interviewCaseId },
      include: {
        interviewCourse: {
          include: { interview: true }
        }
      }
    })

    if (!interviewCase) {
      throw new Error('Interview case not found')
    }

    // Check if this case already has a tab of this type
    const existingTab = await this.prisma.interviewCaseTab.findUnique({
      where: {
        interviewCaseId_tabType: {
          interviewCaseId: data.interviewCaseId,
          tabType: data.tabType
        }
      }
    })

    if (existingTab) {
      throw new Error(`Case already has a ${data.tabType} tab`)
    }

    return await this.prisma.interviewCaseTab.create({
      data: {
        interviewCaseId: data.interviewCaseId,
        tabType: data.tabType,
        content: data.content
      },
      include: {
        interviewCase: {
          include: {
            interviewCourse: {
              include: {
                interview: {
                  select: {
                    id: true,
                    title: true,
                    slug: true
                  }
                }
              }
            }
          }
        }
      }
    })
  }

  async findAll() {
    return await this.prisma.interviewCaseTab.findMany({
      include: {
        interviewCase: {
          include: {
            interviewCourse: {
              include: {
                interview: {
                  select: {
                    id: true,
                    title: true,
                    slug: true
                  }
                }
              }
            }
          }
        }
      },
      orderBy: [
        { interviewCase: { title: 'asc' } },
        { tabType: 'asc' }
      ]
    })
  }

  async findById(id: string) {
    const interviewCaseTab = await this.prisma.interviewCaseTab.findUnique({
      where: { id },
      include: {
        interviewCase: {
          include: {
            interviewCourse: {
              include: {
                interview: {
                  select: {
                    id: true,
                    title: true,
                    slug: true
                  }
                }
              }
            }
          }
        }
      }
    })

    if (!interviewCaseTab) {
      throw new Error('Interview case tab not found')
    }

    return interviewCaseTab
  }

  async findByInterviewCase(interviewCaseId: string) {
    // Verify interview case exists
    const interviewCase = await this.prisma.interviewCase.findUnique({
      where: { id: interviewCaseId }
    })

    if (!interviewCase) {
      throw new Error('Interview case not found')
    }

    return await this.prisma.interviewCaseTab.findMany({
      where: { interviewCaseId },
      include: {
        interviewCase: {
          include: {
            interviewCourse: {
              include: {
                interview: {
                  select: {
                    id: true,
                    title: true,
                    slug: true
                  }
                }
              }
            }
          }
        }
      },
      orderBy: { tabType: 'asc' }
    })
  }

  async findByTabType(interviewCaseId: string, tabType: InterviewCaseTabType) {
    const interviewCaseTab = await this.prisma.interviewCaseTab.findUnique({
      where: {
        interviewCaseId_tabType: {
          interviewCaseId,
          tabType
        }
      },
      include: {
        interviewCase: {
          include: {
            interviewCourse: {
              include: {
                interview: {
                  select: {
                    id: true,
                    title: true,
                    slug: true
                  }
                }
              }
            }
          }
        }
      }
    })

    if (!interviewCaseTab) {
      throw new Error(`${tabType} tab not found for this case`)
    }

    return interviewCaseTab
  }

  async update(id: string, data: UpdateInterviewCaseTabInput) {
    // Check if interview case tab exists
    await this.findById(id)

    return await this.prisma.interviewCaseTab.update({
      where: { id },
      data,
      include: {
        interviewCase: {
          include: {
            interviewCourse: {
              include: {
                interview: {
                  select: {
                    id: true,
                    title: true,
                    slug: true
                  }
                }
              }
            }
          }
        }
      }
    })
  }

  async delete(id: string) {
    // Check if interview case tab exists
    await this.findById(id)

    return await this.prisma.interviewCaseTab.delete({
      where: { id }
    })
  }

  // BUSINESS LOGIC METHODS

  async createAllTabsForCase(interviewCaseId: string) {
    // Verify interview case exists
    const interviewCase = await this.prisma.interviewCase.findUnique({
      where: { id: interviewCaseId }
    })

    if (!interviewCase) {
      throw new Error('Interview case not found')
    }

    // Check if any tabs already exist
    const existingTabs = await this.prisma.interviewCaseTab.findMany({
      where: { interviewCaseId }
    })

    if (existingTabs.length > 0) {
      throw new Error('Some tabs already exist for this case')
    }

    // Create all 3 tabs with empty content arrays - ADJUSTED
    const tabTypes: InterviewCaseTabType[] = ['DOCTORS_NOTE', 'PATIENT_SCRIPT', 'MEDICAL_NOTES']

    const tabs = await Promise.all(
      tabTypes.map((tabType: InterviewCaseTabType) =>
        this.prisma.interviewCaseTab.create({
          data: {
            interviewCaseId,
            tabType,
            content: [] // Start with empty array
          },
          include: {
            interviewCase: {
              include: {
                interviewCourse: {
                  include: {
                    interview: {
                      select: {
                        id: true,
                        title: true,
                        slug: true
                      }
                    }
                  }
                }
              }
            }
          }
        })
      )
    )

    return tabs
  }

  async getCaseTabStats(interviewCaseId: string) {
    const tabs = await this.prisma.interviewCaseTab.findMany({
      where: { interviewCaseId },
      select: {
        tabType: true,
        content: true,
        updatedAt: true
      }
    })

    return {
      interviewCaseId,
      totalTabs: tabs.length,
      completedTabs: tabs.filter((tab: { content: string[] }) => tab.content && tab.content.length > 0).length,
      emptyTabs: tabs.filter((tab: { content: string[] }) => !tab.content || tab.content.length === 0).length,
      tabDetails: tabs.map((tab: { tabType: any; content: string[]; updatedAt: Date }) => ({
        tabType: tab.tabType,
        hasContent: !!(tab.content && tab.content.length > 0),
        contentItems: tab.content?.length || 0,
        totalContentLength: tab.content?.reduce((sum, item) => sum + item.length, 0) || 0,
        lastUpdated: tab.updatedAt
      }))
    }
  }

  async getCourseTabsOverview(interviewCourseId: string) {
    // Get all cases for this interview course
    const interviewCases = await this.prisma.interviewCase.findMany({
      where: { interviewCourseId },
      include: {
        interviewCaseTabs: {
          select: {
            tabType: true,
            content: true
          }
        }
      }
    })

    const overview = interviewCases.map((interviewCase: {
      id: string;
      title: string;
      interviewCaseTabs: Array<{ tabType: any; content: string[] }>
    }) => ({
      caseId: interviewCase.id,
      caseTitle: interviewCase.title,
      totalTabs: interviewCase.interviewCaseTabs.length,
      completedTabs: interviewCase.interviewCaseTabs.filter((tab: { content: string[] }) => tab.content && tab.content.length > 0).length,
      // ADJUSTED: Completion percentage based on 3 tabs
      completionPercentage: interviewCase.interviewCaseTabs.length > 0
        ? Math.round((interviewCase.interviewCaseTabs.filter((tab: { content: string[] }) => tab.content && tab.content.length > 0).length / 3) * 100)
        : 0
    }))

    return {
      interviewCourseId,
      totalCases: interviewCases.length,
      // ADJUSTED: Check for 3 tabs
      casesWithAllTabs: overview.filter((item: { totalTabs: number }) => item.totalTabs === 3).length,
      casesWithCompletedContent: overview.filter((item: { completedTabs: number }) => item.completedTabs === 3).length,
      averageCompletion: overview.length > 0
        ? Math.round(overview.reduce((sum: number, item: { completionPercentage: number }) => sum + item.completionPercentage, 0) / overview.length)
        : 0,
      caseDetails: overview
    }
  }

  async bulkUpdateTabContent(interviewCaseId: string, tabUpdates: { tabType: InterviewCaseTabType; content: string[] }[]) {
    // Verify interview case exists
    const interviewCase = await this.prisma.interviewCase.findUnique({
      where: { id: interviewCaseId }
    })

    if (!interviewCase) {
      throw new Error('Interview case not found')
    }

    // Update all tabs in a transaction
    const updatedTabs = await this.prisma.$transaction(
      tabUpdates.map((update: { tabType: InterviewCaseTabType; content: string[] }) =>
        this.prisma.interviewCaseTab.upsert({
          where: {
            interviewCaseId_tabType: {
              interviewCaseId,
              tabType: update.tabType
            }
          },
          update: {
            content: update.content
          },
          create: {
            interviewCaseId,
            tabType: update.tabType,
            content: update.content
          },
          include: {
            interviewCase: {
              include: {
                interviewCourse: {
                  include: {
                    interview: {
                      select: {
                        id: true,
                        title: true,
                        slug: true
                      }
                    }
                  }
                }
              }
            }
          }
        })
      )
    )

    return updatedTabs
  }

  // Helper method to add a single item to content array
  async addContentItem(id: string, contentItem: string) {
    const interviewCaseTab = await this.findById(id)

    return await this.prisma.interviewCaseTab.update({
      where: { id },
      data: {
        content: [...(interviewCaseTab.content || []), contentItem]
      },
      include: {
        interviewCase: {
          include: {
            interviewCourse: {
              include: {
                interview: {
                  select: {
                    id: true,
                    title: true,
                    slug: true
                  }
                }
              }
            }
          }
        }
      }
    })
  }

  // Helper method to remove a content item by index
  async removeContentItem(id: string, index: number) {
    const interviewCaseTab = await this.findById(id)

    if (!interviewCaseTab.content || index < 0 || index >= interviewCaseTab.content.length) {
      throw new Error('Invalid content index')
    }

    const newContent = [...interviewCaseTab.content]
    newContent.splice(index, 1)

    return await this.prisma.interviewCaseTab.update({
      where: { id },
      data: {
        content: newContent
      },
      include: {
        interviewCase: {
          include: {
            interviewCourse: {
              include: {
                interview: {
                  select: {
                    id: true,
                    title: true,
                    slug: true
                  }
                }
              }
            }
          }
        }
      }
    })
  }

  // Helper method to update a specific content item by index
  async updateContentItem(id: string, index: number, newContent: string) {
    const interviewCaseTab = await this.findById(id)

    if (!interviewCaseTab.content || index < 0 || index >= interviewCaseTab.content.length) {
      throw new Error('Invalid content index')
    }

    const updatedContent = [...interviewCaseTab.content]
    updatedContent[index] = newContent

    return await this.prisma.interviewCaseTab.update({
      where: { id },
      data: {
        content: updatedContent
      },
      include: {
        interviewCase: {
          include: {
            interviewCourse: {
              include: {
                interview: {
                  select: {
                    id: true,
                    title: true,
                    slug: true
                  }
                }
              }
            }
          }
        }
      }
    })
  }
}
