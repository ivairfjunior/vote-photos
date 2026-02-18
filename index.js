const express = require('express');
const session = require('express-session');
const fs = require('fs');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'chave-elo-sanatae', resave: false, saveUninitialized: true }));

const RANKING_FILE = './ranking.json';
const USERS_FILE = './usuarios.json';

const carregarDados = (arquivo) => {
    if (!fs.existsSync(arquivo)) return arquivo === USERS_FILE ? [] : {};
    return JSON.parse(fs.readFileSync(arquivo, 'utf-8'));
};
const salvarDados = (arquivo, dados) => fs.writeFileSync(arquivo, JSON.stringify(dados, null, 2));

function calcularNovoElo(ratingVenc, ratingPerd) {
    const K = 32;
    const chanceVenc = 1 / (1 + Math.pow(10, (ratingPerd - ratingVenc) / 400));
    const chancePerd = 1 / (1 + Math.pow(10, (ratingVenc - ratingPerd) / 400));
    return {
        novoVenc: Math.round(ratingVenc + K * (1 - chanceVenc)),
        novoPerd: Math.round(ratingPerd + K * (0 - chancePerd))
    };
}

const precisaEstarLogado = (req, res, next) => {
    if (req.session.usuario) return next();
    res.redirect('/login');
};

// --- ROTAS DE AUTENTICAÇÃO ---

app.get('/cadastro', (req, res) => {
    res.send(template('CRIAR CONTA', `
        <div class="form-box">
            <form action="/cadastro" method="POST">
                <input type="text" name="nome" placeholder="Seu Nome / Nickname" required><br><br>
                <input type="email" name="email" placeholder="E-mail" required><br><br>
                <input type="password" name="senha" placeholder="Senha" required><br><br>
                <button class="btn-main">CADASTRAR</button>
            </form>
        </div>
    `));
});

app.post('/cadastro', (req, res) => {
    const { email, senha, nome } = req.body;
    const usuarios = carregarDados(USERS_FILE);
    if (usuarios.find(u => u.email === email)) return res.send('E-mail já existe!');
    usuarios.push({ email, senha, nome });
    salvarDados(USERS_FILE, usuarios);
    res.redirect('/login');
});

app.get('/login', (req, res) => {
    res.send(template('LOGIN', `
        <div class="form-box">
            <form action="/login" method="POST">
                <input type="email" name="email" placeholder="E-mail" required><br><br>
                <input type="password" name="senha" placeholder="Senha" required><br><br>
                <button class="btn-main">ENTRAR</button>
            </form>
        </div>
    `));
});

