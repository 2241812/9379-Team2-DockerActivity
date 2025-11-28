const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const session = require('express-session');
const multer = require('multer');

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST']
}));

app.use(session({
    secret: 'bravo_team_secret_key_2025',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false,
        maxAge: 3600000 
    }
}));

const upload = multer({ storage: multer.memoryStorage() });

const dbConfig = {
    host: process.env.DB_HOST || 'mysql_db', 
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || 'admin123',
    database: process.env.DB_NAME || 'graphDB'
};

async function getConnection() {
    return await mysql.createConnection(dbConfig);
}

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Missing credentials' });
    }

    let conn;
    try {
        conn = await getConnection();
        const [rows] = await conn.execute(
            'SELECT * FROM users WHERE username = ? AND password = ?', 
            [username, password]
        );

        if (rows.length > 0) {
            req.session.user = { id: rows[0].id, username: rows[0].username, role: rows[0].role };
            req.session.isAdmin = (rows[0].role === 'admin');
            
            res.json({ success: true, message: 'Login successful' });
        } else {
            res.status(401).json({ success: false, message: 'Invalid username or password' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Database error' });
    } finally {
        if (conn) conn.end();
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true, message: 'Logged out' });
});

function requireAdmin(req, res, next) {
    if (req.session.isAdmin) {
        next();
    } else {
        res.status(403).json({ success: false, message: 'Unauthorized: Admins only' });
    }
}

app.post('/api/admin/save-map', requireAdmin, async (req, res) => {
    let conn;
    try {
        conn = await getConnection();
        await conn.beginTransaction();

        // ... (Truncates and Inserts for nodes/edges remain the same) ...
        await conn.query('SET FOREIGN_KEY_CHECKS = 0');
        await conn.query('TRUNCATE TABLE nodes');
        await conn.query('TRUNCATE TABLE edges');
        await conn.query('TRUNCATE TABLE floor_labels');
        await conn.query('SET FOREIGN_KEY_CHECKS = 1');

        const { nodes, edges, floorLabels } = req.body;

        if (nodes && nodes.length > 0) {
            const nodeSql = 'INSERT INTO nodes (id, name, type, floor, x, y, access) VALUES ?';
            const nodeValues = nodes.map(n => [n.id, n.name, n.type, n.floor, n.x, n.y, n.access || 'all']);
            await conn.query(nodeSql, [nodeValues]);
        }

        if (edges && edges.length > 0) {
            const edgeSql = 'INSERT INTO edges (source, target) VALUES ?';
            const edgeValues = edges.map(e => [e.source, e.target]);
            await conn.query(edgeSql, [edgeValues]);
        }

        if (floorLabels) {
            const labelSql = 'INSERT INTO floor_labels (floor_number, label) VALUES ?';
            const labelValues = Object.entries(floorLabels).map(([k, v]) => [k, v]);
            if (labelValues.length > 0) await conn.query(labelSql, [labelValues]);
        }

       
        const newTimestamp = Date.now().toString();
        await conn.query(
            "INSERT INTO settings (setting_key, setting_value) VALUES ('map_version', ?) ON DUPLICATE KEY UPDATE setting_value = ?",
            [newTimestamp, newTimestamp]
        );
       

        await conn.commit();
        res.json({ success: true, message: 'Map data saved successfully!' });

    } catch (err) {
        if (conn) await conn.rollback();
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
    } finally {
        if (conn) conn.end();
    }
});

app.post('/api/admin/upload-floorplan', requireAdmin, upload.single('floorImage'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'No image file uploaded.' });
    }

    const { floorNumber } = req.body;
    let conn;

    try {
        conn = await getConnection();
        const sql = `
            INSERT INTO floor_images (floor_number, mime_type, image_data) 
            VALUES (?, ?, ?) 
            ON DUPLICATE KEY UPDATE 
            mime_type = VALUES(mime_type), 
            image_data = VALUES(image_data)
        `;
        
        await conn.query(sql, [floorNumber, req.file.mimetype, req.file.buffer]);
        res.json({ success: true, message: `Floor ${floorNumber} plan updated.` });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
    } finally {
        if (conn) conn.end();
    }
});

app.get('/api/admin/check-session', (req, res) => {
    if (req.session.isAdmin) {
        res.json({ isAdmin: true, user: req.session.user });
    } else {
        res.json({ isAdmin: false });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});