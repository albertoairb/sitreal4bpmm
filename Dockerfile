# Railway pode usar Nixpacks, mas Dockerfile ajuda quando necessário
FROM node:20-alpine

WORKDIR /app
COPY backend/package.json backend/package-lock.json* ./backend/
RUN cd backend && npm install --omit=dev

COPY backend ./backend
WORKDIR /app/backend

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "start"]
