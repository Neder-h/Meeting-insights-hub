import { EmailDraft } from '@/types/meeting';

const API_BASE = 'http://localhost:3001/api';

class ApiClient {
  private token: string | null;

  constructor() {
    this.token = localStorage.getItem('auth_token');
  }

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('auth_token', token);
    } else {
      localStorage.removeItem('auth_token');
    }
  }

  getToken() {
    return this.token;
  }

  async request<T = any>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {};

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    // Don't set Content-Type for FormData (browser sets it with boundary)
    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { ...headers, ...(options.headers as Record<string, string> || {}) },
    });

    if (response.status === 401) {
      this.setToken(null);
      window.location.href = '/login';
      throw new Error('Session expirée');
    }

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Request failed' }));
      const message = err?.details ? `${err.error || 'Request failed'}: ${err.details}` : (err.error || `HTTP ${response.status}`);
      throw new Error(message);
    }

    return response.json();
  }

  get<T = any>(path: string) {
    return this.request<T>(path);
  }

  post<T = any>(path: string, body?: any) {
    return this.request<T>(path, {
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body),
    });
  }

  patch<T = any>(path: string, body: any) {
    return this.request<T>(path, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  del<T = any>(path: string) {
    return this.request<T>(path, { method: 'DELETE' });
  }

  async generateEmailDraft(
    meetingId: string,
    options: {
      tone?: 'professional' | 'friendly' | 'executive';
      language?: string;
      regenerate?: boolean;
      nonce?: string;
      baseDraftId?: string;
      clientName?: string;
      commercialName?: string;
    } = {}
  ): Promise<EmailDraft> {
    return this.post<EmailDraft>(`/meetings/${meetingId}/email-drafts`, {
      tone: options.tone || 'professional',
      language: options.language || 'fr',
      regenerate: !!options.regenerate,
      nonce: options.nonce,
      baseDraftId: options.baseDraftId,
      clientName: options.clientName,
      commercialName: options.commercialName,
    });
  }

  async getMeetingEmailDrafts(meetingId: string): Promise<EmailDraft[]> {
    return this.get<EmailDraft[]>(`/meetings/${meetingId}/email-drafts`);
  }

  async getLatestMeetingEmailDraft(meetingId: string): Promise<EmailDraft | null> {
    try {
      return await this.get<EmailDraft>(`/meetings/${meetingId}/email-drafts/latest`);
    } catch {
      return null;
    }
  }

  async updateMeetingEmailDraft(meetingId: string, draftId: string, updates: Partial<EmailDraft>): Promise<EmailDraft> {
    return this.patch<EmailDraft>(`/meetings/${meetingId}/email-drafts/${draftId}`, updates);
  }

  async getMeetingEmailDraftHistory(meetingId: string, draftId: string) {
    return this.get<any[]>(`/meetings/${meetingId}/email-drafts/${draftId}/history`);
  }

  async getMeetingEmailDraftEvents(meetingId: string) {
    return this.get<any[]>(`/meetings/${meetingId}/email-drafts/events`);
  }

  async deleteMeetingEmailDraft(meetingId: string, draftId: string): Promise<void> {
    await this.del(`/meetings/${meetingId}/email-drafts/${draftId}`);
  }

  async getClients(params: { search?: string; includeDeleted?: boolean; page?: number; limit?: number } = {}) {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (params.includeDeleted) query.set('includeDeleted', '1');
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return this.get<{ items: any[]; pagination: any }>(`/clients${suffix}`);
  }

  async getClient(id: string, options: { includeDeleted?: boolean } = {}) {
    const suffix = options.includeDeleted ? '?includeDeleted=1' : '';
    return this.get<any>(`/clients/${id}${suffix}`);
  }

  async createClient(payload: any) {
    return this.post<any>('/clients', payload);
  }

  async updateClient(id: string, payload: any) {
    return this.patch<any>(`/clients/${id}`, payload);
  }

  async deleteClient(id: string) {
    return this.del<any>(`/clients/${id}`);
  }

  async restoreClient(id: string) {
    return this.post<any>(`/clients/${id}/restore`);
  }

  async syncClientsFromMeetings(meetings: any[]) {
    return this.post<{ success: boolean; upserted: number; syncedGroups: number }>('/clients/sync-from-meetings', {
      meetings,
    });
  }

  async trackEmailDraftFeedback(
    meetingId: string,
    payload: {
      action: 'generated' | 'regenerated' | 'accepted' | 'approved' | 'edited' | 'sent' | 'deleted';
      variant?: 'A' | 'B';
      draftId?: string;
      hadEdits?: boolean;
    }
  ): Promise<void> {
    await this.post(`/meetings/${meetingId}/email-drafts/feedback`, payload);
  }

  async upload(file: Blob, fileName: string): Promise<string> {
    const chunkSize = 5 * 1024 * 1024;

    try {
      const init = await this.post<{ uploadId: string; chunkSize?: number }>('/meetings/upload/init', {
        fileName,
        totalSize: file.size,
        mimeType: file.type,
      });

      const uploadId = init.uploadId;
      const effectiveChunkSize = init.chunkSize || chunkSize;
      const totalChunks = Math.ceil(file.size / effectiveChunkSize);

      for (let index = 0; index < totalChunks; index += 1) {
        const start = index * effectiveChunkSize;
        const end = Math.min(start + effectiveChunkSize, file.size);
        const chunk = file.slice(start, end);

        const formData = new FormData();
        formData.append('chunk', chunk, `${fileName}.part${index}`);
        formData.append('uploadId', uploadId);
        formData.append('chunkIndex', `${index}`);

        await this.request('/meetings/upload/chunk', {
          method: 'POST',
          body: formData,
        });
      }

      const complete = await this.post<{ url: string }>('/meetings/upload/complete', {
        uploadId,
        totalChunks,
      });
      return complete.url;
    } catch (error) {
      // Fallback to legacy single upload endpoint for compatibility
      const formData = new FormData();
      formData.append('file', file, fileName);
      const result = await this.request<{ url: string }>('/meetings/upload', {
        method: 'POST',
        body: formData,
      });
      return result.url;
    }
  }
}

export const apiClient = new ApiClient();
