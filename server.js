require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

// データベース選択
const db = process.env.DB_TYPE === 'postgres' 
  ? require('./database/postgres-db')
  : require('./database/db');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'shinchoku-secret-key-2024';

// ミドルウェア
// 本番環境でHTTPSを強制
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https') {
      res.redirect(`https://${req.header('host')}${req.url}`);
    } else {
      next();
    }
  });
}

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname)));

// JWTトークン検証ミドルウェア
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'アクセストークンが必要です' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: '無効なトークンです' });
    }
    req.user = user;
    next();
  });
};

// ========== 認証エンドポイント ==========

// ログイン
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'ユーザー名とパスワードが必要です' });
    }

    const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
    
    if (!user) {
      return res.status(401).json({ error: 'ユーザーが見つかりません' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!isValidPassword) {
      return res.status(401).json({ error: 'パスワードが正しくありません' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, name: user.name },
      JWT_SECRET,
      { expiresIn: '2h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name
      }
    });
  } catch (error) {
    console.error('ログインエラー:', error);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

// ========== 申込者管理エンドポイント ==========

// 申込者一覧取得
app.get('/api/applicants', authenticateToken, async (req, res) => {
  try {
    const applicants = await db.all(`
      SELECT id, surname, given_name, age, care_level, address, kp, kp_relationship,
             kp_contact, kp_address, care_manager, care_manager_name, cm_contact,
             assignee, notes, status, application_date, gender, room_number, move_in_date, municipality,
             (surname || '　' || given_name) as name
      FROM applicants
      ORDER BY application_date DESC
    `);

    res.json(applicants);
  } catch (error) {
    console.error('申込者一覧取得エラー:', error);
    res.status(500).json({ error: 'データの取得に失敗しました' });
  }
});

// 申込者詳細取得
app.get('/api/applicants/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const applicant = await db.get(`
      SELECT *, (surname || '　' || given_name) as name 
      FROM applicants WHERE id = ?
    `, [id]);

    if (!applicant) {
      return res.status(404).json({ error: '申込者が見つかりません' });
    }

    // タイムライン投稿を取得
    const posts = await db.all(`
      SELECT id, author, content, action, created_at,
             datetime(created_at, 'localtime') as timestamp
      FROM timeline_posts 
      WHERE applicant_id = ? AND parent_post_id IS NULL
      ORDER BY created_at DESC
    `, [id]);

    // 各投稿の返信を取得
    for (let post of posts) {
      const replies = await db.all(`
        SELECT id, author, content, created_at,
               datetime(created_at, 'localtime') as timestamp
        FROM timeline_posts 
        WHERE parent_post_id = ?
        ORDER BY created_at ASC
      `, [post.id]);
      post.replies = replies;
    }

    applicant.timeline = posts;
    res.json(applicant);
  } catch (error) {
    console.error('申込者詳細取得エラー:', error);
    res.status(500).json({ error: 'データの取得に失敗しました' });
  }
});

// 住所から市区町村を抽出する関数
function extractMunicipality(address) {
  if (!address) return null;

  // 市区町村のパターンマッチング
  const patterns = [
    /([^都道府県]{2,3}[都道府県])([^市区町村]+[市区町村])/,  // 東京都中央区
    /([^都道府県]+[都道府県])([^市]+[市])/,  // さいたま市
    /さいたま市([^区]+区)/,  // さいたま市○○区
    /([^都道府県]+[都道府県])([^郡]+郡[^町村]+[町村])/,  // 郡部
  ];

  for (const pattern of patterns) {
    const match = address.match(pattern);
    if (match) {
      if (address.includes('さいたま市')) {
        // さいたま市の場合は区まで含める
        const wardMatch = address.match(/さいたま市([^区]+区)/);
        if (wardMatch) {
          return `さいたま市${wardMatch[1]}`;
        }
        return 'さいたま市';
      }
      return match[1] + match[2];
    }
  }

  return null;
}

// 申込者新規作成
app.post('/api/applicants', authenticateToken, async (req, res) => {
  try {
    const {
      surname, givenName, age, careLevel, address, kp, kpRelationship,
      kpContact, kpAddress, careManager, careManagerName, cmContact,
      assignee, notes, gender, roomNumber, moveInDate
    } = req.body;

    if (!surname || !givenName || !age || !careLevel) {
      return res.status(400).json({ error: '必須項目が不足しています' });
    }

    // 住所から市区町村を自動抽出
    const municipality = extractMunicipality(address);

    const dateFunc = process.env.DB_TYPE === 'postgres' ? 'CURRENT_DATE' : "DATE('now')";
    const result = await db.run(`
      INSERT INTO applicants (
        surname, given_name, age, care_level, address, kp, kp_relationship,
        kp_contact, kp_address, care_manager, care_manager_name, cm_contact,
        assignee, notes, gender, room_number, move_in_date, municipality, application_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${dateFunc}) RETURNING id
    `, [
      surname, givenName, age, careLevel, address, kp, kpRelationship,
      kpContact, kpAddress, careManager, careManagerName, cmContact,
      assignee || '担当者未定', notes, gender, roomNumber, moveInDate, municipality
    ]);

    // リアルタイム同期: 新規申込者をすべてのクライアントに通知
    io.emit('newApplicant', {
      id: result.id,
      name: `${surname}　${givenName}`,
      addedBy: req.user.name
    });

    res.status(201).json({ id: result.id, message: '申込者が登録されました' });
  } catch (error) {
    console.error('申込者作成エラー:', error);
    res.status(500).json({ error: 'データの作成に失敗しました' });
  }
});

// 申込者更新
app.put('/api/applicants/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      surname, givenName, age, careLevel, address, kp, kpRelationship,
      kpContact, kpAddress, careManager, careManagerName, cmContact,
      assignee, notes, gender, roomNumber, moveInDate
    } = req.body;

    if (!surname || !givenName || !age || !careLevel) {
      return res.status(400).json({ error: '必須項目が不足しています' });
    }

    // 住所から市区町村を自動抽出
    const municipality = extractMunicipality(address);

    const result = await db.run(`
      UPDATE applicants SET
        surname = ?, given_name = ?, age = ?, care_level = ?, address = ?,
        kp = ?, kp_relationship = ?, kp_contact = ?, kp_address = ?,
        care_manager = ?, care_manager_name = ?, cm_contact = ?,
        assignee = ?, notes = ?, gender = ?, room_number = ?, move_in_date = ?,
        municipality = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      surname, givenName, age, careLevel, address, kp, kpRelationship,
      kpContact, kpAddress, careManager, careManagerName, cmContact,
      assignee, notes, gender, roomNumber, moveInDate, municipality, id
    ]);

    if (result.changes === 0) {
      return res.status(404).json({ error: '申込者が見つかりません' });
    }

    // リアルタイム同期: 申込者情報更新をすべてのクライアントに通知
    io.emit('applicantUpdate', {
      applicantId: id,
      name: `${surname}　${givenName}`,
      updatedBy: req.user.name
    });

    res.json({ message: '申込者情報が更新されました' });
  } catch (error) {
    console.error('申込者更新エラー:', error);
    res.status(500).json({ error: 'データの更新に失敗しました' });
  }
});

