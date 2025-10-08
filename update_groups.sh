#!/bin/bash

# Adicionar suporte para grupos em todas as ocorrências de contactData no server.js

# 1. Evento de mensagem (linha ~209)
sed -i '' '208s/\/\/ Salvar ou atualizar o contato/\/\/ Verificar se é um grupo\n        const isGroup = chat.isGroup;\n        \n        \/\/ Salvar ou atualizar o contato/' /Users/joaoquintana/Apps/web-chat/backend/server.js

sed -i '' '214s/profile_pic_url: profilePicUrl/profile_pic_url: profilePicUrl,\n          is_group: isGroup/' /Users/joaoquintana/Apps/web-chat/backend/server.js

# 2. Evento message_create (linha ~272)
sed -i '' '277s/profile_pic_url: profilePicUrl/profile_pic_url: profilePicUrl,\n            is_group: chat.isGroup || false/' /Users/joaoquintana/Apps/web-chat/backend/server.js

# 3. Rota de contato-profile (linha ~844)
sed -i '' '847s/profile_pic_url: profilePicUrl/profile_pic_url: profilePicUrl,\n          is_group: false/' /Users/joaoquintana/Apps/web-chat/backend/server.js

echo "Atualizações concluídas!"
