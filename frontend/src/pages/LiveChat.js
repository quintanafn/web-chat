import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Box, 
  Typography, 
  Paper, 
  List, 
  ListItem, 
  ListItemText, 
  ListItemAvatar, 
  Avatar, 
  TextField, 
  Button, 
  Divider, 
  Grid, 
  IconButton,
  Badge,
  Drawer,
  useMediaQuery,
  useTheme
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import MenuIcon from '@mui/icons-material/Menu';
import CloseIcon from '@mui/icons-material/Close';
import { useAppContext } from '../contexts/AppContext';
import { getMessages, sendMessage, getContactProfilePic } from '../services/api';

const LiveChat = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  
  const { 
    user,
    activeSession, 
    messages, 
    setMessages, 
    contacts,
    setContacts,
    loadContacts,
    loadConversation
  } = useAppContext();
  
  const [currentChat, setCurrentChat] = useState(null);
  const [messageText, setMessageText] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(!isMobile);
  const [isTyping, setIsTyping] = useState(false);
  
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const pendingTimeoutsRef = useRef({});
  
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
      console.log('Buscando foto de perfil para:', contactNumber);
      const profilePicUrl = await getContactProfilePic(sessionId, contactNumber);
      
      if (profilePicUrl) {
        console.log('Foto de perfil encontrada:', profilePicUrl);
        
        // Atualizar o contato no estado
        setContacts(prev => {
          const sessionContacts = prev[sessionId] || {};
          const existing = sessionContacts[contactNumber];
          const existingPic = existing?.profilePic || null;
          if (existingPic === profilePicUrl) {
            return prev; // Nada mudou, evita re-render
          }
          const updatedSession = {
            ...sessionContacts,
            [contactNumber]: {
              ...existing,
              number: contactNumber,
              name: existing?.name || contactNumber,
              profilePic: profilePicUrl
            }
          };
          return {
            ...prev,
            [sessionId]: updatedSession
          };
        });
      }
    } catch (err) {
      console.error('Erro ao atualizar foto de perfil:', err);
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
  
  // Função para lidar com a digitação
  const handleTyping = (e) => {
    setMessageText(e.target.value);
    
    // Definir estado de digitação
    setIsTyping(true);
    
    // Limpar o timeout anterior se existir
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    // Definir um novo timeout para desativar o estado de digitação após 1 segundo
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
    }, 1000);
  };
  
  const handleSendMessage = async () => {
    if (!messageText.trim() || !activeSession || !currentChat) return;
    
    // Desativar estado de digitação
    setIsTyping(false);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    // Criar mensagem local antes da chamada API para garantir feedback imediato
    const tempId = `local_${Date.now()}`;
    const messageContent = messageText.trim();
    const timestamp = Math.floor(Date.now() / 1000);
    
    // Criar objeto de mensagem local
    const newMessage = {
      id: tempId,
      session_id: activeSession,
      from_number: 'me',
      to_number: currentChat.number,
      body: messageContent,
      timestamp: timestamp,
      is_read: true,
      pending: true // Marcar como pendente até confirmação do servidor
    };
    
    // Limpar o campo de mensagem imediatamente para melhor UX
    setMessageText('');
    
    // Atualizar o estado das mensagens com a mensagem local
    setMessages(prev => {
      const sessionMessages = [...(prev[activeSession] || [])];
      sessionMessages.push(newMessage);
      return {
        ...prev,
        [activeSession]: sessionMessages
      };
    });
    
    // Rolar para o final da conversa
    setTimeout(scrollToBottom, 100);
    
    try {
      // Enviar mensagem para o servidor
      const response = await sendMessage(activeSession, currentChat.number, messageContent);
      
      // Atualizar a mensagem com o ID real do servidor
      setMessages(prev => {
        const sessionMessages = [...(prev[activeSession] || [])];
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
          [activeSession]: sessionMessages
        };
      });
      
      console.log('Mensagem enviada com sucesso:', response.messageId);
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
      
      // Marcar a mensagem como falha
      setMessages(prev => {
        const sessionMessages = [...(prev[activeSession] || [])];
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
          [activeSession]: sessionMessages
        };
      });
      
      // Mostrar uma mensagem de erro para o usuário
      alert(`Erro ao enviar mensagem: ${error.message}. Verifique se a sessão do WhatsApp está conectada.`);
    }
  };
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  
  // Agrupar mensagens por contato
  const getContactsWithMessages = () => {
    if (!activeSession || !messages[activeSession]) return [];
    
    const sessionContacts = contacts[activeSession] || {};
    
    const contactsMap = {};
    
    // Primeiro adicionar todos os contatos do banco de dados
    Object.values(sessionContacts).forEach(contact => {
      contactsMap[contact.number] = {
        number: contact.number,
        name: contact.name || contact.number,
        lastMessage: '',
        timestamp: 0,
        unreadCount: 0,
        profilePic: contact.profilePic
      };
    });
    
    // Depois adicionar informações das mensagens
    messages[activeSession].forEach(msg => {
      if (!msg) return;
      // Determinar o número do contato com base nos contatos conhecidos
      let contactNumber = null;
      if (msg.from_number && sessionContacts[msg.from_number]) {
        contactNumber = msg.from_number;
      } else if (msg.to_number && sessionContacts[msg.to_number]) {
        contactNumber = msg.to_number;
      } else {
        // Fallback: usar o remetente, senão o destinatário
        contactNumber = msg.from_number || msg.to_number;
      }
      
      if (!contactsMap[contactNumber]) {
        contactsMap[contactNumber] = {
          number: contactNumber,
          name: sessionContacts[contactNumber]?.name || contactNumber,
          lastMessage: msg.body,
          timestamp: msg.timestamp,
          unreadCount: !msg.is_read ? 1 : 0,
          profilePic: sessionContacts[contactNumber]?.profilePic || null
        };
      } else {
        // Atualizar última mensagem se for mais recente
        if (msg.timestamp > contactsMap[contactNumber].timestamp) {
          contactsMap[contactNumber].lastMessage = msg.body;
          contactsMap[contactNumber].timestamp = msg.timestamp;
        }
        
        // Incrementar contador de não lidas
        if (!msg.is_read) {
          contactsMap[contactNumber].unreadCount += 1;
        }
      }
    });
    
    return Object.values(contactsMap).sort((a, b) => b.timestamp - a.timestamp);
  };
  
  // Filtrar mensagens do contato atual
  const getCurrentChatMessages = () => {
    if (!activeSession || !currentChat || !messages[activeSession]) {
      console.log('Dados insuficientes para exibir mensagens:', {
        activeSession,
        currentChat: currentChat?.number,
        hasMessages: Boolean(messages[activeSession])
      });
      return [];
    }
    
    // Filtrar mensagens que pertencem à conversa atual (envolvem o contato selecionado)
    const chatMessages = messages[activeSession]
      .filter(msg => {
        if (!msg) return false;
        // Considera a mensagem parte da conversa se foi enviada PARA o contato ou recebida DO contato
        return msg.from_number === currentChat.number || msg.to_number === currentChat.number;
      })
      .sort((a, b) => a.timestamp - b.timestamp); // Ordenar por timestamp crescente
    return chatMessages;
  };
  
  const toggleDrawer = () => {
    setDrawerOpen(!drawerOpen);
  };
  
  const drawerWidth = 280;
  
  const renderContactsList = () => (
    <Box sx={{ width: isMobile ? drawerWidth : '100%' }}>
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h6">Conversas</Typography>
        {isMobile && (
          <IconButton onClick={toggleDrawer}>
            <CloseIcon />
          </IconButton>
        )}
      </Box>
      <Divider />
      <List sx={{ overflowY: 'auto', maxHeight: 'calc(100vh - 120px)' }}>
        {getContactsWithMessages().map((contact) => (
          <ListItem 
            component="button"
            key={contact.number}
            selected={currentChat?.number === contact.number}
            onClick={() => {
              console.log('Contato selecionado:', contact);
              // Apenas atualiza o chat atual; os efeitos cuidam de carregar conversa e foto
              setCurrentChat(contact);
              if (isMobile) setDrawerOpen(false);
            }}
          >
            <ListItemAvatar>
              <Badge color="primary" badgeContent={contact.unreadCount} invisible={contact.unreadCount === 0}>
                {contact.profilePic ? (
                  <Avatar 
                    src={contact.profilePic} 
                    alt={contact.name}
                    imgProps={{ 
                      onError: (e) => {
                        console.error('Erro ao carregar imagem:', e);
                        e.target.src = ''; // Limpa a URL com erro
                      }
                    }}
                  >
                    {contact.name[0].toUpperCase()}
                  </Avatar>
                ) : (
                  <Avatar alt={contact.name}>
                    {contact.name[0].toUpperCase()}
                  </Avatar>
                )}
              </Badge>
            </ListItemAvatar>
            <ListItemText 
              primary={contact.name} 
              secondary={contact.lastMessage}
              primaryTypographyProps={{
                noWrap: true,
                style: { fontWeight: contact.unreadCount > 0 ? 'bold' : 'normal' }
              }}
              secondaryTypographyProps={{
                noWrap: true
              }}
            />
          </ListItem>
        ))}
      </List>
    </Box>
  );
  
  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', flexGrow: 1, overflow: 'hidden' }}>
        {/* Barra lateral de contatos */}
        <Drawer
          variant={isMobile ? 'temporary' : 'persistent'}
          anchor="left"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          sx={{
            position: 'relative',
            width: drawerWidth,
            flexShrink: 0,
            '& .MuiDrawer-paper': {
              position: 'relative',
              width: drawerWidth,
              boxSizing: 'border-box',
              border: 'none',
              borderRight: '1px solid rgba(0, 0, 0, 0.12)',
            },
          }}
        >
          {renderContactsList()}
        </Drawer>

        {/* Área principal do chat */}
        <Box
          sx={{
            flexGrow: 1,
            p: 2,
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            overflow: 'hidden',
          }}
        >
          {!activeSession ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
              <Typography variant="h6" color="textSecondary">
                Selecione uma sessão WhatsApp para começar
              </Typography>
            </Box>
          ) : !currentChat ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
              <Typography variant="h6" color="textSecondary">
                Selecione uma conversa para começar
              </Typography>
            </Box>
          ) : (
            <>
              {/* Cabeçalho do chat */}
              <Paper elevation={1} sx={{ p: 2, mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  {isMobile && (
                    <IconButton 
                      edge="start" 
                      sx={{ mr: 2 }} 
                      onClick={toggleDrawer}
                    >
                      <MenuIcon />
                    </IconButton>
                  )}
                  {currentChat.profilePic ? (
                    <Avatar 
                      src={currentChat.profilePic} 
                      alt={currentChat.name}
                      sx={{ width: 48, height: 48, mr: 2 }}
                      imgProps={{ 
                        onError: (e) => {
                          console.error('Erro ao carregar imagem do cabeçalho:', e);
                          e.target.src = ''; // Limpa a URL com erro
                        }
                      }}
                    >
                      {currentChat.name[0].toUpperCase()}
                    </Avatar>
                  ) : (
                    <Avatar 
                      alt={currentChat.name}
                      sx={{ width: 48, height: 48, mr: 2 }}
                    >
                      {currentChat.name[0].toUpperCase()}
                    </Avatar>
                  )}
                  <Box>
                    <Typography variant="h6">{currentChat.name}</Typography>
                    <Typography variant="body2" color="textSecondary">
                      {currentChat.number}
                    </Typography>
                  </Box>
                </Box>
              </Paper>
              
              {/* Mensagens */}
              <Paper 
                elevation={1} 
                sx={{ 
                  p: 2, 
                  mb: 2, 
                  flexGrow: 1, 
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                {getCurrentChatMessages().map((msg, index) => {
                  // Se o remetente é o contato atual, a mensagem veio dele; caso contrário, é minha
                  const isFromMe = msg.from_number !== currentChat.number;
                  
                  return (
                    <Box 
                      key={msg.id || index}
                      sx={{
                        display: 'flex',
                        justifyContent: isFromMe ? 'flex-end' : 'flex-start',
                        mb: 1
                      }}
                    >
                      <Paper
                        elevation={1}
                        className={`message-bubble ${isFromMe ? 'message-sent' : 'message-received'}`}
                        sx={{
                          p: 1,
                          maxWidth: '70%',
                          backgroundColor: isFromMe ? '#dcf8c6' : '#fff',
                          borderRadius: 2,
                          opacity: msg.pending ? 0.7 : 1,
                          border: msg.error ? '1px solid #ff6b6b' : 'none'
                        }}
                      >
                        <Typography variant="body1">{msg.body}</Typography>
                        <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', mt: 0.5 }}>
                          {/* Status da mensagem e timestamp */}
                          <>
                            {(() => {
                              // Determinar qual status exibir
                              if (msg.error) {
                                return (
                                  <Typography 
                                    variant="caption" 
                                    sx={{ mr: 1, color: '#ff6b6b', display: 'flex', alignItems: 'center' }}
                                  >
                                    <span style={{ fontSize: '16px', marginRight: '2px' }}>⚠️</span>
                                    {msg.errorMessage || 'Erro ao enviar'}
                                  </Typography>
                                );
                              } else if (msg.pending) {
                                return (
                                  <Typography 
                                    variant="caption" 
                                    sx={{ mr: 1, fontStyle: 'italic', color: 'text.secondary' }}
                                  >
                                    Enviando...
                                  </Typography>
                                );
                              }
                              return null;
                            })()} 
                            <Typography 
                              variant="caption" 
                              color="textSecondary"
                            >
                              {new Date(msg.timestamp * 1000).toLocaleTimeString()}
                              {msg.is_read && isFromMe && !msg.pending && !msg.error && (
                                <span style={{ marginLeft: '4px', color: '#34B7F1' }}>✓✓</span>
                              )}
                            </Typography>
                          </>
                        </Box>
                      </Paper>
                    </Box>
                  );
                })}
                
                {/* Indicador de digitação */}
                {isTyping && (
                  <Box 
                    sx={{
                      display: 'flex',
                      justifyContent: 'flex-end',
                      mb: 1
                    }}
                  >
                    <Paper
                      elevation={1}
                      sx={{
                        p: 1,
                        px: 2,
                        backgroundColor: '#f0f0f0',
                        borderRadius: 2
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <span className="typing-indicator"><span></span></span>
                      </Box>
                    </Paper>
                  </Box>
                )}
                
                <div ref={messagesEndRef} />
              </Paper>
              
              {/* Campo de entrada de mensagem */}
              <Paper elevation={1} sx={{ p: 2 }}>
                <Grid container spacing={2}>
                  <Grid item xs>
                    <TextField
                      fullWidth
                      placeholder="Digite sua mensagem..."
                      variant="outlined"
                      value={messageText}
                      onChange={handleTyping}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          handleSendMessage();
                        }
                      }}
                    />
                  </Grid>
                  <Grid item>
                    <Button
                      variant="contained"
                      color="primary"
                      endIcon={<SendIcon />}
                      onClick={handleSendMessage}
                      disabled={!messageText.trim()}
                    >
                      Enviar
                    </Button>
                  </Grid>
                </Grid>
              </Paper>
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default LiveChat;