// 入居日更新エンドポイント（専用・軽量）
app.put('/api/applicants/:id/move-in-date', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { move_in_date } = req.body;

    if (!move_in_date) {
      return res.status(400).json({ error: '入居日が指定されていません' });
    }

    const result = await db.run(
      'UPDATE applicants SET move_in_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [move_in_date, id]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: '申込者が見つかりません' });
    }

    // リアルタイム同期: 入居日更新をすべてのクライアントに通知
    io.emit('applicantUpdate', {
      applicantId: id,
      move_in_date: move_in_date,
      updatedBy: req.user.name
    });

    res.json({ message: '入居日が更新されました', move_in_date });
  } catch (error) {
    console.error('入居日更新エラー:', error);
    res.status(500).json({ error: '入居日の更新に失敗しました' });
  }
});

// 申込者削除
app.delete('/api/applicants/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.run('DELETE FROM applicants WHERE id = ?', [id]);

    if (result.changes === 0) {
      return res.status(404).json({ error: '申込者が見つかりません' });
    }

    res.json({ message: '申込者が削除されました' });
  } catch (error) {
    console.error('申込者削除エラー:', error);
    res.status(500).json({ error: 'データの削除に失敗しました' });
  }
});

// 統計データ取得
app.get('/api/statistics', authenticateToken, async (req, res) => {
  try {
    // 全申込者データを取得
    const applicants = await db.all('SELECT * FROM applicants ORDER BY id');

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

    // 月別申込数（過去12ヶ月）
    const monthlyApplications = {};
    applicants.forEach(a => {
      if (a.application_date) {
        const month = a.application_date.substring(0, 7); // YYYY-MM
        monthlyApplications[month] = (monthlyApplications[month] || 0) + 1;
      }
    });

    // 月別入居数（過去12ヶ月）
    const monthlyMoveIns = {};
    applicants.forEach(a => {
      if (a.move_in_date) {
        const month = a.move_in_date.substring(0, 7); // YYYY-MM
        monthlyMoveIns[month] = (monthlyMoveIns[month] || 0) + 1;
      }
    });

    res.json({
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
    });
  } catch (error) {
    console.error('統計データ取得エラー:', error);
    res.status(500).json({ error: '統計データの取得に失敗しました' });
  }
});

