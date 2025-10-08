import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import socketService from '../services/socket';
import { getSessions, getContacts, getConversation, updateContactStatus, getMessages } from '../services/api';

const AppContext = createContext();

export const useAppContext = () => useContext(AppContext);

export const AppProvider = ({ children }) => {
  // Estado do usuário (simplificado para desenvolvimento local)
  const [user, setUser] = useState({ id: 'user1', name: 'Usuário Local' });
  
  // Estado das sessões WhatsApp
  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  
  // Estado das mensagens
  const [messages, setMessages] = useState({});
  const [contacts, setContacts] = useState({});
  const [contactsByStatus, setContactsByStatus] = useState({
    open: {},
    waiting: {},
    resolved: {}
  });
  
  // Estado de carregamento e erros
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Estado do QR Code
  const [qrCode, setQrCode] = useState(null);
  
  // Função para carregar sessões do usuário
  const loadSessions = useCallback(async () => {
    if (!user?.id) return;
    
    setLoading(true);
    try {
      const userSessions = await getSessions(user.id);
      setSessions(userSessions);
      setLoading(false);
    } catch (err) {
      console.error('Erro ao carregar sessões:', err);
      setError('Falha ao carregar sessões. Tente novamente.');
      setLoading(false);
    }
  }, [user?.id, setLoading, setSessions, setError]);
  
  // Função para conectar ao socket
  const connectSocket = useCallback(() => {
    if (!user?.id) return;
    
    socketService.connect(user.id);
    
    // Evento de QR Code
    socketService.on('qr', (data) => {
      setQrCode(data.qr);
    });
    
    // Evento de autenticação
    socketService.on('authenticated', (data) => {
      setQrCode(null);
    });
    
    // Evento de pronto
    socketService.on('ready', async (data) => {
      // Usamos getSessions diretamente para evitar dependência circular
      if (user?.id) {
        setLoading(true);
        getSessions(user.id)
          .then(userSessions => {
            setSessions(userSessions);
            setLoading(false);
          })
          .catch(err => {
            console.error('Erro ao carregar sessões:', err);
            setError('Falha ao carregar sessões. Tente novamente.');
            setLoading(false);
          });
      }
      // Carregar histórico desta sessão assim que ficar pronta
      try {
        const sid = data?.sessionId;
        if (sid) {
          const sessionMessages = await getMessages(sid, 1000);
          setMessages(prev => ({ ...prev, [sid]: sessionMessages }));
          // Também atualizar contatos após o backend sincronizar e fazer upsert
          await loadContacts(sid);
        }
      } catch (e) {
        console.error('Falha ao carregar histórico após ready:', e);
      }
    });
    
    // Evento de mensagem
    socketService.on('message', (data) => {
      console.log('Nova mensagem recebida via socket:', data);
      
      if (!data || !data.session_id) {
        console.error('Mensagem recebida inválida:', data);
        return;
      }
      
      // Verificar se a mensagem já existe para evitar duplicação
      setMessages(prev => {
        const sessionMessages = [...(prev[data.session_id] || [])];
        
        // Verificar se a mensagem já existe pelo ID
        const messageExists = sessionMessages.some(msg => msg.id === data.id);
        
        // Verificar se é uma mensagem local (pendente) que está sendo confirmada.
        // Para evitar duplicações com mídia (corpos diferentes), usamos heurística por
        // destino/origem e janela de tempo.
        const isPendingMessage = !messageExists && sessionMessages.some(msg => {
          if (!msg.pending) return false;
          const samePeer = (msg.to_number === data.to_number && msg.from_number === 'me') ||
                           (msg.to_number === data.from_number && msg.from_number === 'me');
          const withinWindow = typeof data.timestamp === 'number'
            ? Math.abs(msg.timestamp - data.timestamp) < 120
            : Math.abs(msg.timestamp - Math.floor(Date.now()/1000)) < 120;
          return samePeer && withinWindow;
        });
        
        if (messageExists) {
          console.log('Mensagem já existe, ignorando:', data.id);
          return prev;
        }
        
        if (isPendingMessage) {
          console.log('Atualizando mensagem pendente com confirmação do servidor:', data.id);
          
          // Encontrar e atualizar a mensagem pendente
          let updatedOnce = false;
          const updatedMessages = sessionMessages.map(msg => {
            if (!updatedOnce && msg.pending) {
              const samePeer = (msg.to_number === data.to_number && msg.from_number === 'me') ||
                               (msg.to_number === data.from_number && msg.from_number === 'me');
              const withinWindow = typeof data.timestamp === 'number'
                ? Math.abs(msg.timestamp - data.timestamp) < 120
                : Math.abs(msg.timestamp - Math.floor(Date.now()/1000)) < 120;
              if (samePeer && withinWindow) {
                updatedOnce = true;
                return {
                  ...data,
                  timestamp: data.timestamp || msg.timestamp // manter timestamp local se servidor não enviar
                };
              }
            }
            return msg;
          });
          
          return {
            ...prev,
            [data.session_id]: updatedMessages
          };
        }
        
        // Sempre adicionar mensagens novas, mesmo que não sejam pendentes
        console.log('Adicionando nova mensagem ao estado:', data);
        return {
          ...prev,
          [data.session_id]: [...sessionMessages, data]
        };
      });
      
      // Atualiza contatos se necessário
      if (data.contact) {
        setContacts(prev => {
          const sessionContacts = {...(prev[data.session_id] || {})};
          sessionContacts[data.contact.number] = {
            ...sessionContacts[data.contact.number],
            ...data.contact,
            number: data.contact.number // Garantir que o número está definido
          };
          
          return {
            ...prev,
            [data.session_id]: sessionContacts
          };
        });
      }
    });
    
    // Evento de desconexão
    socketService.on('disconnected', (data) => {
      // Usamos getSessions diretamente para evitar dependência circular
      if (user?.id) {
        setLoading(true);
        getSessions(user.id)
          .then(userSessions => {
            setSessions(userSessions);
            setLoading(false);
          })
          .catch(err => {
            console.error('Erro ao carregar sessões:', err);
            setError('Falha ao carregar sessões. Tente novamente.');
            setLoading(false);
          });
      }
      
      if (activeSession === data.sessionId) {
        setActiveSession(null);
      }
    });
  }, [user?.id]);
  
  // Efeito para carregar sessões quando o usuário muda
  useEffect(() => {
    if (user?.id) {
      loadSessions();
      connectSocket();
    }
    return () => {
      socketService.disconnect();
    };
  }, [user?.id, loadSessions, connectSocket]);
  
  // Função para carregar contatos
  const loadContacts = useCallback(async (sessionId, status = null) => {
    if (!sessionId) return;
    
    setLoading(true);
    try {
      console.log(`Carregando contatos para a sessão: ${sessionId}${status ? ` com status ${status}` : ''}`);
      const contactsList = await getContacts(sessionId, status);
      console.log(`Contatos recebidos do backend:`, contactsList);
      
      // Converter para o formato esperado pelo frontend
      const contactsMap = {};
      contactsList.forEach(contact => {
        console.log(`Processando contato: ${contact.name}, Status: ${contact.conversation_status}`);
        contactsMap[contact.number] = {
          id: contact.id,
          name: contact.name || contact.number,
          number: contact.number,
          profilePic: contact.profile_pic_url || null,
          conversationStatus: contact.conversation_status || 'waiting'
        };
      });
      
      console.log('Mapa de contatos processado:', contactsMap);
      
      // Atualizar o estado geral de contatos
      setContacts(prev => {
        const updated = {
          ...prev,
          [sessionId]: {
            ...prev[sessionId],
            ...contactsMap
          }
        };
        return updated;
      });
      
      // Derivar estados por status localmente para evitar requisições extras (e 404) 
      const toContactItem = (c) => ({
        id: c.id,
        name: c.name || c.number,
        number: c.number,
        profilePic: c.profile_pic_url || null,
        conversationStatus: c.conversation_status || 'waiting'
      });

      if (status) {
        // Atualiza somente o status solicitado com base na lista recebida
        const filtered = contactsList.filter(c => (c.conversation_status || 'waiting') === status);
        const map = {};
        filtered.forEach(c => { map[c.number] = toContactItem(c); });
        setContactsByStatus(prev => ({
          ...prev,
          [status]: { ...prev[status], [sessionId]: map }
        }));
      } else {
        // Atualiza os três status a partir de contactsList em memória
        const openMap = {};
        const waitingMap = {};
        const resolvedMap = {};
        contactsList.forEach(c => {
          const key = (c.conversation_status || 'waiting');
          const item = toContactItem(c);
          if (key === 'open') openMap[c.number] = item;
          else if (key === 'resolved') resolvedMap[c.number] = item;
          else waitingMap[c.number] = item; // default
        });
        setContactsByStatus({
          open: { [sessionId]: openMap },
          waiting: { [sessionId]: waitingMap },
          resolved: { [sessionId]: resolvedMap }
        });
      }
      
      setLoading(false);
    } catch (err) {
      console.error('Erro ao carregar contatos:', err);
      setError('Falha ao carregar contatos. Tente novamente.');
      setLoading(false);
    }
  }, [setLoading, setContacts, setContactsByStatus, setError]);
  
  // Função para atualizar o status de um contato
  const changeContactStatus = useCallback(async (contactId, status, sessionId, contactNumber) => {
    if (!contactId || !status || !sessionId || !contactNumber) return;
    
    try {
      const updatedContact = await updateContactStatus(contactId, status);
      
      // Atualizar o estado geral de contatos
      setContacts(prev => {
        const sessionContacts = {...(prev[sessionId] || {})};
        if (sessionContacts[contactNumber]) {
          sessionContacts[contactNumber] = {
            ...sessionContacts[contactNumber],
            conversationStatus: status
          };
        }
        
        return {
          ...prev,
          [sessionId]: sessionContacts
        };
      });
      
      // Atualizar o estado por status
      setContactsByStatus(prev => {
        // Remover o contato do status anterior
        const newState = { ...prev };
        Object.keys(newState).forEach(statusKey => {
          if (newState[statusKey][sessionId] && newState[statusKey][sessionId][contactNumber]) {
            const { [contactNumber]: removed, ...rest } = newState[statusKey][sessionId];
            newState[statusKey][sessionId] = rest;
          }
        });
        
        // Adicionar o contato ao novo status
        if (!newState[status][sessionId]) {
          newState[status][sessionId] = {};
        }
        
        newState[status][sessionId][contactNumber] = {
          id: contactId,
          name: updatedContact.name || contactNumber,
          number: contactNumber,
          profilePic: updatedContact.profile_pic_url || null,
          conversationStatus: status
        };
        
        return newState;
      });
      
      return updatedContact;
    } catch (err) {
      console.error('Erro ao atualizar status do contato:', err);
      setError('Falha ao atualizar status do contato. Tente novamente.');
      throw err;
    }
  }, [setContacts, setContactsByStatus, setError]);
  
  // Função para carregar conversa específica
  const loadConversation = useCallback(async (sessionId, contactNumber) => {
    if (!sessionId || !contactNumber) {
      console.warn('loadConversation chamado sem sessionId ou contactNumber');
      return;
    }
    
    console.log(`Carregando conversa para sessão ${sessionId} e contato ${contactNumber}`);
    setLoading(true);
    
    try {
      const conversationMessages = await getConversation(sessionId, contactNumber);
      console.log(`Recebidas ${conversationMessages.length} mensagens da API`);
      
      // Atualizar mensagens no estado
      setMessages(prev => {
        // Criar cópia das mensagens da sessão atual
        const sessionMessages = [...(prev[sessionId] || [])];
        
        // Filtrar mensagens existentes para evitar duplicação
        const existingIds = new Set(sessionMessages.map(msg => msg.id));
        
        // Filtrar mensagens pendentes relacionadas a este contato
        const pendingMessages = sessionMessages.filter(msg => 
          msg.pending && 
          ((msg.from_number === 'me' && msg.to_number === contactNumber) || 
           (msg.from_number === contactNumber && (msg.to_number === 'me' || !msg.to_number)))
        );
        
        // Filtrar novas mensagens que não existem ainda
        const newMessages = conversationMessages.filter(msg => !existingIds.has(msg.id));
        
        console.log(`Adicionando ${newMessages.length} novas mensagens ao estado`);
        console.log(`Mantendo ${pendingMessages.length} mensagens pendentes`);
        
        // Remover mensagens antigas deste contato (exceto as pendentes)
        const otherMessages = sessionMessages.filter(msg => {
          // Manter mensagens de outros contatos
          const isOtherContact = 
            (msg.from_number !== 'me' && msg.from_number !== contactNumber) || 
            (msg.to_number !== contactNumber && msg.to_number !== 'me');
          
          // Manter mensagens pendentes deste contato
          const isPending = msg.pending === true;
          
          return isOtherContact || isPending;
        });
        
        // Combinar mensagens: outras mensagens + novas mensagens + mensagens pendentes
        const updatedMessages = [...otherMessages, ...newMessages, ...pendingMessages];
        
        return {
          ...prev,
          [sessionId]: updatedMessages
        };
      });
      
      setLoading(false);
    } catch (err) {
      console.error('Erro ao carregar conversa:', err);
      setError('Falha ao carregar conversa. Tente novamente.');
      setLoading(false);
    }
  }, [setLoading, setMessages, setError]);
  
  // Valor do contexto
  const value = {
    user,
    setUser,
    sessions,
    setSessions,
    activeSession,
    setActiveSession,
    messages,
    setMessages,
    contacts,
    setContacts,
    contactsByStatus,
    setContactsByStatus,
    loading,
    setLoading,
    error,
    setError,
    qrCode,
    setQrCode,
    loadSessions,
    loadContacts,
    loadConversation,
    changeContactStatus
  };
  
  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};

export default AppContext;
