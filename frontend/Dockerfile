# Dev-mode image: runs `next dev` against a bind-mounted source tree (see
# docker-compose.yml) so code edits hot-reload without rebuilding the image.
# Only `npm install` needs a rebuild (i.e. when package.json changes).
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]