// ========== 共通関数 ==========

// 申込者の進捗ステータスを再計算する関数
async function recalculateApplicantStatus(applicantId) {
  try {
    // 最新のaction付き投稿を取得（親投稿・返信の両方を含む）
    const latestActionPost = await db.get(`
      SELECT action FROM timeline_posts
      WHERE applicant_id = ? AND action IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 1
    `, [applicantId]);

    if (latestActionPost && latestActionPost.action) {
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

      const newStatus = statusMapping[latestActionPost.action];
      if (newStatus) {
        await db.run('UPDATE applicants SET status = ? WHERE id = ?', [newStatus, applicantId]);

        // リアルタイム同期: ステータス更新をすべてのクライアントに通知
        io.emit('statusUpdate', {
          applicantId: applicantId,
          status: newStatus,
          updatedBy: 'システム'
        });

        return newStatus;
      }
    }

    return null;
  } catch (error) {
    console.error('進捗ステータス再計算エラー:', error);
    return null;
  }
}

// ========== タイムライン投稿エンドポイント ==========

// 投稿編集
app.put('/api/applicants/:applicantId/posts/:postId', authenticateToken, async (req, res) => {
  try {
    const { applicantId, postId } = req.params;
    const { content } = req.body;
    const currentUser = req.user.name;

    if (!content) {
      return res.status(400).json({ error: '投稿内容が必要です' });
    }

    // 投稿の存在確認と作成者チェック
    const post = await db.get('SELECT * FROM timeline_posts WHERE id = ? AND applicant_id = ?', [postId, applicantId]);
    
    if (!post) {
      return res.status(404).json({ error: '投稿が見つかりません' });
    }

    if (post.author !== currentUser) {
      return res.status(403).json({ error: '他のユーザーの投稿は編集できません' });
    }

    await db.run('UPDATE timeline_posts SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [content, postId]);

    // 進捗ステータスを再計算
    await recalculateApplicantStatus(applicantId);

    res.json({ message: '投稿が更新されました' });
  } catch (error) {
    console.error('投稿編集エラー:', error);
    res.status(500).json({ error: '投稿の更新に失敗しました' });
  }
});

// 投稿削除
app.delete('/api/applicants/:applicantId/posts/:postId', authenticateToken, async (req, res) => {
  try {
    const { applicantId, postId } = req.params;
    const currentUser = req.user.name;

    // 投稿の存在確認と作成者チェック
    const post = await db.get('SELECT * FROM timeline_posts WHERE id = ? AND applicant_id = ?', [postId, applicantId]);
    
    if (!post) {
      return res.status(404).json({ error: '投稿が見つかりません' });
    }

    if (post.author !== currentUser) {
      return res.status(403).json({ error: '他のユーザーの投稿は削除できません' });
    }

    await db.run('DELETE FROM timeline_posts WHERE id = ?', [postId]);

    // 進捗ステータスを再計算
    await recalculateApplicantStatus(applicantId);

    res.json({ message: '投稿が削除されました' });
  } catch (error) {
    console.error('投稿削除エラー:', error);
    res.status(500).json({ error: '投稿の削除に失敗しました' });
  }
});

// 投稿作成
app.post('/api/applicants/:id/posts', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { content, action, parentPostId } = req.body;
    const author = req.user.name;

    if (!content) {
      return res.status(400).json({ error: '投稿内容が必要です' });
    }

    const result = await db.run(`
      INSERT INTO timeline_posts (applicant_id, author, content, action, parent_post_id)
      VALUES (?, ?, ?, ?, ?) RETURNING id
    `, [id, author, content, action, parentPostId || null]);

    // ステータス更新ロジック
    if (action && !parentPostId) {
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

      if (statusMapping[action]) {
        await db.run('UPDATE applicants SET status = ? WHERE id = ?', [statusMapping[action], id]);
        
        // リアルタイム同期: ステータス更新をすべてのクライアントに通知
        io.emit('statusUpdate', {
          applicantId: id,
          status: statusMapping[action],
          updatedBy: author
        });
      }
    }

    // リアルタイム同期: 新しい投稿をすべてのクライアントに通知
    const newPost = {
      id: result.id,
      applicant_id: id,
      author,
      content,
      action,
      parent_post_id: parentPostId || null,
      created_at: new Date().toISOString(),
      timestamp: new Date().toLocaleString('ja-JP')
    };
    
    io.emit('newPost', newPost);

    res.status(201).json({ id: result.id, message: '投稿が作成されました' });
  } catch (error) {
    console.error('投稿作成エラー:', error);
    res.status(500).json({ error: '投稿の作成に失敗しました' });
  }
});

