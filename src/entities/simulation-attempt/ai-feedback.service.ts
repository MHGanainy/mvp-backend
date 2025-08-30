import OpenAI from 'openai';
import { TranscriptClean } from '../../shared/types';

interface CaseInfo {
  patientName: string;
  diagnosis: string;
  caseTitle: string;
  patientAge?: number;
  patientGender?: string;
}

interface CaseTabs {
  doctorsNote: string[];
  patientScript: string[];
  medicalNotes: string[];
}

interface MarkingCriterionResult {
  criterionId: string;
  criterionText: string;
  points: number; // Now included
  met: boolean;
  transcriptReferences: string[];
  feedback: string;
}

interface MarkingDomainResult {
  domainId: string;
  domainName: string;
  totalPossiblePoints: number; // Now included
  achievedPoints: number; // Now included
  percentageScore: number; // Now included
  criteria: MarkingCriterionResult[];
}

// Performance classification enum
enum PerformanceClassification {
  CLEAR_PASS = 'CLEAR_PASS',
  BORDERLINE_PASS = 'BORDERLINE_PASS',
  BORDERLINE_FAIL = 'BORDERLINE_FAIL',
  CLEAR_FAIL = 'CLEAR_FAIL'
}

interface OverallResult {
  classification: PerformanceClassification;
  classificationLabel: string;
  percentageMet: number;
  totalCriteria: number;
  criteriaMet: number;
  criteriaNotMet: number;
  description: string;
}

interface AIFeedbackResponse {
  overallFeedback: string;
  overallResult: OverallResult;
  markingDomains: MarkingDomainResult[];
}

interface MarkingDomainWithCriteria {
  domainId: string;
  domainName: string;
  criteria: {
    id: string;
    text: string;
    points: number;
    displayOrder: number;
  }[];
}

