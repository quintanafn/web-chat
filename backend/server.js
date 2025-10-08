const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
require('dotenv').config();

// Importar Supabase e modelos
const supabase = require('./config/supabase');
const User = require('./models/User');
const WhatsAppSession = require('./models/WhatsAppSession');
const Contact = require('./models/Contact');
const Message = require('./models/Message');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});


// Middleware
app.use(cors());
app.use(express.json());

// Diretório e utilitários para armazenamento local de mídias
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}
app.use('/media', express.static(UPLOAD_DIR));

// Mapeamento simples de mimetype -> extensão
const getExtFromMime = (mime) => {
  const base = String(mime || '').split(';')[0];
  const map = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/mp4': 'm4a',
    'video/mp4': 'mp4',
    'video/3gpp': '3gp',
    'application/pdf': 'pdf'
  };
  return map[base] || (base.includes('/') ? base.split('/')[1] : 'bin');
};

// Formata um identificador do WhatsApp conforme o tipo (contato vs grupo)
// Se já vier com sufixo @, mantém. Caso contrário, usa heurística:
// - Contém '-' => grupo -> @g.us
// - Caso contrário -> contato -> @c.us
const formatWhatsAppId = (raw) => {
  if (!raw) return raw;
  if (raw.includes('@')) return raw;
  return raw.includes('-') ? `${raw}@g.us` : `${raw}@c.us`;
};

const deriveTypeFromMime = (mime) => {
  const base = String(mime || '').split(';')[0];
  if (base.startsWith('image/')) return 'image';
  if (base.startsWith('audio/')) return 'audio';
  if (base.startsWith('video/')) return 'video';
  return 'document';
};

const saveBase64ToFile = (b64, mimetype, nameBase) => {
  const ext = getExtFromMime(mimetype);
  const filename = `${nameBase}.${ext}`;
  const abs = path.join(UPLOAD_DIR, filename);
  try {
    fs.writeFileSync(abs, Buffer.from(b64, 'base64'));
  } catch (e) {
    console.error('Falha ao gravar arquivo de mídia:', e?.message || e);
    throw e;
  }
  return { filename, absPath: abs, publicUrl: `/media/${filename}` };
};

// Configuração do multer para upload de arquivos
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = getExtFromMime(file.mimetype);
    const safe = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    cb(null, safe);
  }
});
const upload = multer({ storage });

// Armazenamento em memória apenas para sessões ativas (clientes WhatsApp)
const activeClients = {};

// Utilitário: timestamp (segundos) de INÍCIO da sessão (primeira conexão)
// Obtido a partir do sessionId no formato: <uuid>_<epochMs>
const getSessionStartEpoch = (sessionId) => {
  try {
    const parts = String(sessionId || '').split('_');
    if (parts.length >= 2) {
      const ms = Number(parts[1]);
      if (!Number.isNaN(ms)) return Math.floor(ms / 1000);
    }
  } catch (_) {}
  return 0;
};

// Sincroniza mensagens recentes desde o último registro conhecido/since
const syncRecentMessages = async (sessionId, client, userId) => {
  try {
    // pegar o último timestamp salvo para a sessão (se existir)
    let latest = 0;
    try {
      const last = await Message.findBySessionId(sessionId, 1);
      if (Array.isArray(last) && last.length > 0 && typeof last[0].timestamp === 'number') {
        latest = last[0].timestamp;
      }
    } catch (_) {}

    const since = latest || 0;
    console.log(`[sync] Iniciando sincronização da sessão ${sessionId} desde ${since}`);

    const chats = await client.getChats();
    let totalPersisted = 0;

    for (const chat of chats) {
      try {
        const fetched = await chat.fetchMessages({ limit: 200 });
        for (const m of fetched) {
          try {
            if (!m || typeof m.timestamp !== 'number') continue;
            if (since && m.timestamp < since) continue;

            const chatIsGroup = chat.isGroup || (chat.id && chat.id._serialized && chat.id._serialized.includes('g.us'));
            let contact = null;
            try { contact = await chat.getContact(); } catch (_) {}
            let profilePicUrl = null;
            try { if (contact) profilePicUrl = await contact.getProfilePicUrl(); } catch (_) {}

            // Determinar número/identificador do contato
            const contactNumber = contact ? contact.number : (chat.id && (chat.id.user || (chat.id._serialized || '').split('@')[0])) || null;
            let contactDataToEmit = null;

            if (contactNumber) {
              const contactData = {
                id: contact?.id?.user || (chat.id && chat.id.user) || contactNumber,
                session_id: sessionId,
                name: (contact && (contact.name || contact.pushname)) || contactNumber,
                number: contactNumber,
                profile_pic_url: profilePicUrl,
                is_group: !!chatIsGroup
              };
              try { await Contact.upsert(contactData); } catch (e) { console.error('[sync] upsert contato falhou:', e?.message || e); }
              contactDataToEmit = contactData;
            }

            const fromRaw = (m.from || '').split('@')[0];
            const toRaw = (m.to || '').split('@')[0];
            const fromMe = m.fromMe === true;
            const groupId = (chat && chat.id && (chat.id._serialized || '').split('@')[0]) || null;
            // Montar corpo com mídia (se houver)
            let payloadBody = m.body;
            const fetchedType = m.type || 'chat';
            if (m.hasMedia) {
              try {
                const media = await m.downloadMedia();
                if (media && media.data) {
                  const saved = saveBase64ToFile(media.data, media.mimetype || media.mime || '', `${sessionId}_${m.id.id}`);
                  const meta = {
                    text: m.body || '',
                    mediaUrl: saved.publicUrl,
                    mediaMime: media.mimetype || media.mime || '',
                    mediaFilename: saved.filename,
                    messageType: fetchedType || deriveTypeFromMime(media.mimetype || media.mime || '')
                  };
                  payloadBody = JSON.stringify(meta);
                }
              } catch (e) {
                console.error('[sync] erro ao baixar/salvar mídia:', e?.message || e);
              }
            }

            const messageData = {
              id: m.id.id,
              session_id: sessionId,
              from_number: fromMe ? 'me' : fromRaw,
              to_number: fromMe ? toRaw : (chatIsGroup ? (groupId || 'me') : 'me'),
              body: payloadBody,
              timestamp: m.timestamp,
              is_read: !!fromMe
            };

            try {
              const saved = await Message.create(messageData);
              totalPersisted++;
              // emitir opcionalmente para o frontend
              if (userId) {
                const messageWithDetails = {
                  ...saved,
                  contact: contactDataToEmit || undefined,
                  chat: {
                    name: chat.name || chat.formattedTitle
                  }
                };
                io.to(userId).emit('message', messageWithDetails);
              }
            } catch (dbErr) {
              if (!(dbErr && (dbErr.code === '23505' || (dbErr.message || '').toLowerCase().includes('duplicate')))) {
                console.error('[sync] erro ao salvar mensagem:', dbErr?.message || dbErr);
              }
            }
          } catch (inner) {
            console.error('[sync] erro ao processar mensagem:', inner?.message || inner);
          }
        }
      } catch (chErr) {
        console.error('[sync] erro ao sincronizar chat:', chErr?.message || chErr);
      }
    }
    console.log(`[sync] Concluída sincronização da sessão ${sessionId}. Persistidas ${totalPersisted} mensagens.`);
  } catch (err) {
    console.error('[sync] Erro geral de sincronização:', err?.message || err);
  }
};

