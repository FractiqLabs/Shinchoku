class APIClient {
  constructor() {
    this.baseURL = 'http://localhost:3001/api';
    this.token = localStorage.getItem('authToken');
    this.socket = null;
    this.eventHandlers = {};
  }

  setToken(token) {
    this.token = token;
    localStorage.setItem('authToken', token);
  }

  clearToken() {
    this.token = null;
    localStorage.removeItem('authToken');
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    if (this.token) {
      config.headers.Authorization = `Bearer ${this.token}`;
    }

    if (config.body && typeof config.body === 'object') {
      config.body = JSON.stringify(config.body);
    }

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('API request failed, using localStorage fallback:', error);
      
      // サーバーが利用できない場合はローカルストレージを使用
      return this.handleLocalStorageFallback(endpoint, options);
    }
  }

  handleLocalStorageFallback(endpoint, options) {
    const method = options.method || 'GET';
    const applicantsKey = 'careFacilityApplicants';
    
    // ローカルストレージからデータを取得
    const getLocalData = () => {
      try {
        const data = localStorage.getItem(applicantsKey);
        return data ? JSON.parse(data) : this.getDefaultApplicants();
      } catch (error) {
        return this.getDefaultApplicants();
      }
    };
    
    // ローカルストレージにデータを保存
    const saveLocalData = (data) => {
      try {
        localStorage.setItem(applicantsKey, JSON.stringify(data));
      } catch (error) {
        console.error('Failed to save to localStorage:', error);
      }
    };
    
    if (endpoint === '/applicants') {
      if (method === 'GET') {
        return getLocalData();
      } else if (method === 'POST') {
        const data = getLocalData();
        const newApplicant = {
          id: Date.now(),
          applicationDate: new Date().toISOString().split('T')[0],
          name: `${options.body.surname}　${options.body.givenName}`,
          surname: options.body.surname,
          given_name: options.body.givenName,
          age: options.body.age,
          care_level: options.body.careLevel,
          address: options.body.address,
          kp: options.body.kp,
          kp_relationship: options.body.kpRelationship,
          kp_contact: options.body.kpContact,
          kp_address: options.body.kpAddress,
          care_manager: options.body.careManager,
          care_manager_name: options.body.careManagerName,
          cm_contact: options.body.cmContact,
          assignee: options.body.assignee,
          notes: options.body.notes,
          status: '申込書受領',
          timeline: []
        };
        data.push(newApplicant);
        saveLocalData(data);
        return { id: newApplicant.id, message: '申込者が登録されました' };
      }
    } else if (endpoint.startsWith('/applicants/')) {
      const id = parseInt(endpoint.split('/')[2]);
      const data = getLocalData();
      
      if (method === 'PUT') {
        const index = data.findIndex(app => app.id === id);
        if (index !== -1) {
          data[index] = {
            ...data[index],
            name: `${options.body.surname}　${options.body.givenName}`,
            surname: options.body.surname,
            given_name: options.body.givenName,
            age: options.body.age,
            care_level: options.body.careLevel,
            address: options.body.address,
            kp: options.body.kp,
            kp_relationship: options.body.kpRelationship,
            kp_contact: options.body.kpContact,
            kp_address: options.body.kpAddress,
            care_manager: options.body.careManager,
            care_manager_name: options.body.careManagerName,
            cm_contact: options.body.cmContact,
            assignee: options.body.assignee,
            notes: options.body.notes
          };
          saveLocalData(data);
          return { message: '申込者情報が更新されました' };
        }
      } else if (method === 'DELETE') {
        const filteredData = data.filter(app => app.id !== id);
        saveLocalData(filteredData);
        return { message: '申込者が削除されました' };
      }
    }
    
    throw new Error('Unsupported operation in localStorage fallback');
  }

  getDefaultApplicants() {
    return [
      {
        id: 1,
        applicationDate: '2024-12-15',
        name: '田中太郎',
        surname: '田中',
        given_name: '太郎',
        age: 85,
        care_level: '要介護3',
        status: '実調完了',
        assignee: '藤堂　友未枝',
        kp: '田中花子（長女）',
        kp_contact: '090-1234-5678',
        care_manager: '山田ケアマネ',
        cm_contact: '048-123-4567',
        notes: '夜間のトイレ介助が必要。家族の協力体制は良好。',
        timeline: []
      },
      {
        id: 2,
        applicationDate: '2024-12-20',
        name: '山田花子',
        surname: '山田',
        given_name: '花子',
        age: 78,
        care_level: '要介護4',
        status: '申込書受領',
        assignee: '吉野　隼人',
        kp: '山田太郎（長男）',
        kp_contact: '080-9876-5432',
        care_manager: '佐藤ケアマネ',
        cm_contact: '048-987-6543',
        timeline: []
      }
    ];
  }

  // 認証関連
  async login(username, password) {
    const response = await this.request('/auth/login', {
      method: 'POST',
      body: { username, password },
    });
    
    if (response.token) {
      this.setToken(response.token);
    }
    
    return response;
  }

  logout() {
    this.clearToken();
  }

  // 申込者関連
  async getApplicants() {
    return await this.request('/applicants');
  }

  async getApplicant(id) {
    return await this.request(`/applicants/${id}`);
  }

  async createApplicant(data) {
    return await this.request('/applicants', {
      method: 'POST',
      body: data,
    });
  }

  async updateApplicant(id, data) {
    return await this.request(`/applicants/${id}`, {
      method: 'PUT',
      body: data,
    });
  }

  async deleteApplicant(id) {
    return await this.request(`/applicants/${id}`, {
      method: 'DELETE',
    });
  }

  // 投稿関連
  async createPost(applicantId, content, action = null, parentPostId = null) {
    return await this.request(`/applicants/${applicantId}/posts`, {
      method: 'POST',
      body: { content, action, parentPostId },
    });
  }

  // WebSocket関連
  connectSocket() {
    if (this.socket && this.socket.connected) {
      return;
    }

    this.socket = io();
    
    this.socket.on('connect', () => {
      console.log('WebSocketに接続しました');
      if (this.token) {
        this.socket.emit('authenticate', this.token);
      }
    });

    this.socket.on('disconnect', () => {
      console.log('WebSocketから切断されました');
    });

    this.socket.on('authError', (message) => {
      console.error('認証エラー:', message);
    });

    // リアルタイム同期イベント
    this.socket.on('newPost', (post) => {
      if (this.eventHandlers.newPost) {
        this.eventHandlers.newPost(post);
      }
    });

    this.socket.on('statusUpdate', (data) => {
      if (this.eventHandlers.statusUpdate) {
        this.eventHandlers.statusUpdate(data);
      }
    });

    this.socket.on('newApplicant', (data) => {
      if (this.eventHandlers.newApplicant) {
        this.eventHandlers.newApplicant(data);
      }
    });

    this.socket.on('applicantUpdate', (data) => {
      if (this.eventHandlers.applicantUpdate) {
        this.eventHandlers.applicantUpdate(data);
      }
    });

    return this.socket;
  }

  disconnectSocket() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  joinApplicantPage(applicantId) {
    if (this.socket) {
      this.socket.emit('joinApplicant', applicantId);
    }
  }

  leaveApplicantPage(applicantId) {
    if (this.socket) {
      this.socket.emit('leaveApplicant', applicantId);
    }
  }

  on(event, handler) {
    this.eventHandlers[event] = handler;
  }

  off(event) {
    delete this.eventHandlers[event];
  }
}

// グローバルに利用可能にする
window.apiClient = new APIClient();