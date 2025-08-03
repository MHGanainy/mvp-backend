import OpenAI from 'openai';
import { TranscriptClean } from '../../shared/types';

// Enhanced types for the AI feedback system
interface CaseInfo {
  patientName: string;
  diagnosis: string;
  caseTitle: string;
  patientAge?: number;
  patientGender?: string;
}

interface MarkingDomain {
  domain: string;
  score: number;
  feedback: string;
}

interface CaseSpecificCriterion {
  criteria: string;
  score: number;
  feedback: string;
}

interface MarkingDomainCriteria {
  id: string;
  name: string;
  description?: string;
  weight?: number; // Weight percentage for this domain
}

interface CaseMarkingCriteria {
  criteria: string;
  points?: number;
  description?: string;
}

interface AIFeedbackResponse {
  overallFeedback: string;
  strengths: string[];
  improvements: string[];
  score: number;
  markingDomains: MarkingDomain[];
  caseSpecificCriteria: CaseSpecificCriterion[]; // Changed to structured array
}

export class AIFeedbackService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  async generateFeedback(
    transcript: TranscriptClean,
    caseInfo: CaseInfo,
    sessionDuration: number,
    examMarkingDomains: MarkingDomainCriteria[] = [],
    caseMarkingCriteria: CaseMarkingCriteria[] = []
  ): Promise<{ 
    feedback: AIFeedbackResponse; 
    score: number; 
    prompts: { systemPrompt: string; userPrompt: string; }
  }> {
  
    const systemPrompt = this.buildSystemPrompt(caseInfo, examMarkingDomains, caseMarkingCriteria);
    const userPrompt = this.buildUserPrompt(transcript, caseInfo, sessionDuration);
  
    try {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 3000, // Increased for more detailed feedback
        response_format: { type: "json_object" }
      });
  
      const responseContent = completion.choices[0]?.message?.content;
      if (!responseContent) {
        throw new Error('No response content from OpenAI');
      }
  
      const aiResponse = JSON.parse(responseContent) as AIFeedbackResponse;
      
      // Validate and ensure score is within bounds
      const score = Math.max(0, Math.min(100, aiResponse.score || 0));
  
      return {
        feedback: aiResponse,
        score: score,
        prompts: {
          systemPrompt,
          userPrompt
        }
      };
  
    } catch (error) {
      console.error('Error generating AI feedback:', error);
      throw new Error('Failed to generate AI feedback');
    }
  }

  private buildSystemPrompt(
    caseInfo: CaseInfo, 
    examMarkingDomains: MarkingDomainCriteria[],
    caseMarkingCriteria: CaseMarkingCriteria[]
  ): string {
    
    // Build marking domains section
    let markingDomainsSection = '';
    if (examMarkingDomains.length > 0) {
      markingDomainsSection = `
EXAM MARKING DOMAINS:
${examMarkingDomains.map((domain, index) => 
  `${index + 1}. **${domain.name}** ${domain.weight ? `(${domain.weight}%)` : ''}
   ${domain.description ? `   Description: ${domain.description}` : ''}`
).join('\n')}`;
    } else {
      // Fallback to default domains if none provided
      markingDomainsSection = `
EXAM MARKING DOMAINS:
1. **Communication Skills** (25%): Active listening, empathy, clear explanations, appropriate tone
2. **Clinical Assessment** (35%): History taking, physical examination approach, diagnostic reasoning  
3. **Professionalism** (20%): Respect, confidentiality, ethical considerations, time management
4. **Patient Safety** (20%): Risk assessment, appropriate follow-up, safety considerations`;
    }

    // Build case-specific criteria section
    let caseSpecificSection = '';
    if (caseMarkingCriteria.length > 0) {
      caseSpecificSection = `

CASE-SPECIFIC MARKING CRITERIA:
${caseMarkingCriteria.map((criteria, index) => 
  `${index + 1}. ${criteria.criteria}${criteria.points ? ` (${criteria.points} points)` : ''}
   ${criteria.description ? `   Detail: ${criteria.description}` : ''}`
).join('\n')}

The student should be evaluated against each case-specific criterion individually with separate scores and feedback.`;
    }

    return `You are an expert medical examiner evaluating a medical student's performance during a simulated patient consultation for the SCA (Structured Clinical Assessment) exam.

PATIENT CASE CONTEXT:
- Patient Name: ${caseInfo.patientName}
- Case Title: ${caseInfo.caseTitle}
- Diagnosis: ${caseInfo.diagnosis}
${caseInfo.patientAge ? `- Patient Age: ${caseInfo.patientAge}` : ''}
${caseInfo.patientGender ? `- Patient Gender: ${caseInfo.patientGender}` : ''}

${markingDomainsSection}
${caseSpecificSection}

SCORING GUIDELINES:
- 90-100: Exceptional performance, exceeds expectations
- 80-89: Good performance, meets most expectations with minor gaps
- 70-79: Satisfactory performance, meets basic expectations
- 60-69: Below expectations, significant areas for improvement
- 0-59: Unsatisfactory, major deficiencies

EVALUATION APPROACH:
1. First evaluate against the general marking domains
2. Then assess performance against each case-specific criterion individually
3. Provide separate scores and feedback for each case criterion
4. Combine both assessments for the overall score and feedback
5. Provide specific examples from the transcript to support your evaluation

RESPONSE FORMAT:
You must respond with a valid JSON object containing:
{
  "overallFeedback": "Comprehensive overall assessment considering both general domains and case-specific criteria (2-3 sentences)",
  "strengths": ["List of 2-4 specific strengths observed"],
  "improvements": ["List of 2-4 specific areas for improvement"],
  "score": numeric_score_0_to_100,
  "markingDomains": [
    ${examMarkingDomains.map(domain => `{
      "domain": "${domain.name}",
      "score": numeric_score_0_to_100,
      "feedback": "Specific feedback for this domain with examples from transcript"
    }`).join(',\n    ') || `{
      "domain": "Communication Skills",
      "score": numeric_score_0_to_100,
      "feedback": "Specific feedback for this domain"
    },
    {
      "domain": "Clinical Assessment", 
      "score": numeric_score_0_to_100,
      "feedback": "Specific feedback for this domain"
    },
    {
      "domain": "Professionalism",
      "score": numeric_score_0_to_100,
      "feedback": "Specific feedback for this domain"
    },
    {
      "domain": "Patient Safety",
      "score": numeric_score_0_to_100,
      "feedback": "Specific feedback for this domain"
    }`}
  ]${caseMarkingCriteria.length > 0 ? `,
  "caseSpecificCriteria": [
    ${caseMarkingCriteria.map(criteria => `{
      "criteria": "${criteria.criteria}",
      "score": numeric_score_0_to_${criteria.points || 10},
      "feedback": "Specific assessment of how well the student met this criterion"
    }`).join(',\n    ')}
  ]` : ''}
}

Be constructive, specific, and educational in your feedback. Focus on actionable improvements and cite specific examples from the consultation.`;
  }

  private buildUserPrompt(
    transcript: TranscriptClean,
    caseInfo: CaseInfo,
    sessionDuration: number
  ): string {
    
    const conversationText = transcript.messages
      .map(msg => {
        const speaker = msg.speaker.toLowerCase().includes('student') || msg.speaker.toLowerCase().includes('doctor') 
          ? 'STUDENT' 
          : 'AI_PATIENT';
        return `[${msg.timestamp}] ${speaker}: ${msg.message}`;
      })
      .join('\n');

    return `Please evaluate this medical student's consultation performance:

CONSULTATION TRANSCRIPT:
${conversationText}

SESSION DETAILS:
- Total Duration: ${Math.floor(sessionDuration / 60)} minutes ${sessionDuration % 60} seconds
- Total Messages: ${transcript.totalMessages}
- Case: ${caseInfo.caseTitle}

EVALUATION INSTRUCTIONS:
1. Analyze the student's performance against each marking domain
2. Evaluate how well they met the case-specific marking criteria
3. Provide specific examples from the transcript to support your scores
4. Consider the flow and quality of the consultation
5. Assess diagnostic reasoning and patient safety considerations
6. Ensure all feedback is educational and actionable

Please provide your evaluation in the required JSON format.`;
  }
}

// Export both the class and a singleton instance
export const aiFeedbackService = new AIFeedbackService();