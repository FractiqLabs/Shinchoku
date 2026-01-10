require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// データベース選択
const db = process.env.DB_TYPE === 'postgres' 
  ? require('./database/postgres-db')
  : require('./database/db');

const app = express();
const server = http.createServer(app);

// CORS設定：環境変数で制御可能
// 本番環境ではALLOWED_ORIGINSに許可するオリジンをカンマ区切りで設定
// 例: ALLOWED_ORIGINS=https://example.com,https://app.example.com
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : (process.env.NODE_ENV === 'production' ? [] : ['*']); // 開発環境では全許可

const io = socketIo(server, {
  cors: {
    origin: allowedOrigins.includes('*') ? '*' : allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  }
});

const PORT = process.env.PORT || 3001;

// JWT_SECRETは必須（本番環境では必ず設定すること）
let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('❌ エラー: JWT_SECRET環境変数が設定されていません');
  console.error('本番環境では必ず強力なJWT_SECRETを設定してください');
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
  // 開発環境では警告のみ（後方互換性のため）
  console.warn('⚠️  警告: 開発環境ではデフォルト値を使用します（本番環境では使用しないでください）');
  JWT_SECRET = 'shinchoku-secret-key-2024-dev-only';
}

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

// セキュリティヘッダーの設定（helmet）
app.use(helmet({
  contentSecurityPolicy: false, // Reactアプリとの互換性のため無効化
  crossOriginEmbedderPolicy: false // 外部リソースとの互換性のため無効化
}));

// CORS設定
app.use(cors({
  origin: (origin, callback) => {
    // 開発環境またはoriginが未指定（Postman等）の場合は許可
    if (!origin || process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    // 本番環境では許可リストをチェック
    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS policy: Origin not allowed'));
    }
  },
  credentials: true
}));

// レート制限設定（ブルートフォース攻撃対策）
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分
  max: 5, // 15分間に5回まで
  message: { error: 'ログイン試行回数が多すぎます。15分後に再度お試しください。' },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1分
  max: 100, // 1分間に100リクエストまで（通常の使用には影響しない）
  message: { error: 'リクエストが多すぎます。しばらく待ってから再度お試しください。' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname)));

// ログインエンドポイントにレート制限を適用
app.use('/api/auth/login', loginLimiter);

// その他のAPIエンドポイントにレート制限を適用
app.use('/api/', apiLimiter);

// 入力検証ヘルパー関数
const validateId = (id) => {
  const numId = parseInt(id, 10);
  return !isNaN(numId) && numId > 0 && numId.toString() === id.toString();
};

const validateAge = (age) => {
  const numAge = parseInt(age, 10);
  return !isNaN(numAge) && numAge >= 0 && numAge <= 150;
};

