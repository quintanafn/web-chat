import React, { useState } from 'react';
import { 
  Container, 
  Typography, 
  Box, 
  Button, 
  TextField, 
  Card, 
  CardContent, 
  CardActions, 
  Grid, 
  Divider, 
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText
} from '@mui/material';
import { useAppContext } from '../contexts/AppContext';
import { createSession, disconnectSession, deleteSession } from '../services/api';

const Settings = () => {
  const { 
    user, 
    sessions, 
    loadSessions, 
    qrCode, 
    loading, 
    error,
    setActiveSession,
    activeSession
  } = useAppContext();
  
  const [sessionName, setSessionName] = useState('');
  const [showQrDialog, setShowQrDialog] = useState(false);
  const [confirm, setConfirm] = useState({ open: false, type: null, session: null });
  
  const handleCreateSession = async () => {
    if (!sessionName.trim()) return;
    
    try {
      await createSession(user.id, sessionName);
      setShowQrDialog(true);
      setSessionName('');
    } catch (err) {
      console.error('Erro ao criar sessão:', err);
    }
  };
  
  const handleDisconnectSession = async (sessionId) => {
    try {
      await disconnectSession(sessionId);
      if (activeSession === sessionId) setActiveSession(null);
      await loadSessions();
    } catch (err) {
      console.error('Erro ao desconectar sessão:', err);
    }
  };

  const handleDeleteSession = async (sessionId) => {
    try {
      await deleteSession(sessionId);
      if (activeSession === sessionId) setActiveSession(null);
      await loadSessions();
    } catch (err) {
      console.error('Erro ao excluir sessão:', err);
    }
  };

  const openConfirm = (type, session) => setConfirm({ open: true, type, session });
  const closeConfirm = () => setConfirm({ open: false, type: null, session: null });
  const handleConfirm = async () => {
    if (!confirm.session) return;
    if (confirm.type === 'delete') {
      await handleDeleteSession(confirm.session.id);
    } else if (confirm.type === 'disconnect') {
      await handleDisconnectSession(confirm.session.id);
    }
    closeConfirm();
  };
  
  return (
    <Container maxWidth="md">
      <Box my={4}>
        <Typography variant="h4" component="h1" gutterBottom>
          Configurações
        </Typography>
        
        <Box my={3}>
          <Typography variant="h6" gutterBottom>
            Adicionar Novo WhatsApp
          </Typography>
          <Box display="flex" alignItems="center" mb={2}>
            <TextField
              label="Nome da Sessão"
              variant="outlined"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              fullWidth
              margin="normal"
            />
            <Button
              variant="contained"
              color="primary"
              onClick={handleCreateSession}
              disabled={loading || !sessionName.trim()}
              sx={{ ml: 2, height: 56 }}
            >
              {loading ? <CircularProgress size={24} /> : 'Adicionar'}
            </Button>
          </Box>
        </Box>
        
        <Divider sx={{ my: 3 }} />
        
        <Box my={3}>
          <Typography variant="h6" gutterBottom>
            WhatsApps Conectados
          </Typography>
          
          {error && (
            <Typography color="error" variant="body2" paragraph>
              {error}
            </Typography>
          )}
          
          <Grid container spacing={3}>
            {sessions.length === 0 ? (
              <Grid item xs={12}>
                <Typography variant="body1" color="textSecondary">
                  Nenhum WhatsApp conectado. Adicione um novo para começar.
                </Typography>
              </Grid>
            ) : (
              sessions.map((session) => (
                <Grid item xs={12} sm={6} md={4} key={session.id}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="h6" component="h2">
                        {session.name}
                      </Typography>
                      <Typography color="textSecondary">
                        Status: {session.status === 'connected' ? 'Conectado' : 'Desconectado'}
                      </Typography>
                    </CardContent>
                    <CardActions>
                      <Button 
                        size="small" 
                        color="warning"
                        variant="outlined"
                        onClick={() => openConfirm('disconnect', session)}
                      >
                        Desconectar
                      </Button>
                      <Button 
                        size="small" 
                        color="error"
                        variant="contained"
                        onClick={() => openConfirm('delete', session)}
                      >
                        Excluir
                      </Button>
                    </CardActions>
                  </Card>
                </Grid>
              ))
            )}
          </Grid>
        </Box>
      </Box>
      
      {/* Dialog para exibir o QR Code */}
      <Dialog open={showQrDialog} onClose={() => setShowQrDialog(false)}>
        <DialogTitle>Escaneie o QR Code</DialogTitle>
        <DialogContent>
          {qrCode ? (
            <Box display="flex" flexDirection="column" alignItems="center">
              <img 
                src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrCode)}`}
                alt="QR Code para WhatsApp"
                style={{ width: 250, height: 250 }}
              />
              <Typography variant="body2" color="textSecondary" sx={{ mt: 2, textAlign: 'center' }}>
                Abra o WhatsApp no seu celular, vá em Configurações &gt; WhatsApp Web/Desktop e escaneie o QR Code
              </Typography>
            </Box>
          ) : (
            <Box display="flex" justifyContent="center" p={3}>
              <CircularProgress />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowQrDialog(false)}>Fechar</Button>
        </DialogActions>
      </Dialog>

      {/* Dialog de confirmação (Desconectar/Excluir) */}
      <Dialog open={confirm.open} onClose={closeConfirm}>
        <DialogTitle>Confirmar ação</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {confirm.type === 'delete'
              ? `Tem certeza que deseja excluir permanentemente a sessão "${confirm.session?.name}"? Esta ação não pode ser desfeita.`
              : `Deseja desconectar a sessão "${confirm.session?.name}"? Você poderá reconectar depois.`}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeConfirm}>Cancelar</Button>
          {confirm.type === 'delete' ? (
            <Button onClick={handleConfirm} color="error" variant="contained">Excluir</Button>
          ) : (
            <Button onClick={handleConfirm} color="warning" variant="contained">Desconectar</Button>
          )}
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default Settings;