// Rota básica
app.get('/', (req, res) => {
  res.send('API do WhatsApp Web Connect está funcionando!');
});

// Rota para criar uma nova sessão WhatsApp
app.post('/api/session', async (req, res) => {
  try {
    const { userId, sessionName } = req.body;
    
    if (!userId || !sessionName) {
      return res.status(400).json({ error: 'ID do usuário e nome da sessão são obrigatórios' });
    }
    
    // Verificar se o usuário existe ou criar um novo
    let user;
    try {
      // Tentar encontrar o usuário pelo nome (para compatibilidade com o frontend)
      const { data: users, error } = await supabase
        .from('users')
        .select('*')
        .eq('name', userId);
      
      if (error) throw error;
      
      if (users && users.length > 0) {
        user = users[0];
      } else {
        // Criar um novo usuário com UUID
        const userData = {
          id: uuidv4(),
          name: userId
        };
        
        const { data: newUser, error: createError } = await supabase
          .from('users')
          .insert([userData])
          .select();
        
        if (createError) throw createError;
        
        user = newUser[0];
      }
    } catch (error) {
      console.error('Erro ao verificar usuário:', error);
      throw error;
    }
    
    const sessionId = `${user.id}_${Date.now()}`;
    
    // Criar a sessão no banco de dados
    await WhatsAppSession.create({
      id: sessionId,
      user_id: user.id,
      name: sessionName,
      status: 'initializing'
    });
    
    // Inicializa o cliente WhatsApp
    const client = new Client({
      authStrategy: new LocalAuth({ clientId: sessionId }),
      puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      }
    });
    
    // Intervalo de atualização de fotos de perfil (inicialmente nulo, será configurado abaixo)
    let profilePicInterval = null;
    
    // Evento de QR Code
    client.on('qr', async (qr) => {
      console.log(`QR Code gerado para sessão ${sessionId}`);
      qrcode.generate(qr, { small: true });
      
      // Atualizar QR code no banco de dados
      await WhatsAppSession.updateQrCode(sessionId, qr);
      
      io.to(userId).emit('qr', { sessionId, qr });
    });
    
    // Evento de autenticação
    client.on('authenticated', async () => {
      console.log(`Sessão ${sessionId} autenticada`);
      
      // Atualizar status no banco de dados
      await WhatsAppSession.updateStatus(sessionId, 'authenticated');
      
      io.to(userId).emit('authenticated', { sessionId });
    });
    
    // Evento de pronto
    client.on('ready', async () => {
      console.log(`Sessão ${sessionId} está pronta`);
      
      // Atualizar status no banco de dados
      await WhatsAppSession.updateStatus(sessionId, 'connected');
      
      // Armazenar o cliente ativo e o intervalo de atualização em memória
      activeClients[sessionId] = {
        client,
        profilePicInterval,
        connectedAt: Math.floor(Date.now() / 1000)
      };
      // Sincronizar mensagens que chegaram enquanto o app/cliente estava offline
      try {
        syncRecentMessages(sessionId, client, userId);
      } catch (e) {
        console.error('Falha ao iniciar syncRecentMessages (create):', e);
      }
      
      // Buscar e atualizar fotos de perfil dos contatos
      try {
        console.log('Buscando contatos para atualizar fotos de perfil...');
        const chats = await client.getChats();
        console.log(`Encontrados ${chats.length} chats`);
        
        for (const chat of chats) {
          try {
            if (chat.isGroup) {
              // Processar grupo
              console.log(`Grupo: ${chat.name}, ID: ${chat.id._serialized}`);
              
              // Salvar grupo como contato com flag isGroup
              const groupData = {
                id: chat.id.user,
                session_id: sessionId,
                name: chat.name,
                number: chat.id._serialized.split('@')[0],
                profile_pic_url: null, // Podemos buscar a foto do grupo em uma versão futura
                is_group: true
              };
              
              await Contact.upsert(groupData);
              continue;
            }
            
            // Processar contato individual
            const contact = await chat.getContact();
            const profilePicUrl = await contact.getProfilePicUrl();
            console.log(`Contato: ${contact.name || contact.pushname || contact.number}, Foto: ${profilePicUrl ? 'Sim' : 'Não'}`);
            
            // Salvar ou atualizar o contato com a foto de perfil
            const contactData = {
              id: contact.id.user,
              session_id: sessionId,
              name: contact.name || contact.pushname || contact.number,
              number: contact.number,
              profile_pic_url: profilePicUrl,
              is_group: false
            };
            
            await Contact.upsert(contactData);
          } catch (contactError) {
            console.error('Erro ao processar contato:', contactError);
          }
        }
        
        console.log('Atualização de fotos de perfil concluída');
      } catch (err) {
        console.error('Erro ao buscar e atualizar fotos de perfil:', err);
      }
      
      io.to(userId).emit('ready', { sessionId });
    });
    
    // Evento de mensagem (INBOUND)
    client.on('message', async (msg) => {
      try {
        if (msg.fromMe) return; // evitar duplicar com message_create
        console.log(`Nova mensagem recebida na sessão ${sessionId}`);
        
        const contact = await msg.getContact();
        const chat = await msg.getChat();
        
        // Buscar a foto de perfil do contato
        let profilePicUrl = null;
        try {
          profilePicUrl = await contact.getProfilePicUrl();
        } catch (err) {
          console.error('Erro ao buscar foto de perfil:', err);
        }
        
        // Verificar se é um grupo de forma mais robusta
        const isGroup = chat.isGroup || 
                      (chat.id && chat.id._serialized && chat.id._serialized.includes('g.us')) ||
                      (contact.id && contact.id.user && contact.id.user.includes('g.us'));
        
        // Salvar ou atualizar o contato
        const contactData = {
          id: contact.id.user,
          session_id: sessionId,
          name: contact.name || contact.pushname || contact.number,
          number: contact.number,
          profile_pic_url: profilePicUrl,
          is_group: isGroup
        };
        
        await Contact.upsert(contactData);
        
        // Normalizar remetente/destinatário: quando a mensagem é para mim, guardar to_number = 'me'
        const myNumber = (activeClients[sessionId]?.client?.info?.wid?.user) || null;
        const fromRaw = (msg.from || '').split('@')[0];
        const toRaw = (msg.to || '').split('@')[0];
        const fromMe = msg.fromMe === true;
        const from_number = fromMe ? 'me' : fromRaw;
        // Para mensagens de grupo recebidas (não fromMe), atribuir o ID do grupo como to_number
        const groupId = (chat && chat.id && (chat.id._serialized || '').split('@')[0]) || null;
        const to_number = fromMe ? toRaw : (isGroup ? (groupId || 'me') : 'me');

        // Montar corpo com mídia (se houver)
        let payloadBody = msg.body;
        const guessedType = msg.type || 'chat';
        if (msg.hasMedia) {
          try {
            const media = await msg.downloadMedia();
            if (media && media.data) {
              const saved = saveBase64ToFile(media.data, media.mimetype || media.mime || '', `${sessionId}_${msg.id.id}`);
              const meta = {
                text: msg.body || '',
                mediaUrl: saved.publicUrl,
                mediaMime: media.mimetype || media.mime || '',
                mediaFilename: saved.filename,
                messageType: guessedType || deriveTypeFromMime(media.mimetype || media.mime || '')
              };
              payloadBody = JSON.stringify(meta);
            }
          } catch (e) {
            console.error('Erro ao baixar/salvar mídia:', e?.message || e);
          }
        }

        // Salvar a mensagem
        const messageData = {
          id: msg.id.id,
          session_id: sessionId,
          from_number,
          to_number,
          body: payloadBody,
          timestamp: msg.timestamp,
          is_read: false
        };
        
        let savedMessage = null;
        try {
          savedMessage = await Message.create(messageData);
        } catch (dbErr) {
          if (dbErr && (dbErr.code === '23505' || (dbErr.message || '').toLowerCase().includes('duplicate'))) {
            try { savedMessage = await Message.findById(messageData.id); } catch (_) {}
          } else {
            throw dbErr;
          }
        }
        
        // Adicionar informações do contato e chat para o frontend
        const messageWithDetails = {
          ...savedMessage,
          contact: contactData,
          chat: {
            name: chat.name || chat.formattedTitle
          }
        };
        
        io.to(userId).emit('message', messageWithDetails);
      } catch (err) {
        console.error('Erro ao processar mensagem:', err);
      }
    });
    
    // Evento de mensagem criada (OUTBOUND - enviada por esta conta em qualquer dispositivo)
    client.on('message_create', async (msg) => {
      try {
        // Somente processar mensagens enviadas por MIM nesta conta
        if (!msg.fromMe) return;
        const isFromMe = true;
        console.log(`Mensagem enviada pela sessão ${sessionId} (message_create)`);

        const chat = await msg.getChat();
        // Processar tanto mensagens diretas quanto de grupos
        const isGroup = chat.isGroup || 
                      (chat.id && chat.id._serialized && chat.id._serialized.includes('g.us'));
        
        console.log(`Processando mensagem ${isGroup ? 'de grupo' : 'direta'}: ${chat.name || 'Sem nome'}`);

        // Buscar contato (destinatário)
        let contact = null;
        try {
          contact = await chat.getContact();
        } catch (_) {}

        // Buscar foto de perfil do contato (opcional)
        let profilePicUrl = null;
        try {
          if (contact) {
            profilePicUrl = await contact.getProfilePicUrl();
          }
        } catch (_) {}

        // Salvar/atualizar contato
        if (contact) {
          const contactData = {
            id: contact.id.user,
            session_id: sessionId,
            name: contact.name || contact.pushname || contact.number,
            number: contact.number,
            profile_pic_url: profilePicUrl,
            is_group: isGroup
          };
          try {
            await Contact.upsert(contactData);
          } catch (contactError) {
            console.error('Erro ao upsert do contato (message_create):', contactError);
          }
        }

        // Montar dados da mensagem normalizando remetente/destinatário
        const myNumber = (activeClients[sessionId]?.client?.info?.wid?.user) || null;
        const toRaw = (msg.to || '').split('@')[0];
        // Montar corpo com mídia (se houver)
        let payloadBody = msg.body;
        const outType = msg.type || 'chat';
        if (msg.hasMedia) {
          try {
            const media = await msg.downloadMedia();
            if (media && media.data) {
              const saved = saveBase64ToFile(media.data, media.mimetype || media.mime || '', `${sessionId}_${msg.id.id}`);
              const meta = {
                text: msg.body || '',
                mediaUrl: saved.publicUrl,
                mediaMime: media.mimetype || media.mime || '',
                mediaFilename: saved.filename,
                messageType: outType || deriveTypeFromMime(media.mimetype || media.mime || '')
              };
              payloadBody = JSON.stringify(meta);
            }
          } catch (e) {
            console.error('Erro ao baixar/salvar mídia (outbound):', e?.message || e);
          }
        }

        const messageData = {
          id: msg.id.id,
          session_id: sessionId,
          from_number: 'me',
          to_number: toRaw,
          body: payloadBody,
          timestamp: msg.timestamp,
          is_read: true
        };

        // Persistir mensagem com proteção a duplicidade
        let savedMessage = null;
        try {
          savedMessage = await Message.create(messageData);
        } catch (dbErr) {
          if (dbErr && (dbErr.code === '23505' || (dbErr.message || '').toLowerCase().includes('duplicate'))) {
            try {
              savedMessage = await Message.findById(messageData.id);
            } catch (findErr) {
              console.error('Falha ao recuperar mensagem já existente:', findErr);
              return; // evita emitir duplicado sem dados
            }
          } else {
            console.error('Erro ao salvar mensagem enviada (message_create):', dbErr);
            return;
          }
        }

        // Preparar payload para o frontend
        const messageWithDetails = {
          ...savedMessage,
          contact: contact ? {
            id: contact.id.user,
            session_id: sessionId,
            name: contact.name || contact.pushname || contact.number,
            number: contact.number,
            profile_pic_url: profilePicUrl
          } : undefined,
          chat: {
            name: chat.name || chat.formattedTitle
          }
        };

        // Emitir para o usuário dono da sessão
        io.to(userId).emit('message', messageWithDetails);
      } catch (err) {
        console.error('Erro ao processar mensagem enviada (message_create):', err);
      }
    });
    
    // Evento de desconexão
    client.on('disconnected', async (reason) => {
      console.log(`Sessão ${sessionId} desconectada: ${reason}`);
      
      // Atualizar status no banco de dados
      await WhatsAppSession.updateStatus(sessionId, 'disconnected');
      
      // Limpar intervalo de atualização e remover cliente da memória
      if (activeClients[sessionId]) {
        if (activeClients[sessionId].profilePicInterval) {
          clearInterval(activeClients[sessionId].profilePicInterval);
        }
        delete activeClients[sessionId];
      }
      
      io.to(userId).emit('disconnected', { sessionId, reason });
    });
    
    // Função para atualizar fotos de perfil dos contatos
    const updateProfilePictures = async () => {
      try {
        if (client && client.info && client.info.wid) {
          // Buscar contatos do banco de dados
          const { data: contacts, error } = await supabase
            .from('contacts')
            .select('*')
            .eq('session_id', sessionId);
          
          if (error) throw error;
          
          // Atualizar foto de perfil de cada contato
          for (const contact of contacts) {
            try {
              // Buscar contato no WhatsApp
              const whatsappContact = await client.getContactById(contact.number + '@c.us');
              if (whatsappContact) {
                const profilePicUrl = await whatsappContact.getProfilePicUrl();
                
                // Atualizar no banco de dados apenas se a URL mudou
                if (profilePicUrl !== contact.profile_pic_url) {
                  await supabase
                    .from('contacts')
                    .update({ profile_pic_url: profilePicUrl })
                    .eq('id', contact.id);
                }
              }
            } catch (contactError) {
              console.error(`Erro ao atualizar foto de ${contact.name}:`, contactError);
            }
          }
        }
      } catch (err) {
        console.error('Erro ao atualizar fotos de perfil:', err);
      }
    };
    
    // Inicializa o cliente
    client.initialize();
    
    // Configurar atualização periódica das fotos de perfil (a cada 6 horas)
    profilePicInterval = setInterval(() => {
      if (client && client.info && client.info.wid) {
        updateProfilePictures();
      } else {
        clearInterval(profilePicInterval);
      }
    }, 6 * 60 * 60 * 1000);
    
    // Atualizar referência do intervalo no registro da sessão ativa
    if (activeClients[sessionId]) {
      activeClients[sessionId].profilePicInterval = profilePicInterval;
    }
    
    res.status(201).json({ 
      sessionId, 
      message: 'Sessão criada. Aguarde o QR Code para escanear.' 
    });
  } catch (error) {
    console.error('Erro ao criar sessão:', error);
    res.status(500).json({ error: 'Erro ao criar sessão', details: error.message });
  }
});