export class AIFeedbackService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  private calculatePerformanceClassification(percentageMet: number): {
    classification: PerformanceClassification;
    label: string;
    description: string;
  } {
    if (percentageMet > 75) {
      return {
        classification: PerformanceClassification.CLEAR_PASS,
        label: 'Clear Pass',
        description: 'More than 75% of checklist items met'
      };
    } else if (percentageMet >= 50) {
      return {
        classification: PerformanceClassification.BORDERLINE_PASS,
        label: 'Borderline Pass',
        description: '50% - 75% of checklist items met'
      };
    } else if (percentageMet >= 25) {
      return {
        classification: PerformanceClassification.BORDERLINE_FAIL,
        label: 'Borderline Fail',
        description: '25% - 50% of checklist items met'
      };
    } else {
      return {
        classification: PerformanceClassification.CLEAR_FAIL,
        label: 'Clear Fail',
        description: 'Less than 25% of checklist items met'
      };
    }
  }

  async generateFeedback(
    transcript: TranscriptClean,
    caseInfo: CaseInfo,
    caseTabs: CaseTabs,
    sessionDuration: number,
    markingDomainsWithCriteria: MarkingDomainWithCriteria[]
  ): Promise<{ 
    feedback: AIFeedbackResponse; 
    score: number; 
    prompts: { systemPrompt: string; userPrompt: string; };
    markingStructure: MarkingDomainWithCriteria[]; // Added to return original structure
  }> {
  
    const systemPrompt = this.buildSystemPrompt(caseInfo, caseTabs, markingDomainsWithCriteria);
    const userPrompt = this.buildUserPrompt(transcript, caseInfo, sessionDuration);
  
    try {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 4000,
        response_format: { type: "json_object" }
      });
  
      const responseContent = completion.choices[0]?.message?.content;
      if (!responseContent) {
        throw new Error('No response content from OpenAI');
      }
  
      const rawResponse = JSON.parse(responseContent);
      
      // Calculate overall statistics from the raw response
      let totalCriteria = 0;
      let criteriaMet = 0;
      let totalPossiblePoints = 0;
      let totalAchievedPoints = 0;
      
      // Keep the full structure with points
      const fullDomains: MarkingDomainResult[] = rawResponse.markingDomains.map((domain: any) => {
        let domainAchievedPoints = 0;
        let domainTotalPoints = 0;
        
        const fullCriteria: MarkingCriterionResult[] = domain.criteria.map((criterion: any) => {
          totalCriteria++;
          totalPossiblePoints += criterion.points;
          domainTotalPoints += criterion.points;
          
          if (criterion.met) {
            criteriaMet++;
            totalAchievedPoints += criterion.points;
            domainAchievedPoints += criterion.points;
          }
          
          // Keep all fields including points
          return {
            criterionId: criterion.criterionId,
            criterionText: criterion.criterionText,
            points: criterion.points,
            met: criterion.met,
            transcriptReferences: criterion.transcriptReferences,
            feedback: criterion.feedback
          };
        });
        
        // Return full domain with scoring fields
        return {
          domainId: domain.domainId,
          domainName: domain.domainName,
          totalPossiblePoints: domainTotalPoints,
          achievedPoints: domainAchievedPoints,
          percentageScore: domainTotalPoints > 0 
            ? Math.round((domainAchievedPoints / domainTotalPoints) * 100) 
            : 0,
          criteria: fullCriteria
        };
      });
      
      const percentageMet = totalCriteria > 0 ? (criteriaMet / totalCriteria) * 100 : 0;
      const classification = this.calculatePerformanceClassification(percentageMet);
      
      // Build the full response with all details
      const aiResponse: AIFeedbackResponse = {
        overallFeedback: rawResponse.overallFeedback,
        overallResult: {
          classification: classification.classification,
          classificationLabel: classification.label,
          percentageMet: Math.round(percentageMet * 10) / 10,
          totalCriteria,
          criteriaMet,
          criteriaNotMet: totalCriteria - criteriaMet,
          description: classification.description
        },
        markingDomains: fullDomains
      };
      
      // Calculate overall score
      const score = totalPossiblePoints > 0 
        ? Math.round((totalAchievedPoints / totalPossiblePoints) * 100)
        : 0;
  
      return {
        feedback: aiResponse,
        score: score,
        prompts: {
          systemPrompt,
          userPrompt
        },
        markingStructure: markingDomainsWithCriteria // Return original structure too
      };
  
    } catch (error) {
      console.error('Error generating AI feedback:', error);
      throw new Error('Failed to generate AI feedback');
    }
  }

  private buildSystemPrompt(
    caseInfo: CaseInfo,
    caseTabs: CaseTabs,
    markingDomainsWithCriteria: MarkingDomainWithCriteria[]
  ): string {
    
    const totalPossiblePoints = markingDomainsWithCriteria.reduce((sum, domain) => 
      sum + domain.criteria.reduce((domainSum, criterion) => domainSum + criterion.points, 0), 0
    );
    
    const totalCriteria = markingDomainsWithCriteria.reduce((sum, domain) => 
      sum + domain.criteria.length, 0
    );

    return `You are an expert medical examiner evaluating a medical student's performance during a simulated patient consultation.

PATIENT CASE CONTEXT:
- Patient Name: ${caseInfo.patientName}
- Case Title: ${caseInfo.caseTitle}
- Diagnosis: ${caseInfo.diagnosis}
${caseInfo.patientAge ? `- Patient Age: ${caseInfo.patientAge}` : ''}
${caseInfo.patientGender ? `- Patient Gender: ${caseInfo.patientGender}` : ''}

================================
CASE PREPARATION MATERIALS:
================================

DOCTOR'S NOTES (What the examiner expects):
${caseTabs.doctorsNote.length > 0 ? caseTabs.doctorsNote.map((note, i) => `${i + 1}. ${note}`).join('\n') : 'No specific doctor notes provided'}

PATIENT SCRIPT (How the patient should present):
${caseTabs.patientScript.length > 0 ? caseTabs.patientScript.map((script, i) => `${i + 1}. ${script}`).join('\n') : 'No specific patient script provided'}

MEDICAL NOTES (Key medical information):
${caseTabs.medicalNotes.length > 0 ? caseTabs.medicalNotes.map((note, i) => `${i + 1}. ${note}`).join('\n') : 'No specific medical notes provided'}

================================
MARKING CRITERIA:
================================
Total Possible Points: ${totalPossiblePoints}
Total Criteria to Evaluate: ${totalCriteria}

${markingDomainsWithCriteria.map((domain, index) => {
  const domainPoints = domain.criteria.reduce((sum, c) => sum + c.points, 0);
  return `
DOMAIN ${index + 1}: ${domain.domainName}
Domain ID: ${domain.domainId}
Total Points in Domain: ${domainPoints}
Number of Criteria: ${domain.criteria.length}
Criteria to Evaluate:
${domain.criteria.map((criterion, cIndex) => `
  ${cIndex + 1}. [ID: ${criterion.id}] ${criterion.text}
     Points: ${criterion.points}
     Evaluate if MET or NOT MET based on the transcript AND case materials.`).join('')}`;
}).join('\n')}

================================
PERFORMANCE CLASSIFICATION RULES:
================================
Based on the percentage of criteria MET:
- Clear Pass: More than 75% of criteria met
- Borderline Pass: 50% - 75% of criteria met  
- Borderline Fail: 25% - 50% of criteria met
- Clear Fail: Less than 25% of criteria met

EVALUATION INSTRUCTIONS:
1. Use the DOCTOR'S NOTES to understand what the examiner expects from the student
2. Use the PATIENT SCRIPT to assess if the student elicited the correct information
3. Use the MEDICAL NOTES to verify the student's clinical knowledge and approach
4. For EACH criterion:
   - Determine if it was MET (demonstrated) or NOT MET (not/partially demonstrated)
   - Provide 1-3 EXACT quotes from the transcript supporting your decision
   - Consider the case materials when making your determination
   - Provide feedback explaining your decision

5. Criteria are binary - either MET (full points) or NOT MET (0 points)
6. Be strict but fair - the student must demonstrate competency based on the expected standards
7. Count the total number of criteria MET vs NOT MET for classification

RESPONSE FORMAT:
You must respond with a valid JSON object in this exact structure:
{
  "overallFeedback": "2-3 sentence summary comparing performance to case expectations",
  "markingDomains": [
${markingDomainsWithCriteria.map(domain => {
  const domainPoints = domain.criteria.reduce((sum, c) => sum + c.points, 0);
  return `    {
      "domainId": "${domain.domainId}",
      "domainName": "${domain.domainName}",
      "totalPossiblePoints": ${domainPoints},
      "achievedPoints": sum_of_met_criteria_points,
      "percentageScore": domain_percentage,
      "criteria": [
${domain.criteria.map(criterion => `        {
          "criterionId": "${criterion.id}",
          "criterionText": "${criterion.text}",
          "points": ${criterion.points},
          "met": true_or_false,
          "transcriptReferences": ["exact quote 1", "exact quote 2"],
          "feedback": "Explanation referencing case materials where relevant"
        }`).join(',\n')}
      ]
    }`}).join(',\n')}
  ]
}`;
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
          : 'PATIENT';
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

CRITICAL INSTRUCTIONS:
1. Compare the student's performance against the DOCTOR'S NOTES expectations
2. Check if the student elicited information mentioned in the PATIENT SCRIPT
3. Verify the student's approach aligns with the MEDICAL NOTES
4. Evaluate EACH criterion as either MET or NOT MET (binary decision)
5. Provide 1-3 EXACT quotes from the transcript for each criterion
6. Reference the case materials in your feedback where relevant
7. Calculate points: MET = full points, NOT MET = 0 points
8. Be aware that the overall classification depends on the percentage of criteria MET

Remember:
- Clear Pass requires >75% of criteria MET
- Borderline Pass requires 50-75% of criteria MET
- Borderline Fail requires 25-50% of criteria MET
- Clear Fail is <25% of criteria MET

Please provide your evaluation in the required JSON format.`;
  }
}

export const aiFeedbackService = new AIFeedbackService();