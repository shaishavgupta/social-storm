import axios, { AxiosInstance } from 'axios';
import { grokConfig } from '../config/grok';
import { logger } from '../utils/logger';

export interface CommentGenerationOptions {
  context?: string;
  tone?: 'casual' | 'professional' | 'friendly' | 'neutral' | 'enthusiastic';
  language?: string;
  maxLength?: number;
  isReply?: boolean;
  parentComment?: string;
}

export class LLMService {
  private client: AxiosInstance;
  private rateLimitDelay: number = 1000; // 1 second between requests
  private lastRequestTime: number = 0;

  constructor() {
    if (!grokConfig.apiKey) {
      throw new Error('GROK_API_KEY is not set');
    }

    this.client = axios.create({
      baseURL: grokConfig.apiUrl,
      headers: {
        'Authorization': `Bearer ${grokConfig.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  }

  /**
   * Generates a contextually relevant, safe comment
   */
  async generateComment(
    postContent: string,
    options: CommentGenerationOptions = {}
  ): Promise<string> {
    await this.enforceRateLimit();

    const {
      context,
      tone = 'neutral',
      language = 'en',
      maxLength = 150,
      isReply = false,
      parentComment,
    } = options;

    try {
      const prompt = this.buildPrompt(postContent, {
        context,
        tone,
        language,
        maxLength,
        isReply,
        parentComment,
      });

      const response = await this.client.post('/chat/completions', {
        model: grokConfig.model,
        messages: [
          {
            role: 'system',
            content: this.getSystemPrompt(tone, language),
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: maxLength,
        temperature: grokConfig.temperature,
      });

      const comment = response.data.choices[0]?.message?.content?.trim();

      if (!comment) {
        throw new Error('Empty response from Grok API');
      }

      // Ensure comment doesn't exceed max length
      return this.truncateComment(comment, maxLength);
    } catch (error) {
      logger.error('Failed to generate comment:', error);
      if (axios.isAxiosError(error)) {
        throw new Error(`Grok API error: ${error.response?.status} - ${error.message}`);
      }
      throw error;
    }
  }

  private buildPrompt(
    postContent: string,
    options: CommentGenerationOptions
  ): string {
    const { context, isReply, parentComment, maxLength } = options;

    let prompt = 'Generate a social media comment';

    if (isReply && parentComment) {
      prompt += ` in reply to this comment: "${parentComment}"`;
    } else {
      prompt += ` for this post: "${postContent.substring(0, 500)}"`;
    }

    if (context) {
      prompt += `\n\nContext: ${context}`;
    }

    prompt += `\n\nRequirements:`;
    prompt += `\n- Keep it under ${maxLength} characters`;
    prompt += `\n- Be safe, respectful, and contextually relevant`;
    prompt += `\n- Do not include harmful, offensive, or inappropriate content`;
    prompt += `\n- Make it sound natural and human-like`;

    if (isReply) {
      prompt += `\n- Make it a direct response to the parent comment`;
    }

    return prompt;
  }

  private getSystemPrompt(tone: string, language: string): string {
    const toneDescriptions: Record<string, string> = {
      casual: 'Use a casual, relaxed tone',
      professional: 'Use a professional, formal tone',
      friendly: 'Use a friendly, warm tone',
      neutral: 'Use a neutral, balanced tone',
      enthusiastic: 'Use an enthusiastic, positive tone',
    };

    return `You are a social media comment generator. ${toneDescriptions[tone] || toneDescriptions.neutral}.
    Generate comments that are safe, contextually relevant, and appropriate.
    Always respond in ${language}. Keep comments concise and engaging.`;
  }

  private truncateComment(comment: string, maxLength: number): string {
    if (comment.length <= maxLength) {
      return comment;
    }

    // Try to truncate at a sentence boundary
    const truncated = comment.substring(0, maxLength - 3);
    const lastPeriod = truncated.lastIndexOf('.');
    const lastExclamation = truncated.lastIndexOf('!');
    const lastQuestion = truncated.lastIndexOf('?');

    const lastSentenceEnd = Math.max(lastPeriod, lastExclamation, lastQuestion);

    if (lastSentenceEnd > maxLength * 0.7) {
      return truncated.substring(0, lastSentenceEnd + 1);
    }

    return truncated + '...';
  }

  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.rateLimitDelay) {
      const waitTime = this.rateLimitDelay - timeSinceLastRequest;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
  }
}

// Singleton instance
let llmService: LLMService | null = null;

export function getLLMService(): LLMService {
  if (!llmService) {
    llmService = new LLMService();
  }
  return llmService;
}