// Rota para obter todas as sessões de um usuário
app.get('/api/sessions/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Verificar se o usuário existe ou criar um novo
    let user;
    try {
      // Tentar encontrar o usuário pelo nome (para compatibilidade com o frontend)
      const { data: users, error } = await supabase
        .from('users')
        .select('*')
        .eq('name', userId);
      
      if (error) throw error;
      
      if (users && users.length > 0) {
        user = users[0];
      } else {
        // Criar um novo usuário com UUID
        const userData = {
          id: uuidv4(),
          name: userId
        };
        
        const { data: newUser, error: createError } = await supabase
          .from('users')
          .insert([userData])
          .select();
        
        if (createError) throw createError;
        
        user = newUser[0];
      }
      
      // Obter sessões do usuário
      const sessions = await WhatsAppSession.findByUserId(user.id);
      
      res.json(sessions);
    } catch (error) {
      console.error('Erro ao obter sessões:', error);
      res.status(500).json({ error: 'Erro ao obter sessões', details: error.message });
    }
  } catch (error) {
    console.error('Erro ao obter sessões:', error);
    res.status(500).json({ error: 'Erro ao obter sessões', details: error.message });
  }
});

// Rota para enviar mensagem
app.post('/api/send', async (req, res) => {
  try {
    const { sessionId, to, message } = req.body;
    
    if (!sessionId || !to || !message) {
      return res.status(400).json({ error: 'ID da sessão, destinatário e mensagem são obrigatórios' });
    }
    
    // Verificar se a sessão existe no banco de dados
    const session = await WhatsAppSession.findById(sessionId);
    
    if (!session || session.status !== 'connected') {
      return res.status(404).json({ error: 'Sessão não encontrada ou desconectada' });
    }
    
    // Verificar se o cliente está ativo em memória
    const clientData = activeClients[sessionId];
    
    if (!clientData || !clientData.client) {
      return res.status(404).json({ error: 'Cliente WhatsApp não encontrado em memória' });
    }
    
    const client = clientData.client;
    
    // Formata o número para o padrão do WhatsApp
    const formattedNumber = to.includes('@c.us') ? to : `${to}@c.us`;
    
    // Envia a mensagem
    const response = await client.sendMessage(formattedNumber, message);
    
    // Salvar a mensagem no banco de dados
    const messageData = {
      id: response.id.id,
      session_id: sessionId,
      from_number: 'me',
      to_number: to.split('@')[0],
      body: message,
      timestamp: Math.floor(Date.now() / 1000),
      is_read: true
    };
    
    try {
      await Message.create(messageData);
    } catch (dbErr) {
      if (!(dbErr && (dbErr.code === '23505' || (dbErr.message || '').toLowerCase().includes('duplicate')))) {
        throw dbErr;
      }
    }
    
    // Emitir evento de mensagem enviada para o cliente
    try {
      // Enviar para o usuário dono da sessão
      if (session && session.user_id) {
        io.to(session.user_id).emit('message', messageData);
      }
    } catch (emitErr) {
      console.error('Falha ao emitir evento de mensagem:', emitErr);
      // Não falhar o request por erro de emissão
    }
    
    res.json({ 
      success: true, 
      messageId: response.id.id,
      timestamp: messageData.timestamp
    });
  } catch (error) {
    console.error(`Erro ao enviar mensagem: ${error}`);
    res.status(500).json({ 
      error: 'Erro ao enviar mensagem', 
      details: error.message 
    });
  }
});