// 静的ファイル提供（フロントエンド）
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 免責事項ページ
app.get('/disclaimer.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'disclaimer.html'));
});

// プライバシーポリシーページ
app.get('/privacy.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'privacy.html'));
});

// 著作権・クレジットページ
app.get('/credits.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'credits.html'));
});

// WebSocket接続管理
io.on('connection', (socket) => {
  console.log('クライアントが接続しました:', socket.id);

  // ユーザー認証
  socket.on('authenticate', (token) => {
    try {
      const user = jwt.verify(token, JWT_SECRET);
      socket.user = user;
      socket.join('authenticated');
      console.log(`ユーザー ${user.name} が認証されました`);
    } catch (err) {
      socket.emit('authError', '認証に失敗しました');
    }
  });

  // 特定の申込者の詳細ページに参加
  socket.on('joinApplicant', (applicantId) => {
    socket.join(`applicant_${applicantId}`);
    console.log(`ユーザーが申込者 ${applicantId} のページに参加しました`);
  });

  // 申込者ページから離脱
  socket.on('leaveApplicant', (applicantId) => {
    socket.leave(`applicant_${applicantId}`);
    console.log(`ユーザーが申込者 ${applicantId} のページから離脱しました`);
  });

  socket.on('disconnect', () => {
    console.log('クライアントが切断されました:', socket.id);
  });
});

// パスワード変更エンドポイント
app.post('/api/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    // 現在のパスワード確認
    const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);

    if (!user) {
      return res.status(404).json({ error: 'ユーザーが見つかりません' });
    }

    const isValid = await bcrypt.compare(currentPassword, user.password_hash);

    if (!isValid) {
      return res.status(401).json({ error: '現在のパスワードが正しくありません' });
    }

    // パスワード強度チェック
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'パスワードは8文字以上である必要があります' });
    }

    // 新しいパスワードをハッシュ化して保存
    const newHash = await bcrypt.hash(newPassword, 10);
    await db.run(
      'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newHash, userId]
    );

    res.json({ message: 'パスワードを変更しました' });
  } catch (error) {
    console.error('パスワード変更エラー:', error);
    res.status(500).json({ error: 'パスワード変更に失敗しました' });
  }
});

// サーバー起動
async function startServer() {
  try {
    await db.init();
    server.listen(PORT, () => {
      console.log(`サーバーがポート ${PORT} で起動しました`);
      console.log(`http://localhost:${PORT} でアクセスできます`);
      console.log('WebSocket接続も有効です');
    });
  } catch (error) {
    console.error('サーバー起動エラー:', error);
    process.exit(1);
  }
}

// graceful shutdown
process.on('SIGINT', () => {
  console.log('\nサーバーを停止しています...');
  db.close();
  process.exit(0);
});

startServer();