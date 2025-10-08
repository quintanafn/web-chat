import React, { useState, useEffect } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { createSession, getSessions, disconnectSession, reconnectSession, deleteSession } from '../services/api';
import QRCode from 'react-qr-code';
import '../styles/NavigationStyles.css';

// Ícones
const ChatIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" fill="currentColor"/>
  </svg>
);

const SettingsIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 15.5A3.5 3.5 0 0 1 8.5 12A3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5a3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.64.07-.97c0-.33-.03-.65-.07-.97l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.39-1.06-.73-1.69-.98l-.37-2.65A.506.506 0 0 0 14 2h-4c-.25 0-.46.18-.5.42l-.37 2.65c-.63.25-1.17.59-1.69.98l-2.49-1c-.22-.08-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64L4.57 11c-.04.32-.07.64-.07.97c0 .33.03.65.07.97l-2.11 1.63c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.39 1.06.73 1.69.98l.37 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.37-2.65c.63-.25 1.17-.59 1.69-.98l2.49 1c.22.08.49 0 .61-.22l2-3.46c.13-.22.07-.49-.12-.64l-2.11-1.63Z" fill="currentColor"/>
  </svg>
);

const PlusIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M10 5v10M5 10h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

const LogoutIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" fill="currentColor"/>
  </svg>
);

const CheckCircleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="10" cy="10" r="8" fill="#10b981"/>
    <path d="M7 10l2 2 4-4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M15 5L5 15M5 5l10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

const RefreshIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M17.5 10a7.5 7.5 0 01-7.5 7.5v0a7.5 7.5 0 01-7.5-7.5v0a7.5 7.5 0 017.5-7.5v0" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    <path d="M10 2.5V5m0-2.5l2.5 2.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const TrashIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M2.5 5h15M6.5 5V3.5a1 1 0 011-1h5a1 1 0 011 1V5M8 9v6m4-6v6M4 5l.8 10.5a2 2 0 002 1.5h6.4a2 2 0 002-1.5L16 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const PowerIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M10 2v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    <path d="M6.34 4.34a7 7 0 108.32 8.32 7 7 0 00-8.32-8.32z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