// Enviar mídia via upload de arquivo (multipart/form-data)
// Campos: sessionId, to, caption (opcional) e file (campo do arquivo)
app.post('/api/send-file', upload.single('file'), async (req, res) => {
  try {
    const { sessionId, to, caption } = req.body;
    const file = req.file;

    if (!sessionId || !to || !file) {
      return res.status(400).json({ error: 'ID da sessão, destinatário e arquivo são obrigatórios' });
    }

    // Verificar sessão
    const session = await WhatsAppSession.findById(sessionId);
    if (!session || session.status !== 'connected') {
      return res.status(404).json({ error: 'Sessão não encontrada ou desconectada' });
    }

    // Cliente ativo
    const clientData = activeClients[sessionId];
    if (!clientData || !clientData.client) {
      return res.status(404).json({ error: 'Cliente WhatsApp não encontrado em memória' });
    }
    const client = clientData.client;

    // Formatar número
    const formattedNumber = to.includes('@') ? to : `${to}@c.us`;

    // Criar mídia a partir do arquivo salvo
    const absPath = path.join(UPLOAD_DIR, file.filename);
    const media = MessageMedia.fromFilePath(absPath);

    // Enviar com legenda opcional
    const response = await client.sendMessage(formattedNumber, media, caption ? { caption } : {});

    // Montar body com metadados
    const now = Math.floor(Date.now() / 1000);
    const meta = {
      text: caption || '',
      mediaUrl: `/media/${file.filename}`,
      mediaMime: file.mimetype || media.mimetype || '',
      mediaFilename: file.filename,
      messageType: deriveTypeFromMime(file.mimetype || media.mimetype || '')
    };

    const body = JSON.stringify(meta);

    // Persistir
    const messageData = {
      id: response.id.id,
      session_id: sessionId,
      from_number: 'me',
      to_number: to.split('@')[0],
      body,
      timestamp: now,
      is_read: true
    };
    try { await Message.create(messageData); } catch (dbErr) {
      if (!(dbErr && (dbErr.code === '23505' || (dbErr.message || '').toLowerCase().includes('duplicate')))) throw dbErr;
    }

    // Emitir para o dono da sessão
    try { if (session && session.user_id) io.to(session.user_id).emit('message', messageData); } catch (_) {}

    res.json({ success: true, messageId: response.id.id, timestamp: now, media: meta });
  } catch (error) {
    console.error('Erro ao enviar mídia (arquivo):', error);
    res.status(500).json({ error: 'Erro ao enviar mídia', details: error.message });
  }
});

