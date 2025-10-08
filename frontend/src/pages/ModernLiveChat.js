import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { getMessages, sendMessage, sendFile, getContactProfilePic, getServerBaseUrl } from '../services/api';
import '../styles/ChatStyles.css';

// Ícones como componentes SVG
const SearchIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M9 17A8 8 0 1 0 9 1a8 8 0 0 0 0 16zM15 15l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

const PlusIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M10 5v10M5 10h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

const SendIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M2 10l16-8-6 8 6 8-16-8z" fill="currentColor"/>
  </svg>
);

const AttachIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M10 18a6 6 0 0 1-6-6V6a4 4 0 0 1 8 0v6a2 2 0 0 1-4 0V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

const EmojiIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2"/>
    <circle cx="7" cy="8" r="1" fill="currentColor"/>
    <circle cx="13" cy="8" r="1" fill="currentColor"/>
    <path d="M7 12c1 2 3 2 6 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

const MoreIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="5" cy="10" r="1.5" fill="currentColor"/>
    <circle cx="10" cy="10" r="1.5" fill="currentColor"/>
    <circle cx="15" cy="10" r="1.5" fill="currentColor"/>
  </svg>
);

const PhoneIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 5a2 2 0 0 1 2-2h2l2 4-1.5 1.5a10 10 0 0 0 5 5L14 12l4 2v2a2 2 0 0 1-2 2A13 13 0 0 1 3 5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const VideoIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="5" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="2"/>
    <path d="M14 8l4-2v8l-4-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 8l3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const DoubleCheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M1 8l3 3 7-7M6 8l3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const MenuIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 12h18M3 6h18M3 18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

const LeftArrowIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const RightArrowIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6 12l4-4-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const ModernLiveChat = () => {
  const { 
    activeSession, 
    setActiveSession,
    messages, 
    setMessages, 
    contacts,
    setContacts,
    contactsByStatus,
    setContactsByStatus,
    loadContacts,
    loadConversation,
    changeContactStatus
  } = useAppContext();
  
  const [currentChat, setCurrentChat] = useState(null);
  const [messageText, setMessageText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [activeStatusTab, setActiveStatusTab] = useState('waiting');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedFilePreview, setSelectedFilePreview] = useState(null);
  
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const fileInputRef = useRef(null);
  
  // Função para carregar mensagens
  const loadMessages = useCallback(async (sessionId) => {
    try {
      const sessionMessages = await getMessages(sessionId);
      setMessages(prev => ({
        ...prev,
        [sessionId]: sessionMessages
      }));
    } catch (err) {
      console.error('Erro ao carregar mensagens:', err);
    }
  }, [setMessages]);
  
  // Carregar mensagens e contatos da sessão ativa
  useEffect(() => {
    if (activeSession) {
      loadMessages(activeSession);
      loadContacts(activeSession);
    }
  }, [activeSession, loadMessages, loadContacts]);
  
  // Função para buscar e atualizar a foto de perfil
  const updateContactProfilePic = useCallback(async (sessionId, contactNumber) => {
    if (!sessionId || !contactNumber) return;
    
    try {
      const profilePicUrl = await getContactProfilePic(sessionId, contactNumber);
      
      if (profilePicUrl) {
        setContacts(prev => {
          const sessionContacts = prev[sessionId] || {};
          const existing = sessionContacts[contactNumber];
          if (existing?.profilePic === profilePicUrl) {
            return prev;
          }
          return {
            ...prev,
            [sessionId]: {
              ...sessionContacts,
              [contactNumber]: {
                ...existing,
                number: contactNumber,
                name: existing?.name || contactNumber,
                profilePic: profilePicUrl
              }
            }
          };
        });
      }
    } catch (err) {
      // Silenciosamente ignorar erros de foto de perfil - não são críticos
      console.log('Foto de perfil não disponível para:', contactNumber);
    }
  }, [setContacts]);
  
  // Carregar conversa específica quando o chat atual muda
  useEffect(() => {
    if (activeSession && currentChat?.number) {
      loadConversation(activeSession, currentChat.number);
      updateContactProfilePic(activeSession, currentChat.number);
    }
  }, [activeSession, currentChat, loadConversation, updateContactProfilePic]);
  
  // Rolar para a última mensagem
  useEffect(() => {
    scrollToBottom();
  }, [messages, activeSession, currentChat]);
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Utilitário para interpretar body (pode ser texto ou JSON com metadados de mídia)
  const parseBody = (body) => {
    if (!body) return { text: '' };
    if (typeof body === 'string') {
      try {
        const meta = JSON.parse(body);
        if (meta && (meta.mediaUrl || meta.mediaMime || meta.messageType)) return meta;
        return { text: body };
      } catch (_) {
        return { text: body };
      }
    }
    return body;
  };

  const isImageType = (meta) => {
    const t = (meta?.messageType || '').toString();
    const m = (meta?.mediaMime || '').toString();
    return t.startsWith('image') || m.startsWith('image/');
  };
  const isAudioType = (meta) => {
    const t = (meta?.messageType || '').toString();
    const m = (meta?.mediaMime || '').toString();
    return t.startsWith('audio') || m.startsWith('audio/');
  };
  const absoluteMediaUrl = (url) => {
    if (!url) return null;
    if (/^https?:\/\//i.test(url)) return url;
    const base = getServerBaseUrl();
    return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
  };
  
  // Função para lidar com a digitação
  const handleTyping = (e) => {
    setMessageText(e.target.value);
    setIsTyping(true);
    
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
    }, 1000);
  };
  
  const handleSendMessage = async () => {
    if (!currentChat || !currentChat.sessionId) return;
    // Se houver arquivo selecionado, envia como mídia com legenda
    if (selectedFile) {
      return await handleSendSelectedFile();
    }
    if (!messageText.trim()) return;
    
    setIsTyping(false);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    const tempId = `local_${Date.now()}`;
    const messageContent = messageText.trim();
    const timestamp = Math.floor(Date.now() / 1000);
    
    const newMessage = {
      id: tempId,
      session_id: currentChat.sessionId,
      from_number: 'me',
      to_number: currentChat.number,
      body: messageContent,
      timestamp: timestamp,
      is_read: true,
      pending: true
    };
    
    setMessageText('');
    
    setMessages(prev => {
      const sessionMessages = [...(prev[currentChat.sessionId] || [])];
      sessionMessages.push(newMessage);
      return {
        ...prev,
        [currentChat.sessionId]: sessionMessages
      };
    });
    
    setTimeout(scrollToBottom, 100);
    
    try {
      const response = await sendMessage(currentChat.sessionId, currentChat.number, messageContent);
      
      setMessages(prev => {
        const sessionMessages = [...(prev[currentChat.sessionId] || [])];
        const messageIndex = sessionMessages.findIndex(msg => msg.id === tempId);
        
        if (messageIndex !== -1) {
          sessionMessages[messageIndex] = {
            ...sessionMessages[messageIndex],
            id: response.messageId || tempId,
            pending: false,
            status: 'sent',
            timestamp: response.timestamp || timestamp
          };
        }
        
        return {
          ...prev,
          [currentChat.sessionId]: sessionMessages
        };
      });
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
      
      setMessages(prev => {
        const sessionMessages = [...(prev[currentChat.sessionId] || [])];
        const messageIndex = sessionMessages.findIndex(msg => msg.id === tempId);
        
        if (messageIndex !== -1) {
          sessionMessages[messageIndex] = {
            ...sessionMessages[messageIndex],
            pending: false,
            error: true,
            errorMessage: error.message || 'Erro ao enviar mensagem'
          };
        }
        
        return {
          ...prev,
          [currentChat.sessionId]: sessionMessages
        };
      });
      
      // Mostrar mensagem de erro mais amigável
      if (error.message?.includes('Session closed') || error.message?.includes('Protocol error')) {
        alert('A sessão do WhatsApp foi desconectada. Por favor, reconecte sua sessão.');
      } else {
        alert(`Erro ao enviar mensagem: ${error.message || 'Verifique sua conexão'}`);
      }
    }
  };

  const handleSendSelectedFile = async () => {
    if (!currentChat || !currentChat.sessionId || !selectedFile) return;
    const caption = messageText.trim();
    setIsTyping(false);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    const tempId = `local_media_${Date.now()}`;
    const timestamp = Math.floor(Date.now() / 1000);
    const meta = {
      text: caption,
      mediaUrl: selectedFilePreview, // preview local até o servidor confirmar
      mediaMime: selectedFile.type,
      mediaFilename: selectedFile.name,
      messageType: selectedFile.type.split('/')[0]
    };

    const newMessage = {
      id: tempId,
      session_id: currentChat.sessionId,
      from_number: 'me',
      to_number: currentChat.number,
      body: JSON.stringify(meta),
      timestamp,
      is_read: true,
      pending: true
    };

    // Resetar campos de input
    setMessageText('');
    setSelectedFile(null);
    // manter o preview enquanto pendente

    setMessages(prev => {
      const sessionMessages = [...(prev[currentChat.sessionId] || [])];
      sessionMessages.push(newMessage);
      return { ...prev, [currentChat.sessionId]: sessionMessages };
    });
    setTimeout(scrollToBottom, 100);

    try {
      const resp = await sendFile(currentChat.sessionId, currentChat.number, selectedFile, caption);
      setMessages(prev => {
        const sessionMessages = [...(prev[currentChat.sessionId] || [])];
        const idx = sessionMessages.findIndex(m => m.id === tempId);
        if (idx !== -1) {
          sessionMessages[idx] = {
            ...sessionMessages[idx],
            id: resp.messageId || tempId,
            pending: false,
            status: 'sent',
            timestamp: resp.timestamp || timestamp,
            // Atualiza URL para a servida pelo backend, se houver
            body: JSON.stringify({ ...meta, mediaUrl: absoluteMediaUrl(resp?.media?.mediaUrl || meta.mediaUrl) })
          };
        }
        return { ...prev, [currentChat.sessionId]: sessionMessages };
      });
    } catch (error) {
      console.error('Erro ao enviar mídia:', error);
      setMessages(prev => {
        const sessionMessages = [...(prev[currentChat.sessionId] || [])];
        const idx = sessionMessages.findIndex(m => m.id === tempId);
        if (idx !== -1) {
          sessionMessages[idx] = { ...sessionMessages[idx], pending: false, error: true, errorMessage: error.message || 'Erro ao enviar mídia' };
        }
        return { ...prev, [currentChat.sessionId]: sessionMessages };
      });
      alert(`Erro ao enviar arquivo: ${error.message || 'Verifique sua conexão'}`);
    }
  };

  const onAttachClick = () => fileInputRef.current?.click();
  const onFileChange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setSelectedFile(file);
    try {
      const url = URL.createObjectURL(file);
      setSelectedFilePreview(url);
    } catch (_) {
      setSelectedFilePreview(null);
    }
  };
  const removeAttachment = () => {
    setSelectedFile(null);
    if (selectedFilePreview) {
      try { URL.revokeObjectURL(selectedFilePreview); } catch (_) {}
    }
    setSelectedFilePreview(null);
  };
  
  // Obter contatos por status
  const getContactsByStatus = useCallback(() => {
    if (!activeSession) return [];
    
    const statusContacts = contactsByStatus[activeStatusTab][activeSession] || {};
    const sessionContacts = contacts[activeSession] || {};
    const sessionMessages = messages[activeSession] || [];
    
    // Criar um mapa de contatos com suas últimas mensagens
    const contactsMap = {};
    
    // Adicionar contatos do status atual
    Object.values(statusContacts).forEach(contact => {
      // Filtrar o contato 'status' do WhatsApp
      if (contact.number === 'status' || contact.name === 'status') return;
      
      // Verificar se é um grupo baseado em propriedades do contato
      const isGroup = contact.is_group || 
                     contact.isGroup || 
                     (contact.number && contact.number.includes('g.us')) ||
                     (contact.id && contact.id.includes('g.us'));
      
      const key = `${activeSession}_${contact.number}`;
      if (!contactsMap[key]) {
        contactsMap[key] = {
          id: contact.id,
          sessionId: activeSession,
          number: contact.number,
          name: contact.name || contact.number,
          lastMessage: '',
          timestamp: 0,
          unreadCount: 0,
          profilePic: contact.profilePic,
          isGroup: isGroup,
          conversationStatus: contact.conversationStatus || activeStatusTab
        };
      }
    });
    
    // Adicionar contatos do estado geral que correspondem ao status atual
    Object.values(sessionContacts).forEach(contact => {
      // Filtrar o contato 'status' do WhatsApp
      if (contact.number === 'status' || contact.name === 'status') return;
      
      // Verificar se o status do contato corresponde ao status atual
      if (contact.conversationStatus !== activeStatusTab) return;
      
      // Verificar se é um grupo baseado em propriedades do contato
      const isGroup = contact.is_group || 
                     contact.isGroup || 
                     (contact.number && contact.number.includes('g.us')) ||
                     (contact.id && contact.id.includes('g.us'));
      
      const key = `${activeSession}_${contact.number}`;
      if (!contactsMap[key]) {
        contactsMap[key] = {
          id: contact.id,
          sessionId: activeSession,
          number: contact.number,
          name: contact.name || contact.number,
          lastMessage: '',
          timestamp: 0,
          unreadCount: 0,
          profilePic: contact.profilePic,
          isGroup: isGroup,
          conversationStatus: contact.conversationStatus || activeStatusTab
        };
      }
    });
    
    // Processar mensagens para adicionar últimas mensagens e contagens não lidas
    sessionMessages.forEach(msg => {
      if (!msg) return;
      
      let contactNumber = msg.from_number !== 'me' ? msg.from_number : msg.to_number;
      
      // Filtrar o contato 'status'
      if (contactNumber === 'status') return;
      
      const key = `${activeSession}_${contactNumber}`;
      
      if (contactsMap[key]) {
        if (!contactsMap[key].lastMessage || msg.timestamp > contactsMap[key].timestamp) {
          const meta = parseBody(msg.body);
          let preview = meta.text || '';
          if (meta.mediaUrl) {
            if (isImageType(meta)) preview = `[Imagem] ${preview}`.trim();
            else if (isAudioType(meta)) preview = `[Áudio] ${preview}`.trim();
            else preview = `[Arquivo] ${preview}`.trim();
          }
          contactsMap[key].lastMessage = preview || (typeof msg.body === 'string' ? msg.body : '');
          contactsMap[key].timestamp = msg.timestamp;
        }
        
        if (!msg.is_read && msg.from_number !== 'me') {
          contactsMap[key].unreadCount += 1;
        }
      }
    });
    
    return Object.values(contactsMap)
      .filter(contact => {
        // Filtrar por tipo (grupos ou diretas)
        if (activeFilter === 'groups' && !contact.isGroup) return false;
        if (activeFilter === 'direct' && contact.isGroup) return false;
        
        // Filtrar por busca
        if (searchQuery) {
          return contact.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                 (contact.lastMessage && contact.lastMessage.toLowerCase().includes(searchQuery.toLowerCase()));
        }
        return true;
      })
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [activeSession, activeStatusTab, contactsByStatus, contacts, messages, activeFilter, searchQuery]);
  
  // Função para mudar o status de um contato
  const handleChangeStatus = async (contact, newStatus) => {
    if (!contact || !contact.id || !newStatus) return;
    
    try {
      await changeContactStatus(contact.id, newStatus, contact.sessionId, contact.number);
    } catch (err) {
      console.error('Erro ao mudar status do contato:', err);
    }
  };
  
  // Filtrar mensagens do contato atual
  const getCurrentChatMessages = () => {
    if (!currentChat || !currentChat.sessionId || !messages[currentChat.sessionId]) {
      return [];
    }
    
    return messages[currentChat.sessionId]
      .filter(msg => {
        if (!msg) return false;
        
        // Verificar se a mensagem pertence a esta conversa
        const isFromContact = msg.from_number === currentChat.number;
        const isToContact = msg.to_number === currentChat.number;
        
        // Verificar se é uma mensagem enviada pelo usuário para este contato
        const isFromMe = msg.from_number === 'me' && isToContact;
        
        // Verificar se é uma mensagem recebida deste contato
        const isToMe = isFromContact && (msg.to_number === 'me' || !msg.to_number);
        
        // Incluir mensagens de/para este contato
        return isFromContact || isToContact || isFromMe || isToMe;
      })
      .sort((a, b) => a.timestamp - b.timestamp);
  };
  
  // Formatar tempo
  const formatTime = (timestamp) => {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) {
      return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
      return 'Ontem';
    } else if (days < 7) {
      return date.toLocaleDateString('pt-BR', { weekday: 'short' });
    } else {
      return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    }
  };
  
  // Obter iniciais do nome
  const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };
  
  return (
    <div className="chat-container">
      {/* Overlay para mobile */}
      <div 
        className={`mobile-overlay ${sidebarOpen ? 'show' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />
      
      {/* Sidebar */}
      <div className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-title">
            Chats
            <button className="add-chat-btn">
              <PlusIcon />
            </button>
          </div>
          
          <div className="search-container">
            <div className="search-icon">
              <SearchIcon />
            </div>
            <input
              type="text"
              className="search-input"
              placeholder="Pesquisar..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        
        <div className="status-tabs">
          <button 
            className={`status-tab ${activeStatusTab === 'open' ? 'active' : ''}`}
            onClick={() => setActiveStatusTab('open')}
          >
            Em Atendimento
          </button>
          <button 
            className={`status-tab ${activeStatusTab === 'waiting' ? 'active' : ''}`}
            onClick={() => setActiveStatusTab('waiting')}
          >
            Aguardando
          </button>
          <button 
            className={`status-tab ${activeStatusTab === 'resolved' ? 'active' : ''}`}
            onClick={() => setActiveStatusTab('resolved')}
          >
            Resolvidos
          </button>
        </div>
        
        <div className="chat-filters">
          <button 
            className={`filter-btn ${activeFilter === 'all' ? 'active' : ''}`}
            onClick={() => setActiveFilter('all')}
          >
            Todas
          </button>
          <button 
            className={`filter-btn ${activeFilter === 'groups' ? 'active' : ''}`}
            onClick={() => setActiveFilter('groups')}
          >
            Grupos
          </button>
          <button 
            className={`filter-btn ${activeFilter === 'direct' ? 'active' : ''}`}
            onClick={() => setActiveFilter('direct')}
          >
            Diretas
          </button>
        </div>
        
        <div className="conversations-list">
          {getContactsByStatus().map((contact) => (
            <div 
              key={`${contact.sessionId}_${contact.number}`}
              className={`conversation-item ${currentChat?.number === contact.number && currentChat?.sessionId === contact.sessionId ? 'active' : ''}`}
              onClick={() => {
                setCurrentChat(contact);
                if (setActiveSession) {
                  setActiveSession(contact.sessionId);
                }
                setSidebarOpen(false);
              }}
            >
              <div className="conversation-avatar">
                {contact.profilePic ? (
                  <img src={contact.profilePic} alt={contact.name} />
                ) : (
                  getInitials(contact.name)
                )}
              </div>
              
              <div className="conversation-content">
                <div className="conversation-header">
                  <span className="conversation-name">{contact.name}</span>
                  <span className="conversation-time">{formatTime(contact.timestamp)}</span>
                </div>
                <div className="conversation-preview">
                  <span className="conversation-message">{contact.lastMessage}</span>
                  {contact.unreadCount > 0 && (
                    <span className="unread-badge">{contact.unreadCount}</span>
                  )}
                </div>
              </div>
              
              <div className="conversation-actions">
                {activeStatusTab !== 'open' && (
                  <button 
                    className="status-action-btn left"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleChangeStatus(contact, 'open');
                    }}
                    title="Mover para Em Atendimento"
                  >
                    <LeftArrowIcon />
                  </button>
                )}
                
                {activeStatusTab !== 'resolved' && (
                  <button 
                    className="status-action-btn right"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleChangeStatus(contact, 'resolved');
                    }}
                    title="Mover para Resolvidos"
                  >
                    <RightArrowIcon />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {/* Área principal do chat */}
      <div className="chat-main">
        {!currentChat ? (
          <div className="empty-state">
            <div className="empty-state-icon">👋</div>
            <div className="empty-state-title">Selecione uma conversa</div>
            <div className="empty-state-description">
              Escolha uma conversa da lista para começar a enviar mensagens
            </div>
          </div>
        ) : (
          <>
            {/* Header do chat */}
            <div className="chat-header">
              <div className="chat-header-info">
                <button className="mobile-menu-btn header-action-btn" onClick={() => setSidebarOpen(true)}>
                  <MenuIcon />
                </button>
                
                <div className="chat-header-avatar">
                  {currentChat.profilePic ? (
                    <img src={currentChat.profilePic} alt={currentChat.name} />
                  ) : (
                    getInitials(currentChat.name)
                  )}
                </div>
                
                <div className="chat-header-details">
                  <div className="chat-header-name">{currentChat.name}</div>
                  <div className="chat-header-status">
                    <span className="status-dot"></span>
                    Online
                  </div>
                </div>
              </div>
              
              <div className="chat-header-actions">
                <button className="header-action-btn">
                  <PhoneIcon />
                </button>
                <button className="header-action-btn">
                  <VideoIcon />
                </button>
                <button className="header-action-btn">
                  <MoreIcon />
                </button>
              </div>
            </div>
            
            {/* Mensagens */}
            <div className="messages-container">
              {getCurrentChatMessages().map((msg, index) => {
                const isFromMe = msg.from_number === 'me' || msg.from_number !== currentChat.number;
                
                return (
                  <div 
                    key={msg.id || index}
                    className={`message-wrapper ${isFromMe ? 'sent' : 'received'}`}
                  >
                    <div className={`message-bubble ${isFromMe ? 'sent' : 'received'}`}>
                      {(() => {
                        const meta = parseBody(msg.body);
                        const hasMedia = !!meta.mediaUrl;
                        if (hasMedia) {
                          const mediaUrl = absoluteMediaUrl(meta.mediaUrl);
                          return (
                            <div className="message-media">
                              {isImageType(meta) && (
                                <img className="message-image" src={mediaUrl} alt={meta.mediaFilename || 'imagem'} />
                              )}
                              {isAudioType(meta) && (
                                <audio className="message-audio" controls src={mediaUrl} />
                              )}
                              {meta.text && <div className="message-text">{meta.text}</div>}
                            </div>
                          );
                        }
                        return <div className="message-text">{typeof msg.body === 'string' ? msg.body : ''}</div>;
                      })()}
                      <div className="message-time">
                        {formatTime(msg.timestamp)}
                        {isFromMe && !msg.pending && !msg.error && (
                          <span className="message-status">
                            {msg.is_read ? <DoubleCheckIcon /> : <CheckIcon />}
                          </span>
                        )}
                        {msg.pending && <span style={{ fontSize: '12px' }}>⏱</span>}
                        {msg.error && <span style={{ fontSize: '12px', color: '#ef4444' }}>⚠️</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
              
              {/* Indicador de digitação */}
              {isTyping && (
                <div className="message-wrapper received">
                  <div className="message-bubble received">
                    <div className="typing-indicator">
                      <span className="typing-dot"></span>
                      <span className="typing-dot"></span>
                      <span className="typing-dot"></span>
                    </div>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>
            
            {/* Input de mensagem */}
            <div className="message-input-container">
              {selectedFile && (
                <div className="attachment-preview">
                  {selectedFilePreview && selectedFile.type.startsWith('image/') ? (
                    <img className="attachment-image" src={selectedFilePreview} alt="preview" />
                  ) : (
                    <div className="attachment-chip">{selectedFile.name}</div>
                  )}
                  <button className="attachment-remove" onClick={removeAttachment} title="Remover anexo">✕</button>
                </div>
              )}
              <div className="message-input-wrapper">
                <input
                  type="text"
                  className="message-input"
                  placeholder="Digite uma mensagem..."
                  value={messageText}
                  onChange={handleTyping}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleSendMessage();
                    }
                  }}
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,audio/*"
                  style={{ display: 'none' }}
                  onChange={onFileChange}
                />
                
                <div className="input-actions">
                  <button className="input-action-btn" onClick={onAttachClick}>
                    <AttachIcon />
                  </button>
                  <button className="input-action-btn">
                    <EmojiIcon />
                  </button>
                  <button 
                    className="send-btn"
                    onClick={handleSendMessage}
                    disabled={!messageText.trim() && !selectedFile}
                  >
                    <SendIcon />
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ModernLiveChat;
