FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

User node
EXPOSE 3000
CMD ["node", "index.js"]