const ModernNavigation = () => {
  const { 
    user,
    sessions, 
    activeSession, 
    setActiveSession, 
    qrCode, 
    setQrCode,
    loadSessions 
  } = useAppContext();
  
  const [showNewSession, setShowNewSession] = useState(false);
  const [sessionName, setSessionName] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('chat');
  
  useEffect(() => {
    if (user?.id) {
      loadSessions();
    }
  }, [user, loadSessions]);
  
  const handleCreateSession = async () => {
    if (!sessionName.trim() || !user?.id) return;
    
    setLoading(true);
    try {
      await createSession(user.id, sessionName);
      setSessionName('');
      setShowNewSession(false);
      await loadSessions();
    } catch (error) {
      console.error('Erro ao criar sessão:', error);
      alert('Erro ao criar sessão. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };
  
  const handleDisconnectSession = async (sessionId) => {
    if (!window.confirm('Deseja desconectar esta sessão?')) return;
    
    try {
      await disconnectSession(sessionId);
      if (activeSession === sessionId) {
        setActiveSession(null);
      }
      await loadSessions();
    } catch (error) {
      console.error('Erro ao desconectar sessão:', error);
      alert('Erro ao desconectar sessão: ' + (error.message || 'Erro desconhecido'));
    }
  };
  
  const handleReconnectSession = async (sessionId) => {
    try {
      setLoading(true);
      const response = await reconnectSession(sessionId);
      alert(response.message || 'Reconexão iniciada. Aguarde a autenticação.');
      await loadSessions();
    } catch (error) {
      console.error('Erro ao reconectar sessão:', error);
      alert('Erro ao reconectar sessão: ' + (error.message || 'Erro desconhecido'));
    } finally {
      setLoading(false);
    }
  };
  
  const handleDeleteSession = async (sessionId) => {
    if (!window.confirm('Tem certeza que deseja EXCLUIR esta sessão? Esta ação não pode ser desfeita.')) return;
    
    try {
      setLoading(true);
      await deleteSession(sessionId);
      if (activeSession === sessionId) {
        setActiveSession(null);
      }
      await loadSessions();
      alert('Sessão excluída com sucesso!');
    } catch (error) {
      console.error('Erro ao excluir sessão:', error);
      alert('Erro ao excluir sessão: ' + (error.message || 'Erro desconhecido'));
    } finally {
      setLoading(false);
    }
  };
  
  const getSessionStatus = (session) => {
    if (session.status === 'connected') {
      return { color: '#10b981', text: 'Conectado' };
    } else if (session.status === 'authenticated') {
      return { color: '#f59e0b', text: 'Autenticando...' };
    } else if (session.status === 'initializing') {
      return { color: '#3b82f6', text: 'Inicializando...' };
    } else {
      return { color: '#ef4444', text: 'Desconectado' };
    }
  };
  
  return (
    <div className="modern-navigation">
      {/* Logo/Header */}
      <div className="nav-header">
        <div className="nav-logo">
          <div className="logo-icon">W</div>
          <span className="logo-text">WebChat</span>
        </div>
      </div>
      
      {/* Menu de navegação */}
      <div className="nav-menu">
        <button 
          className={`nav-item ${activeTab === 'chat' ? 'active' : ''}`}
          onClick={() => setActiveTab('chat')}
        >
          <ChatIcon />
          <span>Chat</span>
        </button>
        
        <button 
          className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          <SettingsIcon />
          <span>Configurações</span>
        </button>
      </div>
      
      {/* Sessões */}
      <div className="nav-sessions">
        <div className="sessions-header">
          <h3>Sessões WhatsApp</h3>
          <button 
            className="add-session-btn"
            onClick={() => setShowNewSession(!showNewSession)}
          >
            <PlusIcon />
          </button>
        </div>
        
        {/* Formulário de nova sessão */}
        {showNewSession && (
          <div className="new-session-form">
            <input
              type="text"
              placeholder="Nome da sessão"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') handleCreateSession();
              }}
              className="session-input"
            />
            <div className="form-actions">
              <button 
                className="btn-primary"
                onClick={handleCreateSession}
                disabled={loading || !sessionName.trim()}
              >
                {loading ? 'Criando...' : 'Criar'}
              </button>
              <button 
                className="btn-secondary"
                onClick={() => {
                  setShowNewSession(false);
                  setSessionName('');
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
        
        {/* Lista de sessões */}
        <div className="sessions-list">
          {sessions.map((session) => {
            const status = getSessionStatus(session);
            return (
              <div 
                key={session.id}
                className={`session-item ${activeSession === session.id ? 'active' : ''}`}
                onClick={() => setActiveSession(session.id)}
              >
                <div className="session-info">
                  <div className="session-name">{session.name}</div>
                  <div className="session-status" style={{ color: status.color }}>
                    <span className="status-dot" style={{ background: status.color }}></span>
                    {status.text}
                  </div>
                </div>
                
                <div className="session-actions">
                  {session.status === 'connected' ? (
                    <button 
                      className="session-action"
                      title="Desconectar"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDisconnectSession(session.id);
                      }}
                    >
                      <PowerIcon />
                    </button>
                  ) : (
                    <button 
                      className="session-action"
                      title="Reconectar"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleReconnectSession(session.id);
                      }}
                      disabled={loading}
                    >
                      <RefreshIcon />
                    </button>
                  )}
                  
                  <button 
                    className="session-action session-action-delete"
                    title="Excluir sessão"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteSession(session.id);
                    }}
                    disabled={loading}
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
            );
          })}
          
          {sessions.length === 0 && (
            <div className="empty-sessions">
              <p>Nenhuma sessão criada</p>
              <small>Clique em + para adicionar</small>
            </div>
          )}
        </div>
      </div>
      
      {/* Modal de QR Code */}
      {qrCode && (
        <div className="qr-modal">
          <div className="qr-modal-content">
            <div className="qr-modal-header">
              <h3>Escaneie o QR Code</h3>
              <button onClick={() => setQrCode(null)}>
                <CloseIcon />
              </button>
            </div>
            <div className="qr-code-container">
              <QRCode value={qrCode} size={256} />
            </div>
            <p className="qr-instructions">
              Abra o WhatsApp no seu telefone e escaneie este código
            </p>
          </div>
        </div>
      )}
      
      {/* Footer/User */}
      <div className="nav-footer">
        <div className="user-info">
          <div className="user-avatar">
            {user?.name?.[0]?.toUpperCase() || 'U'}
          </div>
          <div className="user-details">
            <span className="user-name">{user?.name || 'Usuário'}</span>
            <span className="user-status">Online</span>
          </div>
        </div>
        
        <button className="logout-btn">
          <LogoutIcon />
        </button>
      </div>
    </div>
  );
};

export default ModernNavigation;