app.post('/login', (req, res) => {
    const { email, senha } = req.body;
    const usuarios = carregarDados(USERS_FILE);
    const user = usuarios.find(u => u.email === email && u.senha === senha);
    if (user) {
        req.session.usuario = user.email;
        req.session.nomeReal = user.nome;
        res.redirect('/admin');
    } else {
        res.send('Login inválido!');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// --- ROTA ADMIN ---

app.get('/admin', precisaEstarLogado, (req, res) => {
    res.send(template('ENVIAR FOTO', `
        <p>Olá, <b>${req.session.nomeReal}</b>!</p>
        <div class="form-box">
            <form action="/adicionar" method="POST">
                <input type="text" name="titulo" placeholder="Título da Foto" required><br><br>
                <input type="url" name="url" placeholder="URL da Imagem" required><br><br>
                <button class="btn-main">SUBIR PARA O DUELO</button>
            </form>
        </div>
        <br><a href="/">Voltar para a Batalha</a>
    `));
});

app.post('/adicionar', precisaEstarLogado, (req, res) => {
    const { url, titulo } = req.body;
    const ranking = carregarDados(RANKING_FILE);
    if(url && titulo) {
        ranking[url.trim()] = { elo: 1000, titulo: titulo, autor: req.session.nomeReal };
        salvarDados(RANKING_FILE, ranking);
    }
    res.redirect('/admin');
});

// --- PÁGINA PRINCIPAL ---

app.get('/', (req, res) => {
    const ranking = carregarDados(RANKING_FILE);
    const fotos = Object.keys(ranking);
    
    if (fotos.length < 2) {
        return res.send(template('BEM-VINDO', `
            <h2>A galeria está vazia!</h2>
            <p>Faça login para postar as primeiras fotos.</p>
            <a href="/login" class="btn-main">ENTRAR / CADASTRAR</a>
        `));
    }

    let idxA = Math.floor(Math.random() * fotos.length);
    let idxB = Math.floor(Math.random() * fotos.length);
    while (idxA === idxB) idxB = Math.floor(Math.random() * fotos.length);

    const fotoA = fotos[idxA];
    const fotoB = fotos[idxB];
    const d1 = ranking[fotoA];
    const d2 = ranking[fotoB];

    res.send(template('DUELO DE ELITE', `
        <div class="duel">
            <div class="card" onclick="votar('${fotoA}', '${fotoB}')">
                <img src="${fotoA}">
                <div class="score-tag" style="padding:15px; font-weight:bold;">${d1.titulo}</div>
                <p>Fotógrafo: ${d1.autor}</p>
            </div>
            <div class="vs">VS</div>
            <div class="card" onclick="votar('${fotoB}', '${fotoA}')">
                <img src="${fotoB}">
                <div class="score-tag" style="padding:15px; font-weight:bold;">${d2.titulo}</div>
                <p>Fotógrafo: ${d2.autor}</p>
            </div>
        </div>
        <div style="margin-top:30px;">
            <a href="/ranking" class="btn-main">🏆 VER RANKING</a>
        </div>
        <script>
            async function votar(v, p) {
                await fetch('/votar', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({vencedora: v, perdedora: p}) });
                location.reload();
            }
        </script>
    `));
});

app.post('/votar', (req, res) => {
    const { vencedora, perdedora } = req.body;
    const ranking = carregarDados(RANKING_FILE);
    if (ranking[vencedora] && ranking[perdedora]) {
        const { novoVenc, novoPerd } = calcularNovoElo(ranking[vencedora].elo, ranking[perdedora].elo);
        ranking[vencedora].elo = novoVenc;
        ranking[perdedora].elo = novoPerd;
        salvarDados(RANKING_FILE, ranking);
    }
    res.json({ ok: true });
});

// --- ROTA RANKING ---

app.get('/ranking', (req, res) => {
    const ranking = carregarDados(RANKING_FILE);
    const ordenado = Object.entries(ranking).sort((a, b) => b[1].elo - a[1].elo);
    
    const cards = ordenado.map(([url, d], i) => {
        let topo = i === 0 ? "topo-1" : i === 1 ? "topo-2" : i === 2 ? "topo-3" : "";
        let medalha = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "#" + (i + 1);
        return `
        <div class="mini-card ${topo}">
            <div class="posicao">${medalha}</div>
            <img src="${url}">
            <div style="padding: 15px;">
                <div style="font-size: 1.2rem; font-weight: bold; color: #ff4500;">${d.elo} pts</div>
                <div style="margin: 5px 0;">${d.titulo}</div>
                <small style="color: #aaa;">Fotógrafo: ${d.autor}</small>
            </div>
        </div>`;
    }).join('');

    res.send(template('HALL DA FAMA', `<div style="margin-bottom:20px;"><a href="/" class="btn-main">← VOLTAR AO DUELO</a></div><div class="grid">${cards}</div>`));
});

function template(titulo, conteudo) {
    return `<html><head><title>${titulo}</title><meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { font-family: 'Segoe UI', sans-serif; background: #0b0e11; color: white; text-align: center; padding: 20px; }
        .duel { display: flex; justify-content: center; align-items: center; gap: 20px; flex-wrap: wrap; margin-top: 20px; }
        .card { background: #1a1a1b; border: 2px solid #343536; border-radius: 15px; cursor: pointer; width: 400px; transition: 0.3s; overflow: hidden; }
        .card img { width: 100%; height: 350px; object-fit: cover; }
        .vs { font-size: 3rem; color: #ff4500; font-weight: 900; }
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 25px; max-width: 1200px; margin: 40px auto; }
        .mini-card { background: #1a1a1b; border-radius: 12px; overflow: hidden; position: relative; border: 2px solid #343536; }
        .mini-card img { width: 100%; height: 180px; object-fit: cover; }
        .topo-1 { border-color: #ffd700; box-shadow: 0 0 20px rgba(255, 215, 0, 0.3); }
        .topo-1 .posicao { background: #ffd700; color: #000; }
        .topo-2 { border-color: #c0c0c0; }
        .topo-2 .posicao { background: #c0c0c0; color: #000; }
        .topo-3 { border-color: #cd7f32; }
        .topo-3 .posicao { background: #cd7f32; color: #000; }
        .posicao { position: absolute; top: 8px; left: 8px; padding: 4px 12px; border-radius: 6px; font-weight: bold; background: #343536; }
        .btn-main { background: #ff4500; color: white; padding: 12px 25px; border-radius: 20px; text-decoration: none; font-weight: bold; display: inline-block; border:none; cursor:pointer; }
        input { padding: 12px; border-radius: 8px; border: 1px solid #333; background: #222; color: white; width: 300px; margin-bottom: 10px; }
        .form-box { background: #1a1a1b; padding: 30px; border-radius: 20px; border: 1px solid #343536; display: inline-block; }
        a { color: #4fbcff; text-decoration: none; }
    </style></head><body><h1>${titulo}</h1>${conteudo}</body></html>`;
}

app.listen(process.env.PORT || 3000, () => console.log('App Rodando!'));