// Supabase APIクライアント
// Supabaseクライアントをグローバルスコープで初期化（リアルタイム機能用）
const supabaseClient = window.supabase.createClient(
  SUPABASE_CONFIG.url,
  SUPABASE_CONFIG.anonKey
);

const createSupabaseApiClient = () => {
  // グローバルのsupabaseClientを使用
  const supabase = supabaseClient;

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

    /**
     * ログイン処理（名前ベース認証）
     * ユーザー名とパスワードで認証し、ユーザー情報とトークンを返す
     * @param {string} nameInput - ユーザー名
     * @param {string} password - パスワード
     * @returns {Promise<{token: string, user: object}>} トークンとユーザー情報
     */
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
        '田中　慎治': 'admin3',
        '岡　和宏': 'admin4'
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
      // WebSocket接続（Supabaseはリアルタイム対応）
    },

    disconnectSocket() {
      // WebSocket切断
    },

    on(event, callback) {},
    off(event) {},

    /**
     * 申込者一覧を取得
     * 全申込者データとタイムライン投稿（返信含む）を取得
     * @returns {Promise<Array>} 申込者一覧（タイムラインデータを含む）
     */
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
                const { data: repliesData, error: repliesError } = await supabase
                  .from('timeline_posts')
                  .select('*')
                  .eq('parent_post_id', post.id)
                  .order('created_at', { ascending: true });

                // 返信にもtimestampを追加
                const replies = (repliesData || []).map(reply => ({
                  ...reply,
                  timestamp: reply.created_at
                }));

                return {
                  ...post,
                  timestamp: post.created_at,
                  replies: replies
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
              lastUpdatedBy: applicant.last_updated_by || '',
              lastUpdatedAt: applicant.last_updated_at || applicant.updated_at || applicant.application_date,
              applicationDate: applicant.application_date,
              gender: applicant.gender || '',
              roomNumber: applicant.room_number || '',
              moveInDate: applicant.move_in_date || '',
              municipality: applicant.municipality || '',
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

    /**
     * 申込者を作成
     * 新規申込者をデータベースに登録し、初期タイムライン投稿を作成
     * @param {object} data - 申込者データ
     * @returns {Promise<object>} 作成された申込者データ
     */
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
          application_date: data.applicationDate
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

    /**
     * 申込者情報を更新
     * @param {number} id - 申込者ID
     * @param {object} data - 更新する申込者データ
     * @returns {Promise<object>} 更新後の申込者データ
     */
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
          application_date: data.applicationDate,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;

      return await this.getApplicant(id);
    },

    /**
     * 申込者を削除
     * @param {number} id - 申込者ID
     */
    async deleteApplicant(id) {
      const { error } = await supabase
        .from('applicants')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },

    /**
     * 投稿内容を更新
     * @param {number} applicantId - 申込者ID（未使用、互換性のため保持）
     * @param {number} postId - 投稿ID
     * @param {string} content - 更新後の投稿内容
     * @returns {Promise<{message: string}>} 更新メッセージ
     */
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

    /**
     * 投稿を削除
     * 削除後、申込者のステータスを再計算（最新のstatus付き投稿から取得）
     * @param {number} applicantId - 申込者ID
     * @param {number} postId - 投稿ID
     * @returns {Promise<{message: string}>} 削除メッセージ
     */
    async deletePost(applicantId, postId) {
      const { error } = await supabase
        .from('timeline_posts')
        .delete()
        .eq('id', postId);

      if (error) throw error;

      // 削除後、この申込者の最新のstatusを取得して更新
      const { data: latestPost } = await supabase
        .from('timeline_posts')
        .select('status')
        .eq('applicant_id', applicantId)
        .not('status', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      // 最新のstatusが見つかった場合は申込者のstatusを更新
      if (latestPost && latestPost.status) {
        await supabase
          .from('applicants')
          .update({ status: latestPost.status })
          .eq('id', applicantId);
      } else {
        // statusのある投稿がない場合は、statusをクリア
        await supabase
          .from('applicants')
          .update({ status: null })
          .eq('id', applicantId);
      }

      return { message: '投稿が削除されました' };
    },

    /**
     * タイムライン投稿を作成
     * 新規投稿または返信を作成し、actionがある場合はstatusも設定
     * 申込者のlast_updated_by、last_updated_at、statusを更新
     * @param {number} applicantId - 申込者ID
     * @param {string} author - 投稿者名
     * @param {string} content - 投稿内容
     * @param {string|null} action - アクション（申込書受領、実調完了など）
     * @param {number|null} parentPostId - 親投稿ID（返信の場合）
     * @param {string|null} postDate - 投稿日付（YYYY-MM-DD形式）
     * @returns {Promise<object>} 作成された投稿データ
     */
    async createTimelinePost(applicantId, author, content, action = null, parentPostId = null, postDate = null) {
      // ステータスマッピング
      const statusMapping = {
        '相談受付中': '相談受付中',
        '申込書受領': '申込書受領',
        '実調日程調整中': '実調日程調整中',
        '実調完了': '実調完了',
        '健康診断書依頼': '健康診断書待ち',
        '健康診断書受領': '健康診断書受領',
        '判定会議中': '判定会議中',
        '入居決定': '入居決定',
        '入居不可': '入居不可',
        '入居日調整中': '入居日調整中',
        '書類送付済': '書類送付済',
        '入居準備完了': '入居準備完了',
        '入居完了': '入居完了',
        'キャンセル': 'キャンセル'
      };

      // actionがある場合はstatusもマッピング
      const status = action ? statusMapping[action] : null;

      const { data, error } = await supabase
        .from('timeline_posts')
        .insert([{
          applicant_id: applicantId,
          author: author,
          content: content,
          action: action,
          status: status,
          parent_post_id: parentPostId,
          post_date: postDate || new Date().toISOString().split('T')[0]
        }])
        .select()
        .single();

      if (error) throw error;

      // 申込者のlast_updated_byとlast_updated_atを更新
      const updateData = {
        last_updated_by: author,
        last_updated_at: new Date().toISOString()
      };

      // ステータス更新が必要な場合
      if (status) {
        updateData.status = status;
      }

      // 申込者情報を更新
      await supabase
        .from('applicants')
        .update(updateData)
        .eq('id', applicantId);

      return data;
    },

    /**
     * いいねを追加
     * @param {number} userId - ユーザーID
     * @param {number} postId - 投稿ID
     * @returns {Promise<object>} 作成されたいいねデータ
     */
    async addLike(userId, postId) {
      const { data, error } = await supabase
        .from('likes')
        .insert([{
          user_id: userId,
          post_id: postId
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },

    /**
     * いいねを削除
     * @param {number} userId - ユーザーID
     * @param {number} postId - 投稿ID
     */
    async removeLike(userId, postId) {
      const { error } = await supabase
        .from('likes')
        .delete()
        .eq('user_id', userId)
        .eq('post_id', postId);

      if (error) throw error;
    },

    /**
     * 投稿のいいね一覧を取得
     * @param {number} postId - 投稿ID
     * @returns {Promise<Array>} いいね一覧
     */
    async getLikes(postId) {
      const { data, error } = await supabase
        .from('likes')
        .select('*')
        .eq('post_id', postId);

      if (error) throw error;
      return data || [];
    },

    // ユーザーがいいねしたか確認
    async checkLike(userId, postId) {
      const { data, error } = await supabase
        .from('likes')
        .select('*')
        .eq('user_id', userId)
        .eq('post_id', postId)
        .single();

      if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows returned
      return !!data;
    },

    /**
     * 統計データを取得
     * @returns {Promise<Object>} 統計データ
     */
    async getStatistics() {
      try {
        const { data: applicants, error } = await supabase
          .from('applicants')
          .select('*')
          .order('id');

        if (error) throw error;

        // 基本統計
        const totalCount = applicants.length;
        const completedCount = applicants.filter(a => a.status === '入居完了').length;
        const cancelledCount = applicants.filter(a => a.status === 'キャンセル').length;
        const averageAge = totalCount > 0
          ? Math.round(applicants.reduce((sum, a) => sum + a.age, 0) / totalCount * 10) / 10
          : 0;

        // 市区町村別分布
        const municipalityDistribution = {};
        applicants.forEach(a => {
          const mun = a.municipality || 'その他';
          municipalityDistribution[mun] = (municipalityDistribution[mun] || 0) + 1;
        });

        // 要介護度別分布
        const careLevelDistribution = {};
        applicants.forEach(a => {
          const level = a.care_level || '不明';
          careLevelDistribution[level] = (careLevelDistribution[level] || 0) + 1;
        });

        // ステータス別分布
        const statusDistribution = {};
        applicants.forEach(a => {
          const status = a.status || '不明';
          statusDistribution[status] = (statusDistribution[status] || 0) + 1;
        });

        // 年齢分布（10歳刻み）
        const ageDistribution = {
          '70歳未満': 0,
          '70-79歳': 0,
          '80-89歳': 0,
          '90歳以上': 0
        };
        applicants.forEach(a => {
          if (a.age < 70) ageDistribution['70歳未満']++;
          else if (a.age < 80) ageDistribution['70-79歳']++;
          else if (a.age < 90) ageDistribution['80-89歳']++;
          else ageDistribution['90歳以上']++;
        });

        // 性別分布
        const genderDistribution = {};
        applicants.forEach(a => {
          const gender = a.gender || '不明';
          genderDistribution[gender] = (genderDistribution[gender] || 0) + 1;
        });

        // 月別申込数
        const monthlyApplications = {};
        applicants.forEach(a => {
          if (a.application_date) {
            const month = a.application_date.substring(0, 7);
            monthlyApplications[month] = (monthlyApplications[month] || 0) + 1;
          }
        });

        // 月別入居数
        const monthlyMoveIns = {};
        applicants.forEach(a => {
          if (a.move_in_date) {
            const month = a.move_in_date.substring(0, 7);
            monthlyMoveIns[month] = (monthlyMoveIns[month] || 0) + 1;
          }
        });

        return {
          summary: {
            totalCount,
            completedCount,
            cancelledCount,
            averageAge,
            femaleRatio: genderDistribution['女']
              ? Math.round(genderDistribution['女'] / totalCount * 1000) / 10
              : 0
          },
          municipalityDistribution,
          careLevelDistribution,
          statusDistribution,
          ageDistribution,
          genderDistribution,
          monthlyApplications,
          monthlyMoveIns
        };
      } catch (error) {
        console.error('統計データ取得エラー:', error);
        return null;
      }
    }
  };
};
