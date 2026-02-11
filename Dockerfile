# Usa uma versão leve do Node.js
FROM node:18-alpine

# Cria o diretório de trabalho dentro do container
WORKDIR /usr/src/app

# Copia os arquivos de dependências
COPY package*.json ./

# Instala as dependências (incluindo pg e redis)
RUN npm install --production

# Copia o restante do código
COPY . .

# Expõe a porta que o seu app.js usa
EXPOSE 3000

# Comando para iniciar o servidor
CMD ["node", "app.js"]