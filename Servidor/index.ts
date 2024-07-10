import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import mysql from 'mysql';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Configuración de la conexión MySQL
const connection = mysql.createConnection({
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
let gameId: null = null;

let clients: any[] = [];

// Configurar CORS para permitir solicitudes desde cualquier origen
app.use(cors());

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

function sendSSEUpdate(data: { word?: string; message?: string; }, event: string) {
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
    } else if (msg.type === 'guess-letter') {
      const letter = msg.letter.toLowerCase();
      let newGuessedWord = '';
      for (let i = 0; i < wordToGuess.length; i++) {
        if (wordToGuess[i] === letter) {
          newGuessedWord += letter;
        } else {
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

app.use(express.static('public'));

server.listen(3000, () => {
  console.log('Servidor escuchando en el puerto 3000');
});
