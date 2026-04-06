import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding blog data...')

  // ─── Find admin user to use as article author ───────────
  const adminUser = await prisma.user.findFirst({ where: { isAdmin: true } })
  if (!adminUser) {
    console.error('No admin user found. Create an admin user first.')
    process.exit(1)
  }
  console.log(`  Using admin user as author: ${adminUser.email} (id: ${adminUser.id})`)

  // ─── Categories ─────────────────────────────────────────
  const categoryData = [
    { slug: 'plab2', name: 'PLAB 2', description: 'PLAB 2 OSCE preparation guides and strategies', metaDescription: 'Master PLAB 2 with expert guides and proven frameworks.', displayOrder: 1 },
    { slug: 'paces', name: 'PACES', description: 'MRCP PACES examination preparation and station guides', metaDescription: 'Comprehensive PACES preparation: station-by-station guides.', displayOrder: 2 },
    { slug: 'scaexam', name: 'SCA Exam', description: 'SCA preparation, clinical scenarios, and insights', metaDescription: 'SCA exam preparation articles and success strategies.', displayOrder: 3 },
    { slug: 'ukmla', name: 'UKMLA', description: 'UKMLA preparation for AKT and Clinical Examination', metaDescription: 'UKMLA Applied Knowledge Test and Clinical Examination guides.', displayOrder: 4 },
    { slug: 'study-tips', name: 'Study Tips', description: 'Effective study techniques and productivity tips', metaDescription: 'Proven study strategies and time management techniques.', displayOrder: 10 },
    { slug: 'interview-skills', name: 'Interview Skills', description: 'Medical interview preparation and career advice', metaDescription: 'Ace your medical interviews with expert tips.', displayOrder: 11 },
    { slug: 'exam-news', name: 'Exam Updates', description: 'Latest news and announcements about medical exams', metaDescription: 'Stay updated with the latest medical exam news.', displayOrder: 12 },
    { slug: 'success-stories', name: 'Success Stories', description: 'Inspiring stories from successful candidates', metaDescription: 'Read inspiring success stories from medical professionals.', displayOrder: 13 },
  ]

  const categories: Record<string, any> = {}
  for (const cat of categoryData) {
    let existing = await prisma.blogCategory.findFirst({ where: { slug: cat.slug } })
    if (!existing) {
      existing = await prisma.blogCategory.create({ data: cat })
      console.log(`  Created category: ${cat.name}`)
    } else {
      console.log(`  Category already exists: ${cat.name}`)
    }
    categories[cat.slug] = existing
  }

  // ─── Tags ───────────────────────────────────────────────
  const tagData = [
    { slug: 'communication', name: 'Communication', description: 'Communication skills for clinical exams' },
    { slug: 'osce', name: 'OSCE', description: 'Objective Structured Clinical Examination' },
    { slug: 'clinical-skills', name: 'Clinical Skills', description: 'Core clinical skills' },
    { slug: 'time-management', name: 'Time Management', description: 'Study and exam time management' },
    { slug: 'history-taking', name: 'History Taking', description: 'Medical history taking techniques' },
  ]

  const tags: Record<string, any> = {}
  for (const t of tagData) {
    let existing = await prisma.tag.findFirst({ where: { slug: t.slug } })
    if (!existing) {
      existing = await prisma.tag.create({ data: t })
      console.log(`  Created tag: ${t.name}`)
    } else {
      console.log(`  Tag already exists: ${t.name}`)
    }
    tags[t.slug] = existing
  }

  // ─── Sample Articles ────────────────────────────────────
  const articleData = [
    {
      slug: 'plab2-communication-skills-complete-guide',
      headline: 'How to Master PLAB 2 Communication Skills',
      metaDescription: 'Master PLAB 2 communication skills with our expert guide covering the Calgary-Cambridge framework.',
      content: '<h2>Introduction</h2><p>Communication skills determine approximately 80% of your PLAB 2 success. This comprehensive guide covers everything you need to know.</p><h2>The Calgary-Cambridge Framework</h2><p>The Calgary-Cambridge framework is the gold standard for medical communication. It structures consultations into five key phases.</p><h2>Active Listening Techniques</h2><p>Active listening goes beyond simply hearing the patient. It involves reflecting, summarising, and acknowledging emotions.</p>',
      excerpt: 'Communication skills determine 80% of your PLAB 2 success. Master the Calgary-Cambridge framework with our expert guide.',
      tldr: 'Master PLAB 2 communication by using the Calgary-Cambridge framework, practising active listening, and structuring your consultations with clear opening and closing statements.',
      primaryCategory: 'plab2',
      secondaryCategories: ['study-tips'],
      tags: ['communication', 'osce'],
      faqs: [
        { question: 'How long should I study communication skills for PLAB 2?', answer: '8-12 weeks of dedicated practice is recommended, with at least 2-3 mock sessions per week.', position: 1 },
        { question: 'What is the most common mistake in PLAB 2 communication?', answer: 'Not acknowledging patient emotions. Always use empathetic statements like "I understand this must be concerning for you."', position: 2 },
      ],
    },
    {
      slug: 'paces-station-guide-history-taking',
      headline: 'PACES Station 2: Complete History Taking Guide',
      metaDescription: 'Comprehensive PACES Station 2 history taking guide with frameworks, common cases, and examiner tips.',
      content: '<h2>Station 2 Overview</h2><p>PACES Station 2 tests your ability to take a focused medical history in 14 minutes. The station carries significant weight in the overall exam.</p><h2>The Systematic Approach</h2><p>Every history should follow a structured approach: presenting complaint, history of presenting complaint, past medical history, drug history, family history, social history, and systems review.</p>',
      excerpt: 'Master PACES Station 2 with our comprehensive history taking guide covering frameworks and common cases.',
      primaryCategory: 'paces',
      secondaryCategories: [],
      tags: ['history-taking', 'clinical-skills'],
      faqs: [
        { question: 'How many minutes do I have for history taking in PACES?', answer: '14 minutes total, including 1 minute for the examiner introduction and 1 minute for your summary.', position: 1 },
      ],
    },
    {
      slug: 'top-10-study-tips-medical-exams',
      headline: 'Top 10 Study Tips for Medical Exams in 2026',
      metaDescription: 'Evidence-based study tips for medical exams including PLAB 2, PACES, SCA, and UKMLA.',
      content: '<h2>1. Active Recall</h2><p>Studies consistently show that testing yourself is more effective than re-reading notes. Use flashcards and practice questions.</p><h2>2. Spaced Repetition</h2><p>Review material at increasing intervals to strengthen long-term memory retention.</p><h2>3. Practice Under Exam Conditions</h2><p>Simulate the exam environment as closely as possible during your practice sessions.</p>',
      excerpt: 'Evidence-based study tips that will help you pass PLAB 2, PACES, SCA, and UKMLA exams more effectively.',
      primaryCategory: 'study-tips',
      secondaryCategories: ['plab2', 'paces'],
      tags: ['time-management'],
      faqs: [],
    },
  ]

  for (const articleDef of articleData) {
    const existing = await prisma.blogArticle.findFirst({ where: { slug: articleDef.slug } })
    if (existing) {
      console.log(`  Article already exists: ${articleDef.headline}`)
      continue
    }

    const wordCount = articleDef.content.replace(/<[^>]*>/g, '').split(/\s+/).filter(Boolean).length
    const readingTimeMinutes = Math.ceil(wordCount / 200)

    const article = await prisma.blogArticle.create({
      data: {
        slug: articleDef.slug,
        headline: articleDef.headline,
        metaDescription: articleDef.metaDescription,
        content: articleDef.content,
        excerpt: articleDef.excerpt,
        tldr: articleDef.tldr || null,
        authorId: adminUser.id,
        status: 'PUBLISHED',
        publishedDate: new Date(),
        wordCount,
        readingTimeMinutes,
        featuredImageUrl: 'https://placehold.co/1200x630/1a365d/ffffff?text=SimsBuddy+Blog',
        featuredImageAlt: articleDef.headline,
      },
    })

    // Primary category
    await prisma.articleCategory.create({
      data: { articleId: article.id, categoryId: categories[articleDef.primaryCategory].id, isPrimary: true },
    })

    // Secondary categories
    for (const catSlug of articleDef.secondaryCategories) {
      await prisma.articleCategory.create({
        data: { articleId: article.id, categoryId: categories[catSlug].id, isPrimary: false },
      })
    }

    // Tags
    for (const tagSlug of articleDef.tags) {
      await prisma.articleTag.create({
        data: { articleId: article.id, tagId: tags[tagSlug].id },
      })
    }

    // FAQs
    for (const faq of articleDef.faqs) {
      await prisma.articleFaq.create({
        data: { articleId: article.id, question: faq.question, answer: faq.answer, position: faq.position },
      })
    }

    console.log(`  Created article: ${articleDef.headline}`)
  }

  console.log('Blog seed complete!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
