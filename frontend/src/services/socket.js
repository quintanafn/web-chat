import { io } from 'socket.io-client';

// Define a URL do socket com prioridade para variável de ambiente.
// Se REACT_APP_SOCKET_URL não estiver definida, tenta derivar a partir de REACT_APP_API_URL removendo o sufixo "/api".
// Fallback para http://localhost:5001 em desenvolvimento.
const deriveSocketUrl = () => {
  const envSocket = process.env.REACT_APP_SOCKET_URL;
  if (envSocket) return envSocket;

  const envApi = process.env.REACT_APP_API_URL;
  if (envApi) {
    try {
      const url = new URL(envApi);
      // Remove o path "/api" se existir
      if (url.pathname.endsWith('/api')) {
        url.pathname = url.pathname.replace(/\/api$/, '');
      }
      return url.toString().replace(/\/$/, '');
    } catch (_) {
      // Se não for uma URL válida, continua para o fallback
    }
  }

  return 'http://localhost:5001';
};

const SOCKET_URL = deriveSocketUrl();

class SocketService {
  constructor() {
    this.socket = null;
    this.callbacks = {
      qr: [],
      authenticated: [],
      ready: [],
      message: [],
      disconnected: []
    };
  }

  connect(userId) {
    if (this.socket) {
      this.socket.disconnect();
    }

    // Resetar callbacks registrados para evitar duplicação entre reconexões
    this.callbacks = {
      qr: [],
      authenticated: [],
      ready: [],
      message: [],
      disconnected: []
    };

    this.socket = io(SOCKET_URL);

    this.socket.on('connect', () => {
      console.log('Socket conectado');
      this.socket.emit('authenticate', userId);
    });

    this.socket.on('qr', (data) => {
      this.callbacks.qr.forEach(callback => callback(data));
    });

    this.socket.on('authenticated', (data) => {
      this.callbacks.authenticated.forEach(callback => callback(data));
    });

    this.socket.on('ready', (data) => {
      this.callbacks.ready.forEach(callback => callback(data));
    });

    this.socket.on('message', (data) => {
      this.callbacks.message.forEach(callback => callback(data));
    });

    this.socket.on('disconnected', (data) => {
      this.callbacks.disconnected.forEach(callback => callback(data));
    });

    this.socket.on('disconnect', () => {
      console.log('Socket desconectado');
    });

    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  on(event, callback) {
    if (this.callbacks[event]) {
      this.callbacks[event].push(callback);
    }
    return () => {
      if (this.callbacks[event]) {
        this.callbacks[event] = this.callbacks[event].filter(cb => cb !== callback);
      }
    };
  }

  off(event, callback) {
    if (this.callbacks[event]) {
      this.callbacks[event] = this.callbacks[event].filter(cb => cb !== callback);
    }
  }
}

const socketService = new SocketService();
export default socketService;
