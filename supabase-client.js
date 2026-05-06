// APIクライアント（server.js REST API経由）
const createSupabaseApiClient = () => {
  const BASE_URL = '/api';
  let _token = localStorage.getItem('authToken');

  const headers = () => ({
    'Content-Type': 'application/json',
    ...(_token ? { Authorization: `Bearer ${_token}` } : {})
  });

  const request = async (endpoint, options = {}) => {
    const config = { headers: headers(), ...options };
    if (options.body && typeof options.body === 'object') {
      config.body = JSON.stringify(options.body);
    }
    const res = await fetch(`${BASE_URL}${endpoint}`, config);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  };

  return {
    socket: null,
    token: null,
    currentUser: null,

    setToken(t) {
      _token = t;
      this.token = t;
      localStorage.setItem('authToken', t);
    },

    clearToken() {
      _token = null;
      this.token = null;
      this.currentUser = null;
      localStorage.removeItem('authToken');
    },

    async login(usernameInput, password) {
      const data = await request('/auth/login', {
        method: 'POST',
        body: { username: usernameInput, password }
      });
      _token = data.token;
      this.token = data.token;
      this.currentUser = data.user;
      return data;
    },

    connectSocket() {
      if (window.apiClient) {
        window.apiClient.setToken(_token);
        window.apiClient.connectSocket();
        this.socket = window.apiClient.socket;
      }
    },

    disconnectSocket() {
      if (window.apiClient) {
        window.apiClient.disconnectSocket();
      }
    },

    on(event, callback) {
      if (window.apiClient) window.apiClient.on(event, callback);
    },

    off(event) {
      if (window.apiClient) window.apiClient.off(event);
    },

    async getApplicants() {
      const list = await request('/applicants');
      const detailed = await Promise.all(
        list.map(a =>
          request(`/applicants/${a.id}`).catch(() => ({ ...a, timeline: [] }))
        )
      );
      return detailed.map(a => ({
        id: a.id,
        name: a.name,
        surname: a.surname,
        given_name: a.given_name,
        age: a.age,
        care_level: a.care_level,
        address: a.address || '',
        kp: a.kp || '',
        kp_relationship: a.kp_relationship || '',
        kp_contact: a.kp_contact || '',
        kp_address: a.kp_address || '',
        care_manager: a.care_manager || '',
        care_manager_name: a.care_manager_name || '',
        cm_contact: a.cm_contact || '',
        assignee: a.assignee || '',
        notes: a.notes || '',
        status: a.status,
        application_date: a.application_date,
        gender: a.gender || '',
        room_number: a.room_number || '',
        move_in_date: a.move_in_date || '',
        municipality: a.municipality || '',
        timeline: (a.timeline || []).map(post => ({
          ...post,
          timestamp: post.created_at,
          replies: (post.replies || []).map(r => ({ ...r, timestamp: r.created_at }))
        }))
      }));
    },

    async getApplicant(id) {
      const applicants = await this.getApplicants();
      return applicants.find(a => a.id == id);
    },

    async createApplicant(data) {
      return request('/applicants', { method: 'POST', body: data });
    },

    async updateApplicant(id, data) {
      return request(`/applicants/${id}`, { method: 'PUT', body: data });
    },

    async deleteApplicant(id) {
      return request(`/applicants/${id}`, { method: 'DELETE' });
    },

    async updateMoveInDate(id, moveInDate) {
      return request(`/applicants/${id}/move-in-date`, {
        method: 'PUT',
        body: { move_in_date: moveInDate }
      });
    },

    // author はサーバー側でJWTから取得するため無視
    async createTimelinePost(applicantId, author, content, action = null, parentPostId = null, postDate = null) {
      return request(`/applicants/${applicantId}/posts`, {
        method: 'POST',
        body: { content, action, parentPostId }
      });
    },

    async updatePost(applicantId, postId, content) {
      return request(`/applicants/${applicantId}/posts/${postId}`, {
        method: 'PUT',
        body: { content }
      });
    },

    async deletePost(applicantId, postId) {
      return request(`/applicants/${applicantId}/posts/${postId}`, { method: 'DELETE' });
    },

    // いいね機能はサーバー未実装のためスタブ
    async addLike(userId, postId) { return {}; },
    async removeLike(userId, postId) { return {}; },
    async getLikes(postId) { return []; },

    async getStatistics() {
      return request('/statistics');
    }
  };
};

// React コンポーネント内の直接Supabase呼び出しが壊れないよう、
// ネットワークアクセスしないスタブとして supabaseClient を定義する
const _supabaseStubQuery = () => {
  const noop = async () => ({ data: [], error: null });
  const chain = {
    select: () => chain, eq: () => chain, neq: () => chain,
    is: () => chain, not: () => chain, order: () => chain,
    limit: () => chain, single: noop, maybeSingle: noop,
    insert: () => chain, update: () => chain, delete: () => chain,
    upsert: () => chain, then: (resolve) => resolve({ data: [], error: null })
  };
  return chain;
};

const supabaseClient = {
  from: () => _supabaseStubQuery(),
  channel: (name) => ({
    on: function() { return this; },
    subscribe: function() { return this; }
  }),
  removeChannel: () => {}
};
