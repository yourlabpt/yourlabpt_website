FROM node:20-alpine

WORKDIR /app

# Install workspace root dependencies (multer, etc.) needed by projects/api.js
COPY package.json ./
RUN npm install --omit=dev

# Install server dependencies
COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm install --omit=dev

# Copy the rest of the workspace
COPY . .

WORKDIR /app/server

EXPOSE 3000

CMD ["node", "server.js"]