// Enviar mídia via JSON (URL ou base64)
// Body: { sessionId, to, caption, media: { url? , base64?, mimetype, filename? } }
app.post('/api/send-media', async (req, res) => {
  try {
    const { sessionId, to, caption, media: mediaInput } = req.body || {};
    if (!sessionId || !to || !mediaInput) {
      return res.status(400).json({ error: 'Parâmetros obrigatórios: sessionId, to, media' });
    }

    // Verificar sessão
    const session = await WhatsAppSession.findById(sessionId);
    if (!session || session.status !== 'connected') {
      return res.status(404).json({ error: 'Sessão não encontrada ou desconectada' });
    }

    // Cliente ativo
    const clientData = activeClients[sessionId];
    if (!clientData || !clientData.client) {
      return res.status(404).json({ error: 'Cliente WhatsApp não encontrado em memória' });
    }
    const client = clientData.client;

    // Formatar número
    const formattedNumber = to.includes('@') ? to : `${to}@c.us`;

    // Construir MessageMedia
    let mediaObj;
    if (mediaInput.url) {
      mediaObj = await MessageMedia.fromUrl(mediaInput.url, { unsafeMime: true });
    } else if (mediaInput.base64 && mediaInput.mimetype) {
      const filename = mediaInput.filename || `media_${Date.now()}.${getExtFromMime(mediaInput.mimetype)}`;
      mediaObj = new MessageMedia(mediaInput.mimetype, mediaInput.base64, filename);
    } else {
      return res.status(400).json({ error: 'Media inválida. Forneça url OU base64+mimetype.' });
    }

    // Enviar
    const response = await client.sendMessage(formattedNumber, mediaObj, caption ? { caption } : {});

    // Salvar cópia local para servir em /media
    const nameBase = `${sessionId}_${response.id.id}`;
    let savedFile;
    try { savedFile = saveBase64ToFile(mediaObj.data, mediaObj.mimetype || mediaInput.mimetype || '', nameBase); } catch (_) {}

    const now = Math.floor(Date.now() / 1000);
    const meta = {
      text: caption || '',
      mediaUrl: savedFile ? savedFile.publicUrl : (mediaInput.url || null),
      mediaMime: mediaObj.mimetype || mediaInput.mimetype || '',
      mediaFilename: savedFile ? savedFile.filename : (mediaObj.filename || mediaInput.filename || ''),
      messageType: deriveTypeFromMime(mediaObj.mimetype || mediaInput.mimetype || '')
    };
    const body = JSON.stringify(meta);

    const messageData = {
      id: response.id.id,
      session_id: sessionId,
      from_number: 'me',
      to_number: to.split('@')[0],
      body,
      timestamp: now,
      is_read: true
    };
    try { await Message.create(messageData); } catch (dbErr) {
      if (!(dbErr && (dbErr.code === '23505' || (dbErr.message || '').toLowerCase().includes('duplicate')))) throw dbErr;
    }

    try { if (session && session.user_id) io.to(session.user_id).emit('message', messageData); } catch (_) {}

    res.json({ success: true, messageId: response.id.id, timestamp: now, media: meta });
  } catch (error) {
    console.error('Erro ao enviar mídia (JSON):', error);
    res.status(500).json({ error: 'Erro ao enviar mídia', details: error.message });
  }
});

// Rota para obter mensagens de uma sessão
app.get('/api/messages/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // Verificar se a sessão existe
    const session = await WhatsAppSession.findById(sessionId);
    
    if (!session) {
      return res.status(404).json({ error: 'Sessão não encontrada' });
    }
    
    // Obter mensagens do banco de dados (suporta ?limit=N)
    const limit = Number.parseInt(req.query.limit, 10);
    let messages = await Message.findBySessionId(sessionId, Number.isFinite(limit) && limit > 0 ? limit : undefined);
    
    res.json(messages);
  } catch (error) {
    console.error('Erro ao obter mensagens:', error);
    res.status(500).json({ error: 'Erro ao obter mensagens', details: error.message });
  }
});

