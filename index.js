const express = require('express');
const session = require('express-session');
const fs = require('fs');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'chave-secreta-sanatae',
    resave: false,
    saveUninitialized: true
}));

const RANKING_FILE = './ranking.json';
const USERS_FILE = './usuarios.json';

const carregarDados = (arquivo) => {
    if (!fs.existsSync(arquivo)) return arquivo === USERS_FILE ? [] : {};
    return JSON.parse(fs.readFileSync(arquivo, 'utf-8'));
};
const salvarDados = (arquivo, dados) => fs.writeFileSync(arquivo, JSON.stringify(dados, null, 2));

const precisaEstarLogado = (req, res, next) => {
    if (req.session.usuario) return next();
    res.redirect('/login');
};

// --- 1. ROTA PRINCIPAL (A QUE ESTAVA DANDO ERRO) ---
app.get('/', (req, res) => {
    const ranking = carregarDados(RANKING_FILE);
    const fotos = Object.keys(ranking);
    
    let htmlDuel = '';
    if (fotos.length >= 2) {
        let idxA = Math.floor(Math.random() * fotos.length);
        let idxB = Math.floor(Math.random() * fotos.length);
        while (idxA === idxB) idxB = Math.floor(Math.random() * fotos.length);

        const fotoA = fotos[idxA];
        const fotoB = fotos[idxB];

        htmlDuel = `
            <div class="duel">
                <div class="card" onclick="votar('${fotoA}')"><img src="${fotoA}" onerror="this.src='https://via.placeholder.com/400x300?text=Link+Quebrado'"></div>
                <div class="vs">VS</div>
                <div class="card" onclick="votar('${fotoB}')"><img src="${fotoB}" onerror="this.src='https://via.placeholder.com/400x300?text=Link+Quebrado'"></div>
            </div>`;
    } else {
        htmlDuel = '<h2>Adicione pelo menos 2 fotos no painel de admin para começar o duelo!</h2>';
    }

    res.send(template('ESCOLHA A FOTO', `
        ${htmlDuel}
        <div style="margin-top:30px;">
            <a href="/ranking">🏆 Ver Ranking</a> | <a href="/admin">➕ Adicionar Fotos</a>
        </div>
        <script>
            async function votar(foto) {
                const res = await fetch('/votar', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({foto})
                });
                if(res.ok) window.location.reload();
            }
        </script>
    `));
});

// --- RESTO DAS ROTAS (LOGIN, ADMIN, RANKING) ---
app.get('/login', (req, res) => res.send(template('LOGIN', '<div class="form-box"><form action="/login" method="POST"><input type="email" name="email" placeholder="Email" required><br><br><input type="password" name="senha" placeholder="Senha" required><br><br><button class="btn-main">ENTRAR</button></form><p><a href="/cadastro">Criar conta</a></p></div>')));

app.post('/login', (req, res) => {
    const { email, senha } = req.body;
    const users = carregarDados(USERS_FILE);
    const user = users.find(u => u.email === email && u.senha === senha);
    if(user) { req.session.usuario = user.email; res.redirect('/admin'); }
    else res.send('Erro! <a href="/login">Voltar</a>');
});

app.get('/cadastro', (req, res) => res.send(template('CADASTRO', '<div class="form-box"><form action="/cadastro" method="POST"><input type="email" name="email" placeholder="Seu email" required><br><br><input type="password" name="senha" placeholder="Sua senha" required><br><br><button class="btn-main">CADASTRAR</button></form></div>')));

app.post('/cadastro', (req, res) => {
    const { email, senha } = req.body;
    const users = carregarDados(USERS_FILE);
    users.push({email, senha});
    salvarDados(USERS_FILE, users);
    res.redirect('/login');
});

app.get('/admin', precisaEstarLogado, (req, res) => {
    res.send(template('PAINEL ADMIN', `<p>Olá, ${req.session.usuario} | <a href="/logout">Sair</a></p><div class="form-box"><form action="/adicionar" method="POST"><input type="url" name="url" placeholder="URL da imagem" required><br><br><button class="btn-main">ADICIONAR</button></form></div>`));
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });

app.post('/adicionar', precisaEstarLogado, (req, res) => {
    const ranking = carregarDados(RANKING_FILE);
    if(req.body.url) { ranking[req.body.url.trim()] = 0; salvarDados(RANKING_FILE, ranking); }
    res.redirect('/admin');
});

app.post('/votar', (req, res) => {
    const ranking = carregarDados(RANKING_FILE);
    if(ranking[req.body.foto] !== undefined) ranking[req.body.foto]++;
    salvarDados(RANKING_FILE, ranking);
    res.json({ok:true});
});

app.get('/ranking', (req, res) => {
    const ranking = carregarDados(RANKING_FILE);
    const ordenado = Object.entries(ranking).sort((a,b) => b[1]-a[1]);
    res.send(template('RANKING', `<div class="grid">${ordenado.map(i => `<div class="mini-card"><img src="${i[0]}"><div>${i[1]} votos</div></div>`).join('')}</div><br><a href="/">Voltar</a>`));
});

function template(tit, cont) {
    return `<html><head><style>body{font-family:sans-serif;background:#0b0e11;color:white;text-align:center;padding:40px;}.duel{display:flex;justify-content:center;align-items:center;gap:20px;}.card img{width:400px;height:300px;object-fit:cover;border-radius:10px;cursor:pointer;border:2px solid #333;}.card:hover img{border-color:#ff4500;}.vs{font-size:2rem;color:#ff4500;font-weight:bold;}.form-box{background:#1a1a1b;padding:20px;border-radius:10px;display:inline-block;}.btn-main{background:#ff4500;color:white;border:none;padding:10px 20px;border-radius:20px;cursor:pointer;}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:20px;}.mini-card img{width:100%;height:150px;object-fit:cover;}a{color:#4fbcff;text-decoration:none;}</style></head><body><h1>${tit}</h1>${cont}</body></html>`;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Rodando na porta ${PORT}`));