const sanitizeString = (str, maxLength = 1000) => {
  if (typeof str !== 'string') return null;
  // 制御文字を除去（改行・タブは許可）
  const sanitized = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  return sanitized.length > maxLength ? sanitized.substring(0, maxLength) : sanitized;
};

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
    let { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'ユーザー名とパスワードが必要です' });
    }

    // 入力検証とサニタイズ
    username = sanitizeString(username, 50);
    if (!username) {
      return res.status(400).json({ error: 'ユーザー名が無効です' });
    }

    // パスワードの長さチェック（最小8文字、最大100文字）
    if (typeof password !== 'string' || password.length < 8 || password.length > 100) {
      return res.status(400).json({ error: 'パスワードが無効です' });
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
    // 本番環境では詳細なエラー情報をログに出力しない（セキュリティ対策）
    if (process.env.NODE_ENV === 'production') {
      console.error('ログインエラーが発生しました');
    } else {
      console.error('ログインエラー:', error);
    }
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
    
    // ID検証
    if (!validateId(id)) {
      return res.status(400).json({ error: '無効なIDです' });
    }
    
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
    let {
      surname, givenName, age, careLevel, address, kp, kpRelationship,
      kpContact, kpAddress, careManager, careManagerName, cmContact,
      assignee, notes, gender, roomNumber, moveInDate
    } = req.body;

    // 必須項目チェック
    if (!surname || !givenName || !age || !careLevel) {
      return res.status(400).json({ error: '必須項目が不足しています' });
    }

    // 入力検証とサニタイズ
    surname = sanitizeString(surname, 50);
    givenName = sanitizeString(givenName, 50);
    if (!surname || !givenName) {
      return res.status(400).json({ error: '氏名が無効です' });
    }

    if (!validateAge(age)) {
      return res.status(400).json({ error: '年齢が無効です（0-150の範囲で入力してください）' });
    }
    age = parseInt(age, 10);

    careLevel = sanitizeString(careLevel, 20);
    if (!careLevel) {
      return res.status(400).json({ error: '要介護度が無効です' });
    }

    // オプション項目のサニタイズ
    address = address ? sanitizeString(address, 200) : null;
    kp = kp ? sanitizeString(kp, 100) : null;
    kpRelationship = kpRelationship ? sanitizeString(kpRelationship, 50) : null;
    kpContact = kpContact ? sanitizeString(kpContact, 50) : null;
    kpAddress = kpAddress ? sanitizeString(kpAddress, 200) : null;
    careManager = careManager ? sanitizeString(careManager, 50) : null;
    careManagerName = careManagerName ? sanitizeString(careManagerName, 50) : null;
    cmContact = cmContact ? sanitizeString(cmContact, 50) : null;
    assignee = assignee ? sanitizeString(assignee, 50) : '担当者未定';
    notes = notes ? sanitizeString(notes, 2000) : null;
    gender = gender ? sanitizeString(gender, 10) : null;
    roomNumber = roomNumber ? sanitizeString(roomNumber, 20) : null;
    moveInDate = moveInDate ? sanitizeString(moveInDate, 10) : null;

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
    
    // ID検証
    if (!validateId(id)) {
      return res.status(400).json({ error: '無効なIDです' });
    }

    let {
      surname, givenName, age, careLevel, address, kp, kpRelationship,
      kpContact, kpAddress, careManager, careManagerName, cmContact,
      assignee, notes, gender, roomNumber, moveInDate
    } = req.body;

    // 必須項目チェック
    if (!surname || !givenName || !age || !careLevel) {
      return res.status(400).json({ error: '必須項目が不足しています' });
    }

    // 入力検証とサニタイズ
    surname = sanitizeString(surname, 50);
    givenName = sanitizeString(givenName, 50);
    if (!surname || !givenName) {
      return res.status(400).json({ error: '氏名が無効です' });
    }

    if (!validateAge(age)) {
      return res.status(400).json({ error: '年齢が無効です（0-150の範囲で入力してください）' });
    }
    age = parseInt(age, 10);

    careLevel = sanitizeString(careLevel, 20);
    if (!careLevel) {
      return res.status(400).json({ error: '要介護度が無効です' });
    }

    // オプション項目のサニタイズ
    address = address ? sanitizeString(address, 200) : null;
    kp = kp ? sanitizeString(kp, 100) : null;
    kpRelationship = kpRelationship ? sanitizeString(kpRelationship, 50) : null;
    kpContact = kpContact ? sanitizeString(kpContact, 50) : null;
    kpAddress = kpAddress ? sanitizeString(kpAddress, 200) : null;
    careManager = careManager ? sanitizeString(careManager, 50) : null;
    careManagerName = careManagerName ? sanitizeString(careManagerName, 50) : null;
    cmContact = cmContact ? sanitizeString(cmContact, 50) : null;
    assignee = assignee ? sanitizeString(assignee, 50) : null;
    notes = notes ? sanitizeString(notes, 2000) : null;
    gender = gender ? sanitizeString(gender, 10) : null;
    roomNumber = roomNumber ? sanitizeString(roomNumber, 20) : null;
    moveInDate = moveInDate ? sanitizeString(moveInDate, 10) : null;

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
    
    // ID検証
    if (!validateId(id)) {
      return res.status(400).json({ error: '無効なIDです' });
    }

    let { move_in_date } = req.body;

    if (!move_in_date) {
      return res.status(400).json({ error: '入居日が指定されていません' });
    }

    // 日付形式の検証（YYYY-MM-DD形式）
    move_in_date = sanitizeString(move_in_date, 10);
    if (!move_in_date || !/^\d{4}-\d{2}-\d{2}$/.test(move_in_date)) {
      return res.status(400).json({ error: '入居日の形式が無効です（YYYY-MM-DD形式で入力してください）' });
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
    
    // ID検証
    if (!validateId(id)) {
      return res.status(400).json({ error: '無効なIDです' });
    }

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
    
    // ID検証
    if (!validateId(applicantId) || !validateId(postId)) {
      return res.status(400).json({ error: '無効なIDです' });
    }

    let { content } = req.body;
    const currentUser = req.user.name;

    if (!content) {
      return res.status(400).json({ error: '投稿内容が必要です' });
    }

    // 投稿内容のサニタイズ
    content = sanitizeString(content, 5000);
    if (!content) {
      return res.status(400).json({ error: '投稿内容が無効です' });
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
    
    // ID検証
    if (!validateId(applicantId) || !validateId(postId)) {
      return res.status(400).json({ error: '無効なIDです' });
    }

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
    
    // ID検証
    if (!validateId(id)) {
      return res.status(400).json({ error: '無効なIDです' });
    }

    let { content, action, parentPostId } = req.body;
    const author = req.user.name;

    if (!content) {
      return res.status(400).json({ error: '投稿内容が必要です' });
    }

    // 投稿内容のサニタイズ
    content = sanitizeString(content, 5000);
    if (!content) {
      return res.status(400).json({ error: '投稿内容が無効です' });
    }

    // actionの検証（許可された値のみ）
    if (action) {
      const allowedActions = [
        '相談受付中', '申込書受領', '実調日程調整中', '実調完了',
        '健康診断書依頼', '健康診断書受領', '判定会議中', '入居決定',
        '入居不可', '入居日調整中', '書類送付済', '入居準備完了',
        '入居完了', 'キャンセル'
      ];
      if (!allowedActions.includes(action)) {
        return res.status(400).json({ error: '無効なアクションです' });
      }
    }

    // parentPostIdの検証
    if (parentPostId && !validateId(parentPostId)) {
      return res.status(400).json({ error: '無効な親投稿IDです' });
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
// 認証済み接続のみを許可するミドルウェア
const authenticateSocket = (socket, next) => {
  // 認証トークンは接続時にクエリパラメータまたはハンドシェイクで送信される
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;
  
  if (!token) {
    // 認証トークンがない場合は接続を拒否せず、後で認証を要求
    socket.authenticated = false;
    return next();
  }

  try {
    const user = jwt.verify(token, JWT_SECRET);
    socket.user = user;
    socket.authenticated = true;
    next();
  } catch (err) {
    socket.authenticated = false;
    next();
  }
};

io.use(authenticateSocket);

io.on('connection', (socket) => {
  console.log('クライアントが接続しました:', socket.id);

  // 認証されていない場合は認証を要求
  if (!socket.authenticated) {
    socket.emit('authRequired', '認証が必要です');
  }

  // ユーザー認証
  socket.on('authenticate', (token) => {
    try {
      const user = jwt.verify(token, JWT_SECRET);
      socket.user = user;
      socket.authenticated = true;
      socket.join('authenticated');
      console.log(`ユーザー ${user.name} が認証されました`);
      socket.emit('authenticated', { user: { id: user.id, username: user.username, name: user.name } });
    } catch (err) {
      socket.emit('authError', '認証に失敗しました');
    }
  });

  // 認証されていない接続からのイベントをブロック
  const requireAuth = (eventName, handler) => {
    socket.on(eventName, (...args) => {
      if (!socket.authenticated) {
        socket.emit('authError', '認証が必要です');
        return;
      }
      handler(...args);
    });
  };

  // 特定の申込者の詳細ページに参加（認証必須）
  requireAuth('joinApplicant', (applicantId) => {
    socket.join(`applicant_${applicantId}`);
    console.log(`ユーザーが申込者 ${applicantId} のページに参加しました`);
  });

  // 申込者ページから離脱（認証必須）
  requireAuth('leaveApplicant', (applicantId) => {
    socket.leave(`applicant_${applicantId}`);
    console.log(`ユーザーが申込者 ${applicantId} のページから離脱しました`);
  });

  socket.on('disconnect', () => {
    console.log('クライアントが切断されました:', socket.id);
  });
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
