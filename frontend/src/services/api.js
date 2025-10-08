import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';

// Deriva a base do servidor removendo "/api" do fim da URL, se presente
const deriveServerBaseUrl = () => {
  try {
    const url = new URL(API_URL);
    if (url.pathname.endsWith('/api')) {
      url.pathname = url.pathname.replace(/\/?api$/, '');
    }
    return url.toString().replace(/\/$/, '');
  } catch (_) {
    // Fallback para desenvolvimento
    return 'http://localhost:5001';
  }
};

const SERVER_BASE_URL = deriveServerBaseUrl();

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const createSession = async (userId, sessionName) => {
  try {
    const response = await api.post('/session', { userId, sessionName });
    return response.data;
  } catch (error) {
    console.error('Erro ao criar sessão:', error);
    throw error;
  }
};

export const sendFile = async (sessionId, to, file, caption = '') => {
  if (!sessionId || !to || !file) {
    throw new Error('Parâmetros inválidos para envio de arquivo');
  }
  const form = new FormData();
  form.append('sessionId', sessionId);
  form.append('to', to);
  if (caption) form.append('caption', caption);
  form.append('file', file);

  const response = await api.post('/send-file', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

export const sendMedia = async (sessionId, to, media, caption = '') => {
  // media: { url? , base64? , mimetype?, filename? }
  if (!sessionId || !to || !media) {
    throw new Error('Parâmetros inválidos para envio de mídia');
  }
  const response = await api.post('/send-media', {
    sessionId,
    to,
    caption,
    media,
  });
  return response.data;
};

export const getServerBaseUrl = () => SERVER_BASE_URL;

export const getSessions = async (userId) => {
  try {
    const response = await api.get(`/sessions/${userId}`);
    return response.data;
  } catch (error) {
    console.error('Erro ao obter sessões:', error);
    throw error;
  }
};

export const getMessages = async (sessionId, limit) => {
  try {
    const response = await api.get(`/messages/${sessionId}`, {
      params: Number.isFinite(limit) && limit > 0 ? { limit } : undefined,
    });
    return response.data;
  } catch (error) {
    // Se a sessão não existir, retorne lista vazia para não quebrar a UI
    if (error?.response?.status === 404) {
      console.warn(`Sessão ${sessionId} não encontrada ao obter mensagens. Retornando [].`);
      return [];
    }
    console.error('Erro ao obter mensagens:', error);
    throw error;
  }
};

export const getContacts = async (sessionId, status = null) => {
  try {
    // Sempre buscar a lista geral e filtrar localmente para evitar chamadas /status
    const response = await api.get(`/contacts/${sessionId}`);
    const list = response.data || [];
    if (!status) return list;
    return list.filter(c => (c.conversation_status || 'waiting') === status);
  } catch (error) {
    // Tratar 404 (sessão não encontrada) como lista vazia para evitar erros na UI
    if (error?.response?.status === 404) {
      console.warn(`Sessão ${sessionId} não encontrada ao obter contatos${status ? ' (' + status + ')' : ''}. Retornando [].`);
      return [];
    }
    console.error('Erro ao obter contatos:', error);
    throw error;
  }
};

export const updateContactStatus = async (contactId, status) => {
  try {
    const response = await api.put(`/contact/${contactId}/status`, { status });
    return response.data;
  } catch (error) {
    console.error('Erro ao atualizar status do contato:', error);
    throw error;
  }
};

export const getConversation = async (sessionId, contactNumber, limit) => {
  try {
    const response = await api.get(`/conversation/${sessionId}/${contactNumber}`, {
      params: Number.isFinite(limit) && limit > 0 ? { limit } : undefined,
    });
    return response.data;
  } catch (error) {
    console.error('Erro ao obter conversa:', error);
    throw error;
  }
};

export const sendMessage = async (sessionId, to, message) => {
  try {
    // Verificar se os parâmetros são válidos
    if (!sessionId || !to || !message) {
      console.warn('sendMessage: Parâmetros inválidos', { sessionId, to, message });
      throw new Error('Parâmetros inválidos para envio de mensagem');
    }
    
    // Enviar a mensagem para o endpoint principal
    try {
      console.log(`Enviando mensagem para ${to} via sessão ${sessionId}`);
      const response = await api.post('/send', { sessionId, to, message });
      console.log('Mensagem enviada com sucesso:', response.data);
      return response.data;
    } catch (error) {
      // Extrair detalhes úteis do erro da API
      const status = error?.response?.status;
      const data = error?.response?.data;
      const serverMsg = data?.details || data?.error || data?.message;
      const finalMessage = serverMsg || (status ? `Falha na API (HTTP ${status})` : (error?.message || 'Erro ao enviar mensagem'));
      
      console.error('Erro ao enviar mensagem:', { status, data, message: finalMessage });
      throw new Error(finalMessage);
    }
  } catch (error) {
    console.error('Erro ao processar envio de mensagem:', { message: error?.message });
    throw error; // Propagar o erro para ser tratado pelo componente
  }
};

export const disconnectSession = async (sessionId) => {
  try {
    const response = await api.delete(`/session/${sessionId}`);
    return response.data;
  } catch (error) {
    console.error('Erro ao desconectar sessão:', error);
    throw error;
  }
};

export const reconnectSession = async (sessionId) => {
  try {
    const response = await api.post(`/session/${sessionId}/reconnect`);
    return response.data;
  } catch (error) {
    console.error('Erro ao reconectar sessão:', error);
    throw error;
  }
};

export const deleteSession = async (sessionId) => {
  try {
    // Exclusão definitiva com query ?hard=true
    const response = await api.delete(`/session/${sessionId}`, { params: { hard: true } });
    return response.data;
  } catch (error) {
    console.error('Erro ao excluir sessão:', error);
    throw error;
  }
};

export const getContactProfilePic = async (sessionId, contactNumber) => {
  try {
    // Verificar se os parâmetros são válidos
    if (!sessionId || !contactNumber) {
      console.warn('getContactProfilePic: Parâmetros inválidos', { sessionId, contactNumber });
      return null;
    }
    
    const response = await api.get(`/contact-profile/${sessionId}/${contactNumber}`);
    return response.data.profilePicUrl;
  } catch (error) {
    // Se for erro 404, apenas retornar null silenciosamente
    if (error.response && error.response.status === 404) {
      console.warn(`Foto de perfil não encontrada para o contato ${contactNumber}`);
    } else {
      console.error('Erro ao obter foto de perfil:', error);
    }
    return null;
  }
};

export default api;
