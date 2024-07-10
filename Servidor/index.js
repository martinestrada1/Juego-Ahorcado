"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const http_1 = require("http");
const ws_1 = require("ws");
const mysql_1 = __importDefault(require("mysql"));
const app = (0, express_1.default)();
const server = (0, http_1.createServer)(app);
const wss = new ws_1.WebSocketServer({ server });
// Configuración de la conexión MySQL
const connection = mysql_1.default.createConnection({
    host: 'localhost',
    user: 'martin',
    password: 'martin291004',
    database: 'Ahorcado'
});
connection.connect((err) => {
    if (err) {
        console.error('Error al conectar a la base de datos:', err);
        return;
    }
    console.log('Conexión exitosa a la base de datos MySQL');
});
let wordToGuess = '';
let guessedWord = '';
let gameId = null;
let clients = [];
// Configurar CORS para permitir solicitudes desde cualquier origen
app.use((0, cors_1.default)());
app.get('/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*'); // Permitir solicitudes desde cualquier origen
    res.flushHeaders();
    clients.push(res);
    req.on('close', () => {
        clients = clients.filter(client => client !== res);
    });
});
function sendSSEUpdate(data, event) {
    clients.forEach(client => {
        client.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    });
}
wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        const msg = JSON.parse(message.toString());
        if (msg.type === 'set-word') {
            wordToGuess = msg.word.toLowerCase();
            guessedWord = '_'.repeat(wordToGuess.length);
            const sqlInsert = `INSERT INTO JuegoAhorcado (word, guessed_letters) VALUES ('${wordToGuess}', '${guessedWord}')`;
            connection.query(sqlInsert, (error, results) => {
                if (error) {
                    console.error('Error al insertar la nueva palabra en la base de datos:', error);
                    return;
                }
                gameId = results.insertId;
                console.log(`Nueva palabra insertada en la base de datos con ID: ${gameId}`);
            });
            sendSSEUpdate({ word: guessedWord }, 'update-word');
            wss.clients.forEach((client) => {
                if (client.readyState === ws.OPEN) {
                    client.send(JSON.stringify({ type: 'update-word', word: guessedWord }));
                }
            });
        }
        else if (msg.type === 'guess-letter') {
            const letter = msg.letter.toLowerCase();
            let newGuessedWord = '';
            for (let i = 0; i < wordToGuess.length; i++) {
                if (wordToGuess[i] === letter) {
                    newGuessedWord += letter;
                }
                else {
                    newGuessedWord += guessedWord[i];
                }
            }
            guessedWord = newGuessedWord;
            if (gameId) {
                const sqlUpdate = `UPDATE JuegoAhorcado SET guessed_letters = '${guessedWord}' WHERE game_id = ${gameId}`;
                connection.query(sqlUpdate, (error, results, fields) => {
                    if (error) {
                        console.error('Error al actualizar las letras adivinadas:', error);
                        return;
                    }
                    console.log('Letras adivinadas actualizadas correctamente en la base de datos');
                });
            }
            sendSSEUpdate({ word: guessedWord }, 'update-word');
            wss.clients.forEach((client) => {
                if (client.readyState === ws.OPEN) {
                    client.send(JSON.stringify({ type: 'update-word', word: guessedWord }));
                    if (guessedWord === wordToGuess) {
                        client.send(JSON.stringify({ type: 'game-won' }));
                        sendSSEUpdate({ message: '¡Has adivinado la palabra correctamente!' }, 'game-won');
                    }
                }
            });
        }
    });
    ws.send(JSON.stringify({ type: 'welcome', message: 'Conectado al servidor WebSocket' }));
});
app.use(express_1.default.static('public'));
server.listen(3000, () => {
    console.log('Servidor escuchando en el puerto 3000');
});