// Rota para desconectar uma sessão
app.delete('/api/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // Verificar se a sessão existe no banco de dados
    const session = await WhatsAppSession.findById(sessionId);
    
    if (!session) {
      return res.status(404).json({ error: 'Sessão não encontrada' });
    }
    
    // Verificar se o cliente está ativo em memória
    const clientData = activeClients[sessionId];
    
    if (clientData) {
      // Limpar intervalo de atualização
      if (clientData.profilePicInterval) {
        clearInterval(clientData.profilePicInterval);
      }
      
      // Destruir o cliente WhatsApp
      if (clientData.client) {
        await clientData.client.destroy();
      }
      
      delete activeClients[sessionId];
    }
    
    // Atualizar status no banco de dados
    await WhatsAppSession.updateStatus(sessionId, 'disconnected');

    // Exclusão definitiva opcional (?hard=true)
    const { hard } = req.query;
    if (hard === 'true' || hard === '1') {
      try {
        await WhatsAppSession.delete(sessionId);
        return res.json({ success: true, message: 'Sessão desconectada e excluída com sucesso' });
      } catch (deleteErr) {
        console.error('Erro ao excluir sessão:', deleteErr);
        return res.status(500).json({
          error: 'Sessão desconectada, mas falhou ao excluir',
          details: deleteErr.message,
        });
      }
    }

    // Resposta padrão (apenas desconectar)
    res.json({ success: true, message: 'Sessão desconectada com sucesso' });
  } catch (error) {
    console.error(`Erro ao desconectar sessão: ${error}`);
    res.status(500).json({ 
      error: 'Erro ao desconectar sessão', 
      details: error.message 
    });
  }
});
// Rota para reconectar uma sessão específica
app.post('/api/session/:sessionId/reconnect', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // Verificar se a sessão existe no banco de dados
    const session = await WhatsAppSession.findById(sessionId);
    
    if (!session) {
      return res.status(404).json({ error: 'Sessão não encontrada' });
    }
    
    // Verificar se já existe um cliente ativo
    if (activeClients[sessionId] && activeClients[sessionId].client) {
      return res.json({ 
        success: true, 
        message: 'Sessão já está conectada',
        status: 'connected'
      });
    }
    
    console.log(`Tentando reconectar sessão ${sessionId}...`);
    
    // Criar novo cliente WhatsApp
    const client = new Client({
      authStrategy: new LocalAuth({ clientId: sessionId }),
      puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      }
    });
    
    // Configurar eventos do cliente
    client.on('ready', async () => {
      console.log(`Sessão ${sessionId} reconectada com sucesso!`);
      
      // Armazenar cliente em memória
      activeClients[sessionId] = {
        client,
        profilePicInterval: null,
        connectedAt: Math.floor(Date.now() / 1000)
      };
      
      // Atualizar status no banco
      await WhatsAppSession.updateStatus(sessionId, 'connected');
      
      // Sincronizar mensagens recentes pós-reconexão
      try {
        syncRecentMessages(sessionId, client, session.user_id);
      } catch (e) {
        console.error('Falha ao iniciar syncRecentMessages (reconnect route):', e);
      }

      // Emitir evento para o frontend
      if (session.user_id) {
        io.to(session.user_id).emit('ready', { sessionId });
      }
    });
    
    client.on('authenticated', async () => {
      console.log(`Sessão ${sessionId} autenticada`);
      await WhatsAppSession.updateStatus(sessionId, 'authenticated');
      
      if (session.user_id) {
        io.to(session.user_id).emit('authenticated', { sessionId });
      }
    });
    
    client.on('qr', async (qr) => {
      console.log(`QR Code gerado para reconexão da sessão ${sessionId}`);
      await WhatsAppSession.updateQrCode(sessionId, qr);
      
      if (session.user_id) {
        io.to(session.user_id).emit('qr', { sessionId, qr });
      }
    });
    
    client.on('disconnected', async (reason) => {
      console.log(`Sessão ${sessionId} desconectada: ${reason}`);
      
      // Atualizar status no banco de dados
      await WhatsAppSession.updateStatus(sessionId, 'disconnected');
      
      // Remover cliente da memória
      if (activeClients[sessionId]) {
        if (activeClients[sessionId].profilePicInterval) {
          clearInterval(activeClients[sessionId].profilePicInterval);
        }
        delete activeClients[sessionId];
      }
      
      if (session.user_id) {
        io.to(session.user_id).emit('disconnected', { sessionId, reason });
      }
    });
    
    // Configurar eventos de mensagem (INBOUND)
    client.on('message', async (msg) => {
      try {
        console.log(`Nova mensagem recebida na sessão ${sessionId}`);
        
        const contact = await msg.getContact();
        const chat = await msg.getChat();
        
        // Buscar a foto de perfil do contato
        let profilePicUrl = null;
        try {
          profilePicUrl = await contact.getProfilePicUrl();
        } catch (err) {
          console.error('Erro ao buscar foto de perfil:', err);
        }
        
        // Salvar ou atualizar o contato
        const contactData = {
          id: contact.id.user,
          session_id: sessionId,
          name: contact.name || contact.pushname || contact.number,
          number: contact.number,
          profile_pic_url: profilePicUrl
        };
        
        await Contact.upsert(contactData);
        
        // Normalizar remetente/destinatário e salvar a mensagem
        const fromRaw = (msg.from || '').split('@')[0];
        const toRaw = (msg.to || '').split('@')[0];
        const fromMe = msg.fromMe === true;
        const isGroup = chat.isGroup || (chat.id && chat.id._serialized && chat.id._serialized.includes('g.us'));
        const groupId = (chat && chat.id && (chat.id._serialized || '').split('@')[0]) || null;
        const from_number = fromMe ? 'me' : fromRaw;
        const to_number = fromMe ? toRaw : (isGroup ? (groupId || 'me') : 'me');
        
        // Montar corpo com mídia (se houver)
        let payloadBody = msg.body;
        const recType = msg.type || 'chat';
        if (msg.hasMedia) {
          try {
            const media = await msg.downloadMedia();
            if (media && media.data) {
              const saved = saveBase64ToFile(media.data, media.mimetype || media.mime || '', `${sessionId}_${msg.id.id}`);
              const meta = {
                text: msg.body || '',
                mediaUrl: saved.publicUrl,
                mediaMime: media.mimetype || media.mime || '',
                mediaFilename: saved.filename,
                messageType: recType || deriveTypeFromMime(media.mimetype || media.mime || '')
              };
              payloadBody = JSON.stringify(meta);
            }
          } catch (e) {
            console.error('Erro ao baixar/salvar mídia:', e?.message || e);
          }
        }

        const messageData = {
          id: msg.id.id,
          session_id: sessionId,
          from_number,
          to_number,
          body: payloadBody,
          timestamp: msg.timestamp,
          is_read: false
        };
        
        const savedMessage = await Message.create(messageData);
        
        // Emitir mensagem via socket para o usuário
        if (session.user_id) {
          io.to(session.user_id).emit('message', {
            ...savedMessage,
            contact: contactData,
            chat: {
              name: chat.name || chat.formattedTitle
            }
          });
        }
      } catch (err) {
        console.error('Erro ao processar mensagem:', err);
      }
    });
    
    // Capturar mensagens enviadas por este número (OUTBOUND)
    client.on('message_create', async (msg) => {
      try {
        if (!msg.fromMe) return;
        const chat = await msg.getChat();
        let contact = null;
        try { contact = await chat.getContact(); } catch (_) {}
        let profilePicUrl = null;
        try { if (contact) profilePicUrl = await contact.getProfilePicUrl(); } catch (_) {}

        if (contact) {
          const contactData = {
            id: contact.id.user,
            session_id: sessionId,
            name: contact.name || contact.pushname || contact.number,
            number: contact.number,
            profile_pic_url: profilePicUrl
          };
          try { await Contact.upsert(contactData); } catch (e) { console.error('Erro ao upsert contato (reconnect route message_create):', e); }
        }

        const toRaw = (msg.to || '').split('@')[0];
        // Montar corpo com mídia (se houver)
        let payloadBody = msg.body;
        const outType2 = msg.type || 'chat';
        if (msg.hasMedia) {
          try {
            const media = await msg.downloadMedia();
            if (media && media.data) {
              const saved = saveBase64ToFile(media.data, media.mimetype || media.mime || '', `${sessionId}_${msg.id.id}`);
              const meta = {
                text: msg.body || '',
                mediaUrl: saved.publicUrl,
                mediaMime: media.mimetype || media.mime || '',
                mediaFilename: saved.filename,
                messageType: outType2 || deriveTypeFromMime(media.mimetype || media.mime || '')
              };
              payloadBody = JSON.stringify(meta);
            }
          } catch (e) {
            console.error('Erro ao baixar/salvar mídia (outbound reconnect):', e?.message || e);
          }
        }

        const messageData = {
          id: msg.id.id,
          session_id: sessionId,
          from_number: 'me',
          to_number: toRaw,
          body: payloadBody,
          timestamp: msg.timestamp,
          is_read: true
        };

        try {
          await Message.create(messageData);
        } catch (dbErr) {
          if (!(dbErr && (dbErr.code === '23505' || (dbErr.message || '').toLowerCase().includes('duplicate')))) {
            console.error('Erro ao salvar mensagem (reconnect route message_create):', dbErr);
          }
        }
      } catch (err) {
        console.error('Erro em message_create (reconnect route):', err);
      }
    });

    // Inicializar o cliente
    client.initialize();
    
    res.json({ 
      success: true, 
      message: 'Reconexão iniciada. Aguarde a autenticação.',
      status: 'reconnecting'
    });
    
  } catch (error) {
    console.error('Erro ao reconectar sessão:', error);
    res.status(500).json({ 
      error: 'Erro ao reconectar sessão', 
      details: error.message 
    });
  }
});

