// Supabase APIクライアント
const createSupabaseApiClient = () => {
  // Supabaseクライアントを初期化
  const supabase = window.supabase.createClient(
    SUPABASE_CONFIG.url,
    SUPABASE_CONFIG.anonKey
  );

  return {
    socket: null,
    token: null,
    currentUser: null,

    setToken(token) {
      this.token = token;
    },

    clearToken() {
      this.token = null;
      this.currentUser = null;
    },

    // ログイン（名前ベース）
    async login(nameInput, password) {
      // ユーザー情報を名前で取得
      const { data: users, error } = await supabase
        .from('users')
        .select('*')
        .eq('name', nameInput)
        .single();

      if (error || !users) {
        throw new Error('ユーザーIDまたはパスワードが正しくありません');
      }

      // パスワードのマッピング（元の仕様に合わせる）
      const passwordMapping = {
        '藤堂　友未枝': 'admin1',
        '吉野　隼人': 'admin2',
        '田中　慎治': 'admin3'
      };

      if (passwordMapping[users.name] !== password) {
        throw new Error('ユーザーIDまたはパスワードが正しくありません');
      }

      this.currentUser = users;
      this.token = 'dummy-token-' + users.id;

      return {
        token: this.token,
        user: {
          id: users.id,
          username: users.username,
          name: users.name
        }
      };
    },

    connectSocket() {
      console.log('WebSocket接続（Supabaseはリアルタイム対応）');
    },

    disconnectSocket() {
      console.log('WebSocket切断');
    },

    on(event, callback) {},
    off(event) {},

    // 申込者一覧を取得
    async getApplicants() {
      try {
        const { data: applicantsData, error: applicantsError } = await supabase
          .from('applicants')
          .select('*')
          .order('application_date', { ascending: false });

        if (applicantsError) throw applicantsError;

        // 各申込者のタイムライン投稿を取得
        const applicantsWithTimeline = await Promise.all(
          (applicantsData || []).map(async (applicant) => {
            const { data: timelineData, error: timelineError } = await supabase
              .from('timeline_posts')
              .select('*')
              .eq('applicant_id', applicant.id)
              .is('parent_post_id', null)
              .order('created_at', { ascending: false });

            // 各投稿の返信を取得
            const timelineWithReplies = await Promise.all(
              (timelineData || []).map(async (post) => {
                const { data: replies, error: repliesError } = await supabase
                  .from('timeline_posts')
                  .select('*')
                  .eq('parent_post_id', post.id)
                  .order('created_at', { ascending: true });

                return {
                  ...post,
                  timestamp: post.created_at,
                  replies: replies || []
                };
              })
            );

            return {
              id: applicant.id,
              name: `${applicant.surname}　${applicant.given_name}`,
              age: applicant.age,
              careLevel: applicant.care_level,
              address: applicant.address || '',
              kp: applicant.kp || '',
              kpRelationship: applicant.kp_relationship || '',
              kpContact: applicant.kp_contact || '',
              kpAddress: applicant.kp_address || '',
              careManager: applicant.care_manager || '',
              careManagerName: applicant.care_manager_name || '',
              cmContact: applicant.cm_contact || '',
              assignee: applicant.assignee || '',
              notes: applicant.notes || '',
              status: applicant.status,
              applicationDate: applicant.application_date,
              timeline: timelineWithReplies
            };
          })
        );

        return applicantsWithTimeline;
      } catch (error) {
        console.error('Failed to load applicants:', error);
        return [];
      }
    },

    // 申込者を1件取得
    async getApplicant(id) {
      const applicants = await this.getApplicants();
      return applicants.find(a => a.id == id);
    },

    // 申込者を作成
    async createApplicant(data) {
      const { data: newApplicant, error } = await supabase
        .from('applicants')
        .insert([{
          surname: data.surname,
          given_name: data.givenName,
          age: data.age,
          care_level: data.careLevel,
          address: data.address || '',
          kp: data.kp || '',
          kp_relationship: data.kpRelationship || '',
          kp_contact: data.kpContact || '',
          kp_address: data.kpAddress || '',
          care_manager: data.careManager || '',
          care_manager_name: data.careManagerName || '',
          cm_contact: data.cmContact || '',
          assignee: data.assignee || '担当者未定',
          notes: data.notes || '',
          status: '申込受付',
          application_date: new Date().toISOString().split('T')[0]
        }])
        .select()
        .single();

      if (error) throw error;

      // 初期タイムライン投稿を作成
      await supabase
        .from('timeline_posts')
        .insert([{
          applicant_id: newApplicant.id,
          author: '自動',
          content: '申込を受け付けました',
          action: null
        }]);

      return await this.getApplicant(newApplicant.id);
    },

    // 申込者を更新
    async updateApplicant(id, data) {
      const { error } = await supabase
        .from('applicants')
        .update({
          surname: data.surname,
          given_name: data.givenName,
          age: data.age,
          care_level: data.careLevel,
          address: data.address || '',
          kp: data.kp || '',
          kp_relationship: data.kpRelationship || '',
          kp_contact: data.kpContact || '',
          kp_address: data.kpAddress || '',
          care_manager: data.careManager || '',
          care_manager_name: data.careManagerName || '',
          cm_contact: data.cmContact || '',
          assignee: data.assignee,
          notes: data.notes || '',
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;

      return await this.getApplicant(id);
    },

    // 申込者を削除
    async deleteApplicant(id) {
      const { error } = await supabase
        .from('applicants')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },

    // 投稿を更新
    async updatePost(applicantId, postId, content) {
      const { error } = await supabase
        .from('timeline_posts')
        .update({
          content: content,
          updated_at: new Date().toISOString()
        })
        .eq('id', postId);

      if (error) throw error;

      return { message: '投稿が更新されました' };
    },

    // 投稿を削除
    async deletePost(applicantId, postId) {
      const { error } = await supabase
        .from('timeline_posts')
        .delete()
        .eq('id', postId);

      if (error) throw error;

      return { message: '投稿が削除されました' };
    },

    // タイムライン投稿を作成
    async createTimelinePost(applicantId, author, content, action = null, parentPostId = null) {
      const { data, error } = await supabase
        .from('timeline_posts')
        .insert([{
          applicant_id: applicantId,
          author: author,
          content: content,
          action: action,
          parent_post_id: parentPostId
        }])
        .select()
        .single();

      if (error) throw error;

      // ステータス更新が必要な場合
      if (action) {
        const statusMapping = {
          '申込書受領': '申込書受領',
          '実調日程調整中': '実調日程調整中',
          '実調完了': '実調完了',
          '健康診断書依頼': '健康診断書待ち',
          '健康診断書受領': '健康診断書受領',
          '判定会議中': '判定会議中',
          '入居決定': '入居決定',
          '入居日調整中': '入居日調整中',
          '書類送付済': '書類送付済',
          '入居準備完了': '入居準備完了',
          '入居完了': '入居完了'
        };

        const newStatus = statusMapping[action];
        if (newStatus) {
          await supabase
            .from('applicants')
            .update({ status: newStatus })
            .eq('id', applicantId);
        }
      }

      return data;
    }
  };
};
