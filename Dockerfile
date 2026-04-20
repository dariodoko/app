FROM node:24-alpine

WORKDIR /app

COPY package.json ./
COPY server.js ./
COPY index.html ./
COPY style.css ./
COPY app.js ./
COPY data ./data

ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "start"]
