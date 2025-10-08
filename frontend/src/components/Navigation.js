import React, { useState } from 'react';
import { 
  Typography, 
  Box, 
  IconButton,
  Drawer,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Tooltip,
  useMediaQuery,
  useTheme,
  Badge,
  Avatar,
  Paper
} from '@mui/material';
import { Link, useLocation } from 'react-router-dom';
import MenuIcon from '@mui/icons-material/Menu';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import SettingsIcon from '@mui/icons-material/Settings';
import ChatIcon from '@mui/icons-material/Chat';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import { useAppContext } from '../contexts/AppContext';

const Navigation = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const location = useLocation();
  const { sessions, setActiveSession, activeSession } = useAppContext();
  
  // Estado para controlar se a barra lateral está expandida ou retraída
  const [expanded, setExpanded] = useState(!isMobile);
  
  // Largura da barra lateral quando expandida e retraída
  const drawerWidthExpanded = 240;
  const drawerWidthCollapsed = 60;
  
  const handleSessionSelect = (sessionId) => {
    setActiveSession(sessionId);
  };
  
  const toggleExpanded = () => {
    setExpanded(!expanded);
  };
  
  const navItems = [
    { text: 'Bate-papo ao Vivo', icon: <ChatIcon />, path: '/' },
    { text: 'Configurações', icon: <SettingsIcon />, path: '/settings' }
  ];
  
  // Conteúdo da barra lateral
  const drawerContent = (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}
    >
      {/* Cabeçalho da barra lateral */}
      <Box 
        sx={{ 
          p: expanded ? 2 : 1, 
          display: 'flex', 
          alignItems: 'center',
          justifyContent: expanded ? 'space-between' : 'center'
        }}
      >
        {expanded ? (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <WhatsAppIcon sx={{ mr: 1, color: theme.palette.primary.main }} />
              <Typography variant="subtitle1" noWrap>
                WhatsApp Web
              </Typography>
            </Box>
            <IconButton onClick={toggleExpanded} size="small">
              <ChevronLeftIcon />
            </IconButton>
          </>
        ) : (
          <IconButton onClick={toggleExpanded} size="small">
            <ChevronRightIcon />
          </IconButton>
        )}
      </Box>
      
      <Divider />
      
      {/* Links de navegação */}
      <List sx={{ flexGrow: 0 }}>
        {navItems.map((item) => {
          const isSelected = location.pathname === item.path;
          
          return (
            <ListItem 
              component={Link} 
              key={item.text} 
              to={item.path}
              sx={{
                py: 1,
                minHeight: 48,
                justifyContent: expanded ? 'initial' : 'center',
                backgroundColor: isSelected ? 'rgba(0, 0, 0, 0.08)' : 'transparent',
                '&:hover': {
                  backgroundColor: 'rgba(0, 0, 0, 0.04)'
                }
              }}
            >
              <Tooltip title={expanded ? '' : item.text} placement="right">
                <ListItemIcon 
                  sx={{
                    minWidth: 0,
                    mr: expanded ? 2 : 'auto',
                    justifyContent: 'center',
                    color: isSelected ? theme.palette.primary.main : 'inherit'
                  }}
                >
                  {item.icon}
                </ListItemIcon>
              </Tooltip>
              {expanded && (
                <ListItemText 
                  primary={item.text} 
                  sx={{ opacity: 1 }}
                  primaryTypographyProps={{
                    fontWeight: isSelected ? 'bold' : 'normal'
                  }}
                />
              )}
            </ListItem>
          );
        })}
      </List>
      
      <Divider />
      
      {/* Sessões WhatsApp */}
      <Box sx={{ p: expanded ? 1 : 0.5, flexGrow: 0 }}>
        {expanded && (
          <Typography variant="subtitle2" sx={{ px: 1, py: 0.5 }}>
            Sessões WhatsApp
          </Typography>
        )}
        
        {sessions.length === 0 ? (
          expanded && (
            <Typography variant="body2" color="textSecondary" sx={{ px: 1 }}>
              Nenhuma sessão conectada
            </Typography>
          )
        ) : (
          <List dense sx={{ pt: 0 }}>
            {sessions.map((session) => {
              const isActive = activeSession === session.id;
              const isConnected = session.status === 'connected';
              
              return (
                <ListItem 
                  component="button" 
                  key={session.id}
                  onClick={() => handleSessionSelect(session.id)}
                  sx={{
                    borderRadius: 1,
                    mb: 0.5,
                    backgroundColor: isActive ? 'rgba(0, 0, 0, 0.08)' : 'transparent',
                    justifyContent: expanded ? 'initial' : 'center'
                  }}
                >
                  <Tooltip title={expanded ? '' : session.name} placement="right">
                    <ListItemIcon 
                      sx={{
                        minWidth: 0,
                        mr: expanded ? 2 : 'auto',
                        justifyContent: 'center'
                      }}
                    >
                      <Badge 
                        color={isConnected ? "success" : "error"}
                        variant="dot"
                        overlap="circular"
                      >
                        <Avatar 
                          sx={{ 
                            width: 32, 
                            height: 32,
                            bgcolor: isConnected ? theme.palette.success.light : theme.palette.grey[400]
                          }}
                        >
                          {session.name.charAt(0).toUpperCase()}
                        </Avatar>
                      </Badge>
                    </ListItemIcon>
                  </Tooltip>
                  
                  {expanded && (
                    <ListItemText 
                      primary={session.name}
                      secondary={isConnected ? 'Conectado' : 'Desconectado'}
                      primaryTypographyProps={{
                        variant: 'body2',
                        fontWeight: isActive ? 'bold' : 'normal',
                        noWrap: true
                      }}
                      secondaryTypographyProps={{
                        variant: 'caption',
                        noWrap: true
                      }}
                    />
                  )}
                </ListItem>
              );
            })}
          </List>
        )}
      </Box>
    </Box>
  );
  
  return (
    <>
      {/* Barra lateral permanente */}
      <Drawer
        variant="permanent"
        sx={{
          width: expanded ? drawerWidthExpanded : drawerWidthCollapsed,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: expanded ? drawerWidthExpanded : drawerWidthCollapsed,
            boxSizing: 'border-box',
            borderRight: '1px solid rgba(0, 0, 0, 0.12)',
            transition: theme.transitions.create(['width'], {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.enteringScreen,
            }),
            overflowX: 'hidden',
          },
        }}
      >
        {drawerContent}
      </Drawer>

      {/* Botão flutuante para expandir/retrair em dispositivos móveis */}
      {isMobile && !expanded && (
        <Paper
          elevation={3}
          sx={{
            position: 'fixed',
            bottom: 16,
            left: 16,
            zIndex: 1300,
            borderRadius: '50%',
            overflow: 'hidden',
          }}
        >
          <IconButton
            color="primary"
            onClick={toggleExpanded}
            sx={{ p: 1 }}
          >
            <MenuIcon />
          </IconButton>
        </Paper>
      )}
    </>
  );
};

export default Navigation;