// Rota para obter contatos de uma sessão
app.get('/api/contacts/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    console.log(`Obtendo contatos para a sessão: ${sessionId}`);
    
    // Verificar se a sessão existe no banco de dados
    const session = await WhatsAppSession.findById(sessionId);
    
    if (!session) {
      return res.status(404).json({ error: 'Sessão não encontrada' });
    }
    
    // Obter contatos do banco de dados
    const contacts = await Contact.findBySessionId(sessionId);
    console.log(`Encontrados ${contacts.length} contatos`);
    
    // Verificar se os contatos têm fotos de perfil
    contacts.forEach(contact => {
      console.log(`Contato: ${contact.name}, Foto: ${contact.profile_pic_url ? 'Sim' : 'Não'}`);
    });
    
    res.json(contacts);
  } catch (error) {
    console.error('Erro ao obter contatos:', error);
    res.status(500).json({ error: 'Erro ao obter contatos', details: error.message });
  }
});

// Rota para buscar a foto de perfil de um contato específico
app.get('/api/contact-profile/:sessionId/:contactNumber', async (req, res) => {
  try {
    const { sessionId, contactNumber } = req.params;
    
    // Filtrar o contato 'status' do WhatsApp
    if (contactNumber === 'status' || contactNumber === 'status@broadcast') {
      return res.json({ profilePicUrl: null });
    }
    
    console.log(`Buscando foto de perfil para o contato ${contactNumber} na sessão ${sessionId}`);
    
    // Verificar se a sessão existe e está conectada
    const clientData = activeClients[sessionId];
    if (!clientData || !clientData.client) {
      // Retornar null em vez de erro para não poluir o console
      return res.json({ profilePicUrl: null });
    }
    
    const client = clientData.client;
    
    try {
      // Formatar número para o padrão do WhatsApp
      const formattedNumber = contactNumber.includes('@c.us') ? contactNumber : `${contactNumber}@c.us`;
      
      // Buscar contato no WhatsApp
      const contact = await client.getContactById(formattedNumber);
      if (!contact) {
        return res.json({ profilePicUrl: null });
      }
      
      // Buscar foto de perfil
      const profilePicUrl = await contact.getProfilePicUrl();
      console.log(`Foto de perfil para ${contact.name || contact.pushname || contact.number}: ${profilePicUrl ? 'Encontrada' : 'Não encontrada'}`);
      
      // Atualizar no banco de dados
      if (profilePicUrl) {
        const contactData = {
          id: contact.id.user,
          session_id: sessionId,
          name: contact.name || contact.pushname || contact.number,
          number: contact.number,
          profile_pic_url: profilePicUrl
        };
        
        await Contact.upsert(contactData);
      }
      
      res.json({ profilePicUrl });
    } catch (innerError) {
      // Se houver erro ao buscar o contato, retornar null
      console.log(`Não foi possível buscar foto de perfil para ${contactNumber}`);
      res.json({ profilePicUrl: null });
    }
  } catch (error) {
    console.error('Erro ao buscar foto de perfil:', error);
    res.status(500).json({ error: 'Erro ao buscar foto de perfil', details: error.message });
  }
});

// Rota para obter mensagens de uma conversa específica
app.get('/api/conversation/:sessionId/:contactNumber', async (req, res) => {
  try {
    const { sessionId, contactNumber } = req.params;
    
    // Verificar se a sessão existe
    const session = await WhatsAppSession.findById(sessionId);
    
    if (!session) {
      return res.status(404).json({ error: 'Sessão não encontrada' });
    }
    
    // Obter mensagens da conversa (suporta ?limit=N)
    const limit = Number.parseInt(req.query.limit, 10);
    let messages = await Message.findConversation(sessionId, contactNumber, Number.isFinite(limit) && limit > 0 ? limit : undefined);
    
    res.json(messages);
  } catch (error) {
    console.error('Erro ao obter conversa:', error);
    res.status(500).json({ error: 'Erro ao obter conversa', details: error.message });
  }
});

// Rota para obter contatos por status
app.get('/api/contacts/:sessionId/:status', async (req, res) => {
  try {
    const { sessionId, status } = req.params;
    
    // Verificar se a sessão existe
    const session = await WhatsAppSession.findById(sessionId);
    
    if (!session) {
      return res.status(404).json({ error: 'Sessão não encontrada' });
    }
    
    // Validar status
    if (!['open', 'waiting', 'resolved'].includes(status)) {
      return res.status(400).json({ error: 'Status inválido' });
    }
    
    // Obter contatos filtrados por status
    const contacts = await Contact.findBySessionId(sessionId, status);
    
    res.json(contacts);
  } catch (error) {
    console.error('Erro ao obter contatos por status:', error);
    res.status(500).json({ error: 'Erro ao obter contatos', details: error.message });
  }
});

// Rota para atualizar o status de um contato
app.put('/api/contact/:contactId/status', async (req, res) => {
  try {
    const { contactId } = req.params;
    const { status } = req.body;
    
    // Validar status
    if (!['open', 'waiting', 'resolved'].includes(status)) {
      return res.status(400).json({ error: 'Status inválido' });
    }
    
    // Atualizar status do contato
    const updatedContact = await Contact.updateStatus(contactId, status);
    
    if (!updatedContact) {
      return res.status(404).json({ error: 'Contato não encontrado' });
    }
    
    // Emitir evento de atualização via socket
    const session = await WhatsAppSession.findById(updatedContact.session_id);
    if (session && session.user_id) {
      io.to(session.user_id).emit('contact-status-updated', {
        contactId,
        status,
        contact: updatedContact
      });
    }
    
    res.json(updatedContact);
  } catch (error) {
    console.error('Erro ao atualizar status do contato:', error);
    res.status(500).json({ error: 'Erro ao atualizar status', details: error.message });
  }
});

