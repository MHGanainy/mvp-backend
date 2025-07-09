import { PrismaClient } from '@prisma/client'
import { CreateCaseTabInput, UpdateCaseTabInput, CaseTabType } from './case-tab.schema'

export class CaseTabService {
  constructor(private prisma: PrismaClient) {}

  async create(data: CreateCaseTabInput) {
    // Verify the course case exists
    const courseCase = await this.prisma.courseCase.findUnique({
      where: { id: data.courseCaseId },
      include: {
        course: {
          include: { exam: true }
        }
      }
    })

    if (!courseCase) {
      throw new Error('Course case not found')
    }

    // Check if this case already has a tab of this type
    const existingTab = await this.prisma.caseTab.findUnique({
      where: {
        courseCaseId_tabType: {
          courseCaseId: data.courseCaseId,
          tabType: data.tabType
        }
      }
    })

    if (existingTab) {
      throw new Error(`Case already has a ${data.tabType} tab`)
    }

    return await this.prisma.caseTab.create({
      data: {
        courseCaseId: data.courseCaseId,
        tabType: data.tabType,
        content: data.content
      },
      include: {
        courseCase: {
          include: {
            course: {
              include: {
                exam: {
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
    return await this.prisma.caseTab.findMany({
      include: {
        courseCase: {
          include: {
            course: {
              include: {
                exam: {
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
        { courseCase: { title: 'asc' } },
        { tabType: 'asc' }
      ]
    })
  }

  async findById(id: string) {
    const caseTab = await this.prisma.caseTab.findUnique({
      where: { id },
      include: {
        courseCase: {
          include: {
            course: {
              include: {
                exam: {
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

    if (!caseTab) {
      throw new Error('Case tab not found')
    }

    return caseTab
  }

  async findByCourseCase(courseCaseId: string) {
    // Verify course case exists
    const courseCase = await this.prisma.courseCase.findUnique({
      where: { id: courseCaseId }
    })

    if (!courseCase) {
      throw new Error('Course case not found')
    }

    return await this.prisma.caseTab.findMany({
      where: { courseCaseId },
      include: {
        courseCase: {
          include: {
            course: {
              include: {
                exam: {
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

  async findByTabType(courseCaseId: string, tabType: CaseTabType) {
    const caseTab = await this.prisma.caseTab.findUnique({
      where: {
        courseCaseId_tabType: {
          courseCaseId,
          tabType
        }
      },
      include: {
        courseCase: {
          include: {
            course: {
              include: {
                exam: {
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

    if (!caseTab) {
      throw new Error(`${tabType} tab not found for this case`)
    }

    return caseTab
  }

  async update(id: string, data: UpdateCaseTabInput) {
    // Check if case tab exists
    await this.findById(id)

    return await this.prisma.caseTab.update({
      where: { id },
      data,
      include: {
        courseCase: {
          include: {
            course: {
              include: {
                exam: {
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
    // Check if case tab exists
    await this.findById(id)

    return await this.prisma.caseTab.delete({
      where: { id }
    })
  }

  // BUSINESS LOGIC METHODS

  async createAllTabsForCase(courseCaseId: string) {
    // Verify course case exists
    const courseCase = await this.prisma.courseCase.findUnique({
      where: { id: courseCaseId }
    })

    if (!courseCase) {
      throw new Error('Course case not found')
    }

    // Check if any tabs already exist
    const existingTabs = await this.prisma.caseTab.findMany({
      where: { courseCaseId }
    })

    if (existingTabs.length > 0) {
      throw new Error('Some tabs already exist for this case')
    }

    // Create all 4 tabs with empty content
    const tabTypes: CaseTabType[] = ['DOCTORS_NOTE', 'PATIENT_SCRIPT', 'MARKING_CRITERIA', 'MEDICAL_NOTES']
    
    const tabs = await Promise.all(
      tabTypes.map((tabType: CaseTabType) => 
        this.prisma.caseTab.create({
          data: {
            courseCaseId,
            tabType,
            content: '' // Start with empty content
          },
          include: {
            courseCase: {
              include: {
                course: {
                  include: {
                    exam: {
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

  async getCaseTabStats(courseCaseId: string) {
    const tabs = await this.prisma.caseTab.findMany({
      where: { courseCaseId },
      select: {
        tabType: true,
        content: true,
        updatedAt: true
      }
    })

    return {
      courseCaseId,
      totalTabs: tabs.length,
      completedTabs: tabs.filter((tab: { content: string }) => tab.content && tab.content.trim().length > 0).length,
      emptyTabs: tabs.filter((tab: { content: string }) => !tab.content || tab.content.trim().length === 0).length,
      tabDetails: tabs.map((tab: { tabType: any; content: string; updatedAt: Date }) => ({
        tabType: tab.tabType,
        hasContent: !!(tab.content && tab.content.trim().length > 0),
        contentLength: tab.content?.length || 0,
        lastUpdated: tab.updatedAt
      }))
    }
  }

  async getCourseTabsOverview(courseId: string) {
    // Get all cases for this course
    const courseCases = await this.prisma.courseCase.findMany({
      where: { courseId },
      include: {
        caseTabs: {
          select: {
            tabType: true,
            content: true
          }
        }
      }
    })

    const overview = courseCases.map((courseCase: { 
      id: string; 
      title: string; 
      caseTabs: Array<{ tabType: any; content: string }> 
    }) => ({
      caseId: courseCase.id,
      caseTitle: courseCase.title,
      totalTabs: courseCase.caseTabs.length,
      completedTabs: courseCase.caseTabs.filter((tab: { content: string }) => tab.content && tab.content.trim().length > 0).length,
      completionPercentage: courseCase.caseTabs.length > 0 
        ? Math.round((courseCase.caseTabs.filter((tab: { content: string }) => tab.content && tab.content.trim().length > 0).length / 4) * 100)
        : 0
    }))

    return {
      courseId,
      totalCases: courseCases.length,
      casesWithAllTabs: overview.filter((item: { totalTabs: number }) => item.totalTabs === 4).length,
      casesWithCompletedContent: overview.filter((item: { completedTabs: number }) => item.completedTabs === 4).length,
      averageCompletion: overview.length > 0 
        ? Math.round(overview.reduce((sum: number, item: { completionPercentage: number }) => sum + item.completionPercentage, 0) / overview.length)
        : 0,
      caseDetails: overview
    }
  }

  async bulkUpdateTabContent(courseCaseId: string, tabUpdates: { tabType: CaseTabType; content: string }[]) {
    // Verify course case exists
    const courseCase = await this.prisma.courseCase.findUnique({
      where: { id: courseCaseId }
    })

    if (!courseCase) {
      throw new Error('Course case not found')
    }

    // Update all tabs in a transaction
    const updatedTabs = await this.prisma.$transaction(
      tabUpdates.map((update: { tabType: CaseTabType; content: string }) => 
        this.prisma.caseTab.upsert({
          where: {
            courseCaseId_tabType: {
              courseCaseId,
              tabType: update.tabType
            }
          },
          update: {
            content: update.content
          },
          create: {
            courseCaseId,
            tabType: update.tabType,
            content: update.content
          },
          include: {
            courseCase: {
              include: {
                course: {
                  include: {
                    exam: {
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
}