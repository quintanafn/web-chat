const fs = require('fs');
const path = require('path');

// Caminho para o arquivo server.js
const serverFilePath = path.join(__dirname, 'backend', 'server.js');

// Ler o conteúdo do arquivo
let content = fs.readFileSync(serverFilePath, 'utf8');

// 1. Adicionar is_group no evento de mensagem (linha ~217)
content = content.replace(
  'profile_pic_url: profilePicUrl\n        };',
  'profile_pic_url: profilePicUrl,\n          is_group: isGroup\n        };'
);

// 2. Adicionar is_group no evento message_create (linha ~280)
content = content.replace(
  'profile_pic_url: profilePicUrl\n          };',
  'profile_pic_url: profilePicUrl,\n            is_group: chat.isGroup || false\n          };'
);

// 3. Adicionar is_group na rota de contato-profile
content = content.replace(
  'profile_pic_url: profilePicUrl\n      };',
  'profile_pic_url: profilePicUrl,\n        is_group: false\n      };'
);

// Escrever o conteúdo modificado de volta no arquivo
fs.writeFileSync(serverFilePath, content, 'utf8');

console.log('Atualizações concluídas com sucesso!');
