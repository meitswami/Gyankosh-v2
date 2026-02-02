export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OllamaChatRequest {
  model: string;
  messages: OllamaMessage[];
  stream?: boolean;
  options?: Record<string, any>;
}

export interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: OllamaMessage;
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
  eval_duration?: number;
}

class OllamaClient {
  private baseUrl: string = 'http://localhost:11434';

  setBaseUrl(url: string) {
    this.baseUrl = url.replace(/\/$/, '');
  }

  async checkConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      return response.ok;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) return [];
      const data = await response.json();
      return data.models.map((m: any) => m.name);
    } catch {
      return [];
    }
  }

  async chat(request: OllamaChatRequest, onChunk?: (chunk: string) => void): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...request, stream: !!onChunk }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `Ollama error: ${response.status}`);
    }

    if (!onChunk) {
      const data: OllamaChatResponse = await response.json();
      return data.message.content;
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';

    if (!reader) throw new Error('No response body');

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed: OllamaChatResponse = JSON.parse(line);
          if (parsed.message?.content) {
            fullContent += parsed.message.content;
            onChunk(parsed.message.content);
          }
          if (parsed.done) break;
        } catch (e) {
          console.error('Error parsing Ollama chunk:', e);
        }
      }
    }

    return fullContent;
  }
}

export const ollama = new OllamaClient();