// Configuração do Socket.IO
io.on('connection', (socket) => {
  console.log(`Novo cliente conectado: ${socket.id}`);
  
  // Autenticação do socket
  socket.on('authenticate', (userId) => {
    socket.join(userId);
    console.log(`Cliente ${socket.id} autenticado como usuário ${userId}`);
  });
  
  socket.on('disconnect', () => {
    console.log(`Cliente desconectado: ${socket.id}`);
  });
});

// Função para reconectar sessões existentes ao iniciar o servidor
const reconnectExistingSessions = async () => {
  try {
    console.log('Verificando sessões existentes para reconectar...');
    
    // Buscar todas as sessões conectadas do banco de dados
    const { data: sessions, error } = await supabase
      .from('whatsapp_sessions')
      .select('*')
      .eq('status', 'connected');
    
    if (error) {
      console.error('Erro ao buscar sessões:', error);
      return;
    }
    
    if (!sessions || sessions.length === 0) {
      console.log('Nenhuma sessão conectada encontrada.');
      return;
    }
    
    console.log(`Encontradas ${sessions.length} sessões para reconectar.`);
    
    // Reconectar cada sessão
    for (const session of sessions) {
      try {
        console.log(`Reconectando sessão ${session.id}...`);
        
        // Criar novo cliente WhatsApp
        const client = new Client({
          authStrategy: new LocalAuth({ clientId: session.id }),
          puppeteer: {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
          }
        });
        
        // Configurar eventos do cliente
        client.on('ready', async () => {
          console.log(`Sessão ${session.id} reconectada com sucesso!`);
          
          // Armazenar cliente em memória
          activeClients[session.id] = {
            client,
            profilePicInterval: null,
            connectedAt: Math.floor(Date.now() / 1000)
          };
          
          // Atualizar status no banco
          await WhatsAppSession.updateStatus(session.id, 'connected');

          // Sincronizar mensagens recentes após reconectar no boot
          try {
            syncRecentMessages(session.id, client, session.user_id);
          } catch (e) {
            console.error('Falha ao iniciar syncRecentMessages (reconnectExistingSessions):', e);
          }
        });
        
        client.on('authenticated', () => {
          console.log(`Sessão ${session.id} autenticada`);
        });
        
        client.on('disconnected', async (reason) => {
          console.log(`Sessão ${session.id} desconectada: ${reason}`);
          
          // Atualizar status no banco de dados
          await WhatsAppSession.updateStatus(session.id, 'disconnected');
          
          // Remover cliente da memória
          if (activeClients[session.id]) {
            delete activeClients[session.id];
          }
        });
        
        // Configurar eventos de mensagem (INBOUND)
        client.on('message', async (msg) => {
          try {
            if (msg.fromMe) return; // evitar duplicar com message_create
            console.log(`Nova mensagem recebida na sessão ${session.id}`);
            
            const contact = await msg.getContact();
            const chat = await msg.getChat();
            
            // Buscar a foto de perfil do contato
            let profilePicUrl = null;
            try {
              profilePicUrl = await contact.getProfilePicUrl();
            } catch (err) {
              console.error('Erro ao buscar foto de perfil:', err);
            }
            
            // Salvar/atualizar contato
            const contactData = {
              id: contact.id.user,
              session_id: session.id,
              name: contact.name || contact.pushname || contact.number,
              number: contact.number,
              profile_pic_url: profilePicUrl
            };
            
            await Contact.upsert(contactData);
            
            // Normalizar remetente/destinatário e salvar a mensagem
            const fromRaw = (msg.from || '').split('@')[0];
            const toRaw = (msg.to || '').split('@')[0];
            const fromMe = msg.fromMe === true;
            const from_number = fromMe ? 'me' : fromRaw;
            const to_number = fromMe ? toRaw : 'me';
            
            const messageData = {
              id: msg.id.id,
              session_id: session.id,
              from_number,
              to_number,
              body: msg.body,
              timestamp: msg.timestamp,
              is_read: false
            };
            
            let savedMessage = null;
            try {
              savedMessage = await Message.create(messageData);
            } catch (dbErr) {
              if (dbErr && (dbErr.code === '23505' || (dbErr.message || '').toLowerCase().includes('duplicate'))) {
                try { savedMessage = await Message.findById(messageData.id); } catch (_) {}
              } else {
                throw dbErr;
              }
            }
            
            // Emitir mensagem via socket para o usuário
            if (session.user_id) {
              io.to(session.user_id).emit('message', {
                ...savedMessage,
                contact: contactData,
                chat: {
                  name: chat.name || chat.formattedTitle
                }
              });
            }
          } catch (err) {
            console.error('Erro ao processar mensagem:', err);
          }
        });
        
        // Configurar evento de mensagem criada (OUTBOUND)
        client.on('message_create', async (msg) => {
          try {
            if (!msg.fromMe) return;
            const chat = await msg.getChat();
            let contact = null;
            try { contact = await chat.getContact(); } catch (_) {}
            let profilePicUrl = null;
            try { if (contact) profilePicUrl = await contact.getProfilePicUrl(); } catch (_) {}

            if (contact) {
              const contactData = {
                id: contact.id.user,
                session_id: session.id,
                name: contact.name || contact.pushname || contact.number,
                number: contact.number,
                profile_pic_url: profilePicUrl
              };
              try { await Contact.upsert(contactData); } catch (e) { console.error('Erro upsert contato (boot message_create):', e); }
            }

            const toRaw = (msg.to || '').split('@')[0];
            const messageData = {
              id: msg.id.id,
              session_id: session.id,
              from_number: 'me',
              to_number: toRaw,
              body: msg.body,
              timestamp: msg.timestamp,
              is_read: true
            };

            try {
              await Message.create(messageData);
            } catch (dbErr) {
              if (!(dbErr && (dbErr.code === '23505' || (dbErr.message || '').toLowerCase().includes('duplicate')))) {
                console.error('Erro ao salvar mensagem (boot message_create):', dbErr);
              }
            }
          } catch (err) {
            console.error('Erro em message_create (boot):', err);
          }
        });

        // Inicializar o cliente
        client.initialize();
        
      } catch (sessionError) {
        console.error(`Erro ao reconectar sessão ${session.id}:`, sessionError);
        // Marcar sessão como desconectada se falhar
        await WhatsAppSession.updateStatus(session.id, 'disconnected');
      }
    }
  } catch (error) {
    console.error('Erro ao reconectar sessões:', error);
  }
};

// Inicialização do servidor
const PORT = process.env.PORT || 5000;
server.listen(PORT, async () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  
  // Aguardar um pouco e então tentar reconectar sessões existentes
  setTimeout(() => {
    reconnectExistingSessions();
  }, 2000);
});
